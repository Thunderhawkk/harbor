import type { SyncState } from "@/lib/together/protocol";
import type { MusicTrack } from "@/lib/music/types";

export type ListenTrackRef = {
  id: string;
  connectorId: string | null;
  title: string;
  artist: string;
  artwork: string | null;
};

/** Unit separator. A connector slug cannot contain a control character; a title can contain anything. */
const UNIT = String.fromCharCode(31);

/**
 * A music identity is (connectorId, id) but the relay carries a single mediaId string,
 * so the pair is packed. worker.js:471 validates mediaId as a string and nothing more,
 * so the only requirement is a separator that cannot occur in a connector slug.
 */
export function packListenMediaId(track: { id: string; connectorId?: string | null }): string {
  return `${track.connectorId ?? ""}${UNIT}${track.id}`;
}

export function unpackListenMediaId(
  mediaId: string | null,
): { id: string; connectorId: string | null } | null {
  if (!mediaId) return null;
  const at = mediaId.indexOf(UNIT);
  if (at < 0) return null;
  const connectorId = mediaId.slice(0, at);
  const id = mediaId.slice(at + 1);
  if (!id) return null;
  return { id, connectorId: connectorId || null };
}

/**
 * Title and artist also share one relay field. They are JSON rather than separated,
 * because both are free text and a separator would have to survive every track name
 * anyone ever plays.
 */
export function packListenTitle(title: string, artist: string): string {
  return JSON.stringify({ t: title ?? "", a: artist ?? "" });
}

export function unpackListenTitle(value: string | null): { title: string; artist: string } {
  if (!value) return { title: "", artist: "" };
  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === "object" && ("t" in parsed || "a" in parsed)) {
      return {
        title: typeof parsed.t === "string" ? parsed.t : "",
        artist: typeof parsed.a === "string" ? parsed.a : "",
      };
    }
  } catch {
    // An older or hand-typed payload is a plain title, which is still worth showing.
  }
  return { title: value, artist: "" };
}

export function listenStateFromTrack(
  track: MusicTrack,
  positionSeconds: number,
  playing: boolean,
  clientId: string,
  hostClientId: string | null,
  now: number,
): SyncState {
  return {
    mediaId: packListenMediaId(track),
    mediaTitle: packListenTitle(track.title ?? "", track.artist ?? ""),
    // Music has no episodes, and the relay drops a malformed one, so it stays null.
    episode: null,
    posterUrl: track.artwork ?? null,
    positionSeconds: Math.max(0, Number.isFinite(positionSeconds) ? positionSeconds : 0),
    playing,
    updatedAt: now,
    updatedBy: clientId,
    hostClientId,
  };
}

export function listenTrackFromState(state: SyncState | null): ListenTrackRef | null {
  if (!state) return null;
  const identity = unpackListenMediaId(state.mediaId);
  if (!identity) return null;
  const { title, artist } = unpackListenTitle(state.mediaTitle);
  return {
    id: identity.id,
    connectorId: identity.connectorId,
    title,
    artist,
    artwork: state.posterUrl,
  };
}

export function listenStateMatchesTrack(
  state: SyncState | null,
  track: { id: string; connectorId?: string | null } | null | undefined,
): boolean {
  if (!state || !track) return false;
  const identity = unpackListenMediaId(state.mediaId);
  if (!identity) return false;
  return identity.id === track.id && identity.connectorId === (track.connectorId ?? null);
}
