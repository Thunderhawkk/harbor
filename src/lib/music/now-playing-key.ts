export type MusicNowPlaying = {
  id: string | null;
  connectorId: string | null;
  phase: string;
};

const SEP = " ";

/**
 * The music store publishes on every time-pos tick, so useMusicPlayer re-renders its owner
 * about ten times a second. A track list is the worst place for that: a 200 row playlist
 * would re-render every row on every tick, which is the pressure that starved LazyMount and
 * left rows blank. Only identity and phase matter to a row, and both change rarely, so the
 * store is collapsed to one short string and React bails out on every tick that did not
 * change it. Kept free of any player import so it stays testable on its own.
 */
export function buildNowPlayingKey(
  current: { id: string; connectorId?: string | null } | null | undefined,
  phase: string,
): string {
  return `${current?.connectorId ?? ""}${SEP}${current?.id ?? ""}${SEP}${phase}`;
}

export function parseNowPlayingKey(value: string): MusicNowPlaying {
  const [connectorId, id, phase] = value.split(SEP);
  return { id: id || null, connectorId: connectorId || null, phase: phase ?? "idle" };
}

export function nowPlayingMatches(
  now: MusicNowPlaying,
  track: { id: string; connectorId?: string | null } | null | undefined,
): boolean {
  if (!now.id || !track) return false;
  return now.id === track.id && now.connectorId === (track.connectorId ?? null);
}
