import { simklRequest } from "./client";
import { buildBody, type EpisodeRef, type ScrobbleAction, type ScrobbleInfo } from "./scrobble-body";

export { buildBody };
export type { EpisodeRef, ScrobbleAction, ScrobbleInfo };

export async function simklScrobble(
  action: ScrobbleAction,
  metaId: string,
  episode: EpisodeRef,
  progress: number,
  info?: ScrobbleInfo,
): Promise<boolean> {
  const body = buildBody(metaId, episode, progress, info);
  if (!body) return false;
  try {
    await simklRequest(`/scrobble/${action}`, { method: "POST", body });
    return true;
  } catch {
    // Background-safe: live scrobble failures must never break playback.
    return false;
  }
}
