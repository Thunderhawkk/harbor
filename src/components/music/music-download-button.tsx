import { Download, Check, LoaderCircle, RotateCcw } from "lucide-react";
import { useT } from "@/lib/i18n";
import { downloadMusic, musicDownloadFor, useMusicDownloads } from "@/lib/music/downloads";
import type { MusicTrack } from "@/lib/music/types";
export function MusicDownloadButton({
  track,
  className = "music-dock-icon",
}: {
  track: MusicTrack;
  className?: string;
}) {
  const t = useT();
  useMusicDownloads();
  const entry = musicDownloadFor(track);
  if (track.connectorId === "local") return null;
  const busy = entry?.status === "downloading",
    done = entry?.status === "done";
  const label = t(
    done
      ? "music.download.done"
      : busy
        ? "music.download.busy"
        : entry?.status === "error"
          ? "music.download.retry"
          : "music.download.action",
  );
  return (
    <button
      type="button"
      className={className}
      disabled={busy || done || track.connectorId === "spotify"}
      title={track.connectorId === "spotify" ? t("music.download.unsupported") : label}
      aria-label={label}
      onClick={() => void downloadMusic(track).catch(() => {})}
    >
      {busy ? (
        <LoaderCircle size={18} className="animate-spin motion-reduce:animate-none" />
      ) : done ? (
        <Check size={18} />
      ) : entry?.status === "error" ? (
        <RotateCcw size={18} />
      ) : (
        <Download size={18} />
      )}
      <span className="sr-only">{label}</span>
      {busy && entry.progress > 0 && <small>{Math.round(entry.progress * 100)}%</small>}
    </button>
  );
}
