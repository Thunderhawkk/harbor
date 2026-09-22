import {
  Expand,
  Maximize2,
  Pause,
  Play,
  Volume2,
  VolumeX,
  X,
  LoaderCircle,
  Minus,
  PictureInPicture2,
} from "lucide-react";
import { useT } from "@/lib/i18n";
import type { PlayerBridge, PlayerSnapshot } from "@/lib/player/bridge";
import type { PlayerSrc } from "@/lib/view";
import { useDockAudio } from "./use-dock-audio";
import "./dock.css";

export function SportsDockControls({
  src,
  snap,
  bridge,
  minimized,
  onMinimize,
  onPlayPause,
  onClose,
  onExpand,
  onFullscreen,
}: {
  src: PlayerSrc;
  snap: PlayerSnapshot;
  bridge: PlayerBridge | null;
  minimized: boolean;
  onMinimize: () => void;
  onPlayPause: () => void;
  onClose: () => void;
  onExpand: () => void;
  onFullscreen: () => void;
}) {
  const t = useT();
  const audio = useDockAudio(bridge, snap);
  const loading = snap.status === "idle" || snap.status === "loading" || snap.buffering;
  return (
    <div className="sports-dock-chrome">
      <header>
        <span>
          <strong>{src.title}</strong>
          <small>
            {minimized
              ? t(
                  loading
                    ? "Connecting to your stream…"
                    : snap.status === "error"
                      ? "This stream could not be played."
                      : "Audio only",
                )
              : src.subtitle}
          </small>
        </span>
        <button
          onClick={onMinimize}
          aria-label={t(minimized ? "Restore video" : "Minimize player")}
          title={t(minimized ? "Restore video" : "Minimize player")}
        >
          {minimized ? <PictureInPicture2 size={18} /> : <Minus size={18} />}
        </button>
        <button onClick={onClose} aria-label={t("Close player")}>
          <X size={18} />
        </button>
      </header>
      {!minimized && loading && (
        <div className="sports-dock-status" role="status">
          <LoaderCircle className="sports-dock-spinner" size={30} />
          <span>{t("Connecting to your stream…")}</span>
        </div>
      )}
      {!minimized && snap.status === "error" && (
        <div className="sports-dock-status" role="alert">
          <strong>{t("This stream could not be played.")}</strong>
          <span>{t("Check your source or try another channel.")}</span>
          <button onClick={onClose}>{t("Choose another source")}</button>
        </div>
      )}
      <footer>
        <button onClick={onPlayPause} aria-label={t(snap.status === "playing" ? "Pause" : "Play")}>
          {snap.status === "playing" ? <Pause size={20} /> : <Play size={20} />}
        </button>
        <button
          onClick={audio.toggleMute}
          aria-pressed={audio.muted}
          aria-label={t(audio.muted ? "Unmute" : "Mute")}
        >
          {audio.muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
        </button>
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={audio.volume}
          aria-label={t("Volume")}
          onChange={(e) => audio.changeVolume(Number(e.target.value))}
        />
        <span className="sports-dock-live">{t(src.isLive ? "Live" : "Video")}</span>
        <button
          onClick={onExpand}
          aria-label={t("Expand player and controls")}
          title={t("Expand player and controls")}
        >
          <Expand size={18} />
        </button>
        <button onClick={onFullscreen} aria-label={t("Fullscreen")}>
          <Maximize2 size={18} />
        </button>
      </footer>
      {!minimized && snap.subText && <p className="sports-dock-subtitle">{snap.subText}</p>}
    </div>
  );
}
