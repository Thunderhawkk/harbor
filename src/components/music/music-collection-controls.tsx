import { LoaderCircle, Pause, Play, Shuffle } from "lucide-react";
import { useT } from "@/lib/i18n";
import { toggleMusicPlayback, useMusicPlayer } from "@/lib/music/player";
import type { MusicTrack } from "@/lib/music/types";
import { toggleMusicShuffle, useMusicTransport } from "./music-queue";
import "./music-collection-controls.css";
const identity = (track: MusicTrack) =>
  `${track.collectionOrigin?.connectorId ?? track.connectorId}:${track.collectionOrigin?.id ?? track.id}`;

/** Collection controls retain the stored order; shuffle belongs to playback. */
export function MusicCollectionControls({
  tracks,
  onPlay,
  disabled = false,
}: {
  tracks: MusicTrack[];
  onPlay: (track: MusicTrack, queue: MusicTrack[]) => void;
  disabled?: boolean;
}) {
  const t = useT();
  const player = useMusicPlayer();
  const transport = useMusicTransport();
  const sameQueue =
    tracks.length > 0 &&
    tracks.length === player.queue.length &&
    tracks.every((track, index) => identity(track) === identity(player.queue[index]));
  const selected =
    sameQueue &&
    player.current &&
    tracks.some((track) => identity(track) === identity(player.current!));
  const playing = selected && player.phase === "playing";
  const busy = Boolean(selected && player.phase === "resolving");
  const play = () => {
    if (selected && (player.phase === "playing" || player.phase === "paused")) {
      toggleMusicPlayback();
      return;
    }
    const first = tracks[transport.shuffle ? Math.floor(Math.random() * tracks.length) : 0];
    if (first) onPlay(first, tracks);
  };
  return (
    <div className="music-collection-controls">
      <button
        type="button"
        className="music-collection-play"
        disabled={disabled || !tracks.length || busy}
        onClick={play}
      >
        {busy ? (
          <LoaderCircle size={18} className="animate-spin motion-reduce:animate-none" aria-hidden />
        ) : playing ? (
          <Pause size={18} fill="currentColor" aria-hidden />
        ) : (
          <Play size={18} fill="currentColor" aria-hidden />
        )}
        {t(playing ? "music.pause" : "music.play")}
      </button>
      {tracks.length > 1 && (
        <button
          type="button"
          className="music-collection-shuffle"
          disabled={disabled}
          aria-pressed={transport.shuffle}
          title={t("music.transport.shuffle")}
          onClick={toggleMusicShuffle}
        >
          <Shuffle size={21} aria-hidden />
          <span>{t("music.transport.shuffle")}</span>
        </button>
      )}
    </div>
  );
}
