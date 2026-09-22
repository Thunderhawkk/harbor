import { useSyncExternalStore } from "react";

export type MusicPlaybackOrigin = { kind: "playlist"; id: string; name: string } | null;

/**
 * Where the current queue came from, as opposed to where a track can be found. A track's
 * collectionOrigin is its source-resolution identity and says nothing about the playlist
 * the listener started from, so clicking the title in the dock had nowhere to go and fell
 * back to a search for the song name.
 */
let origin: MusicPlaybackOrigin = null;
const listeners = new Set<() => void>();

export function setMusicPlaybackOrigin(next: MusicPlaybackOrigin): void {
  if (origin?.kind === next?.kind && origin?.id === next?.id) return;
  origin = next;
  for (const listener of listeners) listener();
}

/** Used at boot from the saved checkpoint; does not notify, nothing is listening yet. */
export function restoreMusicPlaybackOrigin(next: MusicPlaybackOrigin): void {
  origin = next;
}

export function getMusicPlaybackOrigin(): MusicPlaybackOrigin {
  return origin;
}

export function recordMusicPlaylistPlayback(
  playlist: { id: string; name: string } | null | undefined,
): void {
  setMusicPlaybackOrigin(
    playlist && playlist.id ? { kind: "playlist", id: playlist.id, name: playlist.name } : null,
  );
}

export type MusicTitleTarget = { kind: "playlist"; playlistId: string } | { kind: "album" };

export function musicTitleTarget(from: MusicPlaybackOrigin): MusicTitleTarget {
  return from?.kind === "playlist" && from.id
    ? { kind: "playlist", playlistId: from.id }
    : { kind: "album" };
}

export function useMusicPlaybackOrigin(): MusicPlaybackOrigin {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getMusicPlaybackOrigin,
    getMusicPlaybackOrigin,
  );
}
