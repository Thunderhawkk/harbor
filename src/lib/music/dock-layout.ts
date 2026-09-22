import { useSyncExternalStore } from "react";
import { readMusicPreference, writeMusicPreference } from "./preferences";

const KEY = "harbor.music.docklayout.v1";

export type MusicDockPart =
  | "shuffle"
  | "repeat"
  | "quality"
  | "source"
  | "time"
  | "queue"
  | "like"
  | "volume"
  | "cast"
  | "audio"
  | "download";

export type MusicDockLayout = Record<MusicDockPart, boolean>;

export const MUSIC_DOCK_PARTS: MusicDockPart[] = [
  "shuffle",
  "repeat",
  "quality",
  "source",
  "time",
  "queue",
  "like",
  "volume",
  "cast",
  "audio",
  "download",
];

export const MUSIC_DOCK_PART_LABELS: Record<MusicDockPart, string> = {
  shuffle: "music.transport.shuffle",
  repeat: "music.transport.repeat",
  quality: "music.dock.part.quality",
  source: "music.dock.part.source",
  time: "music.dock.part.time",
  queue: "music.dock.part.queue",
  like: "music.dock.part.like",
  volume: "music.volume",
  cast: "music.cast.title",
  audio: "music.audio.title",
  download: "music.download.action",
};

function defaults(): MusicDockLayout {
  return {
    shuffle: true,
    repeat: true,
    quality: true,
    source: true,
    time: true,
    queue: true,
    like: true,
    volume: true,
    cast: true,
    audio: true,
    download: true,
  };
}

function read(): MusicDockLayout {
  const base = defaults();
  try {
    const value = JSON.parse(readMusicPreference(KEY) ?? "{}") as Partial<
      Record<MusicDockPart, unknown>
    >;
    for (const part of MUSIC_DOCK_PARTS) if (value[part] === false) base[part] = false;
    return base;
  } catch {
    return defaults();
  }
}

let layout = read();
const listeners = new Set<() => void>();

export function setMusicDockLayout(patch: Partial<MusicDockLayout>): void {
  layout = { ...layout, ...patch };
  writeMusicPreference(KEY, JSON.stringify(layout));
  listeners.forEach((listener) => listener());
}

export function resetMusicDockLayout(): void {
  layout = defaults();
  writeMusicPreference(KEY, JSON.stringify(layout));
  listeners.forEach((listener) => listener());
}

export function useMusicDockLayout(): MusicDockLayout {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    () => layout,
    () => layout,
  );
}
