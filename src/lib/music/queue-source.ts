import type { MusicSourceCandidate, MusicTrack } from "./types";

export function adoptCollectionOrigin(selected: MusicTrack, original: MusicTrack): MusicTrack {
  return {
    ...selected,
    collectionOrigin: original.collectionOrigin ?? {
      id: original.id,
      connectorId: original.connectorId,
    },
  };
}

export function replaceQueueTrack(
  queue: MusicTrack[],
  index: number,
  selected: MusicTrack,
): MusicTrack[] {
  const original = queue[index];
  if (!original || index < 0 || index >= queue.length) return queue;
  if (selected.connectorId === original.connectorId && selected.id === original.id) return queue;
  return queue.map((item, at) => (at === index ? adoptCollectionOrigin(selected, original) : item));
}

export function selectableSources(
  candidates: MusicSourceCandidate[],
  track: MusicTrack,
): MusicSourceCandidate[] {
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    if (candidate.health === "offline") return false;
    const key = `${candidate.connectorId}:${candidate.track.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return candidate.connectorId !== track.connectorId || candidate.track.id !== track.id;
  });
}
