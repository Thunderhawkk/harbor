import { useSyncExternalStore } from "react";
import { invoke } from "@tauri-apps/api/core";
import { appDataDir, join } from "@tauri-apps/api/path";
import { exists, mkdir, remove } from "@tauri-apps/plugin-fs";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { startDownload, type DownloadHandle } from "@/lib/download/video-download";
import { readMusicPreference, writeMusicPreference } from "./preferences";
import type { MusicTrack, MusicSourceCandidate } from "./types";

export type MusicDownload = {
  id: string;
  track: MusicTrack;
  status: "downloading" | "done" | "error";
  progress: number;
  bytes: number;
  error?: string;
  added: number;
};
const KEY = "harbor.music.downloads.v1";
const listeners = new Set<() => void>();
const handles = new Map<string, DownloadHandle>();
const jobs = new Map<string, Promise<void>>();
const canceled = new Set<string>();
let entries: MusicDownload[] = [];
try {
  entries = JSON.parse(readMusicPreference(KEY) || "[]")
    .filter((entry: MusicDownload) => /^[a-f0-9-]{36}$/.test(entry.id) && entry.track?.id)
    .map((entry: MusicDownload) => ({
      ...entry,
      status: entry.status === "done" ? "done" : "error",
    }));
} catch {
  /* Empty first-run library. */
}
function publish() {
  entries = [...entries];
  writeMusicPreference(KEY, JSON.stringify(entries));
  listeners.forEach((listener) => listener());
}
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
export const useMusicDownloads = () =>
  useSyncExternalStore(
    subscribe,
    () => entries,
    () => entries,
  );
export const musicDownloadFor = (track: MusicTrack) =>
  entries.find(
    (entry) => entry.track.id === track.id && entry.track.connectorId === track.connectorId,
  );
export async function musicDownloadPath(id: string) {
  if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error("Invalid download");
  return join(await appDataDir(), "music-downloads", `${id}.audio`);
}
export async function downloadedMusicTrack(entry: MusicDownload): Promise<MusicTrack> {
  const path = await musicDownloadPath(entry.id);
  if (entry.status !== "done" || !(await exists(path))) {
    entry.status = "error";
    entry.error = "music.download.missing";
    publish();
    throw new Error("music.download.missing");
  }
  return {
    ...entry.track,
    id: `download:${entry.id}`,
    connectorId: "local",
    sourceId: path,
    playbackUrl: path,
    mediaKind: "audio",
  };
}
export async function downloadMusic(track: MusicTrack): Promise<void> {
  const prior = musicDownloadFor(track);
  if (prior?.status === "downloading" || prior?.status === "done") return;
  if (track.connectorId === "spotify" || track.connectorId === "local")
    throw new Error("music.download.unsupported");
  const id = prior?.id ?? crypto.randomUUID();
  const { playbackUrl: _url, ...metadata } = track;
  const entry: MusicDownload = {
    id,
    track: metadata,
    status: "downloading",
    progress: 0,
    bytes: 0,
    added: Date.now(),
  };
  entries = [...entries.filter((item) => item.id !== id), entry];
  publish();
  const job = (async () => {
    try {
      let source = track;
      if (track.connectorId === "catalog") {
        const candidates = await invoke<MusicSourceCandidate[]>("music_source_candidates", {
          track,
        });
        const preferred = readMusicPreference("harbor.music.preferred-source.v1");
        const playable = candidates.filter(
          (candidate) =>
            !["spotify", "catalog"].includes(candidate.connectorId) &&
            candidate.health !== "offline",
        );
        const candidate =
          playable.find((candidate) => candidate.connectorId === preferred) ?? playable[0];
        if (!candidate) throw new Error("music.download.unsupported");
        source = candidate.track;
      }
      const stream = await invoke<{
        url: string;
        mimeType?: string;
        httpHeaders?: Record<string, string>;
      }>("music_resolve_stream", { track: source });
      if (canceled.has(id)) return;
      if (
        !/^https?:\/\//i.test(stream.url) ||
        /(?:mpegurl|dash\+xml)/i.test(stream.mimeType ?? "") ||
        /\.m3u8(?:[?#]|$)/i.test(stream.url)
      )
        throw new Error("music.download.unsupported");
      await mkdir(await join(await appDataDir(), "music-downloads"), { recursive: true });
      const path = await musicDownloadPath(id);
      if (canceled.has(id)) return;
      // A freshly resolved URL may use a different rendition; never append to an older one.
      if (await exists(`${path}.part`)) await remove(`${path}.part`);
      if (canceled.has(id)) return;
      const handle = startDownload(
        `music:${id}`,
        stream.url,
        path,
        (progress) => {
          entry.progress = progress.ratio;
          entry.bytes = progress.receivedBytes;
          publish();
        },
        stream.httpHeaders,
        "audio",
      );
      handles.set(id, handle);
      await handle.promise;
      if (!canceled.has(id)) {
        entry.status = "done";
        entry.progress = 1;
        publish();
      }
    } catch (error) {
      if (!canceled.has(id)) {
        entry.status = "error";
        entry.error =
          error instanceof Error && error.message.startsWith("music.download.")
            ? error.message
            : "music.download.failed";
        publish();
      }
    } finally {
      handles.delete(id);
      jobs.delete(id);
    }
  })();
  jobs.set(id, job);
  await job;
}
export async function deleteMusicDownload(id: string): Promise<void> {
  canceled.add(id);
  handles.get(id)?.abort();
  await jobs.get(id);
  try {
    const path = await musicDownloadPath(id);
    if (await exists(path)) await remove(path);
    if (await exists(`${path}.part`)) await remove(`${path}.part`);
    entries = entries.filter((entry) => entry.id !== id);
    publish();
  } finally {
    canceled.delete(id);
  }
}
export async function revealMusicDownload(id: string) {
  await revealItemInDir(await musicDownloadPath(id));
}
