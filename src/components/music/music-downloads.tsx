import { useState } from "react";
import { FolderOpen, Trash2, X, Plus, RotateCcw, Play } from "lucide-react";
import { useT } from "@/lib/i18n";
import {
  deleteMusicDownload,
  downloadMusic,
  downloadedMusicTrack,
  revealMusicDownload,
  useMusicDownloads,
  type MusicDownload,
} from "@/lib/music/downloads";
import { playMusic, closeMusicPlayer, getMusicState } from "@/lib/music/player";
import { useMusicPlaylistPicker } from "./music-playlist-picker";
import { Poster } from "@/components/poster";
export function MusicDownloads({ query = "" }: { query?: string }) {
  const t = useT(),
    entries = useMusicDownloads(),
    { openPlaylistPicker } = useMusicPlaylistPicker();
  const [error, setError] = useState(false);
  const [working, setWorking] = useState<string | null>(null);
  const shown = entries
    .filter((entry) =>
      `${entry.track.title} ${entry.track.artist} ${entry.track.album ?? ""}`
        .toLowerCase()
        .includes(query.toLowerCase()),
    )
    .sort(
      (a, b) =>
        a.track.artist.localeCompare(b.track.artist) ||
        (a.track.album ?? "").localeCompare(b.track.album ?? "") ||
        a.track.title.localeCompare(b.track.title),
    );
  const run = async (id: string, action: () => Promise<unknown>) => {
    setError(false);
    setWorking(id);
    try {
      await action();
    } catch {
      setError(true);
    } finally {
      setWorking(null);
    }
  };
  const play = async (entry: MusicDownload) => {
    const track = await downloadedMusicTrack(entry);
    const rest = await Promise.all(
      shown
        .filter((item) => item.status === "done" && item.id !== entry.id)
        .map((item) => downloadedMusicTrack(item).catch(() => null)),
    );
    await playMusic(track, [track, ...rest.filter((item) => item !== null)]);
  };
  return (
    <section className="music-downloads">
      {error && <p role="alert">{t("music.download.failed")}</p>}
      {!shown.length && <p className="music-library-empty">{t("music.download.empty")}</p>}
      {shown.map((entry) => (
        <div key={entry.id} className="music-download-row">
          <button
            type="button"
            disabled={entry.status !== "done" || !!working}
            onClick={() => void run(entry.id, () => play(entry))}
            aria-label={`${t("music.play")} · ${entry.track.title}`}
          >
            <Poster src={entry.track.artwork} seed={entry.id} ratio="square" className="size-12" />
          </button>
          <div className="min-w-0 flex-1">
            <strong className="block truncate">{entry.track.title}</strong>
            <small>
              {entry.track.artist}
              {entry.track.album ? ` · ${entry.track.album}` : ""}
            </small>
            <small className="block">
              {t(
                entry.status === "done"
                  ? "music.download.done"
                  : entry.status === "error"
                    ? (entry.error ?? "music.download.failed")
                    : "music.download.busy",
              )}
              {entry.status === "downloading"
                ? ` ${Math.round(entry.progress * 100)}%`
                : entry.bytes
                  ? ` · ${(entry.bytes / 1048576).toFixed(1)} MB`
                  : ""}
            </small>
            {entry.status === "downloading" && <progress max={1} value={entry.progress} />}
          </div>
          {entry.status === "done" && (
            <>
              <button
                aria-label={t("music.play")}
                title={t("music.play")}
                onClick={() => void run(entry.id, () => play(entry))}
              >
                <Play size={17} />
              </button>
              <button
                aria-label={t("music.card.addToPlaylist")}
                title={t("music.card.addToPlaylist")}
                onClick={() =>
                  void run(entry.id, async () =>
                    openPlaylistPicker(await downloadedMusicTrack(entry)),
                  )
                }
              >
                <Plus size={17} />
              </button>
              <button
                aria-label={t("music.download.folder")}
                title={t("music.download.folder")}
                onClick={() => void run(entry.id, () => revealMusicDownload(entry.id))}
              >
                <FolderOpen size={17} />
              </button>
            </>
          )}
          {entry.status === "error" && (
            <button
              aria-label={t("music.download.retry")}
              title={t("music.download.retry")}
              onClick={() => void downloadMusic(entry.track)}
            >
              <RotateCcw size={17} />
            </button>
          )}
          <button
            disabled={!!working}
            aria-label={t(
              entry.status === "downloading" ? "common.cancel" : "music.download.delete",
            )}
            title={t(entry.status === "downloading" ? "common.cancel" : "music.download.delete")}
            onClick={() =>
              void run(entry.id, async () => {
                if (getMusicState().current?.id === `download:${entry.id}`)
                  await closeMusicPlayer();
                await deleteMusicDownload(entry.id);
              })
            }
          >
            {entry.status === "downloading" ? <X size={17} /> : <Trash2 size={17} />}
          </button>
        </div>
      ))}
    </section>
  );
}
