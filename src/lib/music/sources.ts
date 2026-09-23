import { invoke } from "@tauri-apps/api/core";
import { withTimeout } from "@/lib/progressive-rows";
import { loadArtistFreshTracks } from "./artist-releases";
import { readMusicPreference } from "./preferences";
import { artistCreditParts } from "./search-artists";
import { normalizeName, normalizeTitle } from "./search-normalize";
import type {
  MusicAlbumRef,
  MusicArtistRef,
  MusicCatalogItem,
  MusicConnectorHealth,
  MusicPlaylistRef,
  MusicSearchResults,
  MusicSourceCandidate,
  MusicTrack,
  SpotifyStatus,
} from "./types";

export async function searchMusic(
  query: string,
  limit = 24,
  connector?: string,
): Promise<MusicTrack[]> {
  return invoke<MusicTrack[]>("music_search", { query, limit, connector });
}

export function favoriteArtists(tracks: MusicTrack[]): string[] {
  const counts = new Map<string, { name: string; count: number }>();
  for (const track of tracks) {
    const name = artistCreditParts(track.artist)[0]?.trim();
    if (!name || name.toLowerCase() === "unknown artist") continue;
    const key = normalize(name);
    const current = counts.get(key);
    counts.set(key, { name, count: (current?.count ?? 0) + 1 });
  }
  return [...counts.values()]
    .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name))
    .map((entry) => entry.name);
}

export async function loadFreshFromArtists(
  recents: MusicTrack[],
  limit = 9,
): Promise<MusicTrack[]> {
  const artists = favoriteArtists(recents).slice(0, 3);
  if (artists.length === 0) return [];
  const heard = new Set(recents.map(heardKey));
  const settled = await Promise.allSettled(
    artists.map((artist) => loadArtistFreshTracks(artist, limit)),
  );
  const lanes = settled.map((result) =>
    result.status === "fulfilled"
      ? result.value.filter((track) => !heard.has(heardKey(track)))
      : [],
  );
  const picked = interleave(lanes, limit);
  return picked.length > 0 ? picked : searchFromArtists(artists, recents, limit);
}

function heardKey(track: MusicTrack): string {
  const credit = artistCreditParts(track.artist)[0] ?? track.artist;
  return `${normalizeTitle(track.title)}|${normalize(credit)}`;
}

async function searchFromArtists(
  artists: string[],
  recents: MusicTrack[],
  limit: number,
): Promise<MusicTrack[]> {
  const seen = new Set(recents.map((track) => track.id));
  const settled = await Promise.allSettled(
    artists.map(async (artist) =>
      (await searchMusic(`${artist} songs`, 14)).filter(
        (track) => !seen.has(track.id) && artistMatches(artist, track.artist),
      ),
    ),
  );
  if (settled.every((result) => result.status === "rejected")) {
    throw settled[0]?.status === "rejected" ? settled[0].reason : new Error("Search failed.");
  }
  const lanes = settled.map((result) => (result.status === "fulfilled" ? result.value : []));
  return interleave(lanes, limit);
}

function interleave(lanes: MusicTrack[][], limit: number): MusicTrack[] {
  const picked: MusicTrack[] = [];
  const taken = new Set<string>();
  const deepest = lanes.reduce((most, lane) => Math.max(most, lane.length), 0);
  for (let depth = 0; depth < deepest && picked.length < limit; depth += 1) {
    for (const lane of lanes) {
      const track = lane[depth];
      if (!track || taken.has(track.id) || picked.length >= limit) continue;
      taken.add(track.id);
      picked.push(track);
    }
  }
  return picked;
}

export function getMusicHealth(): Promise<MusicConnectorHealth[]> {
  return invoke<MusicConnectorHealth[]>("music_health");
}

export function getMusicSourceCandidates(track: MusicTrack): Promise<MusicSourceCandidate[]> {
  return invoke<MusicSourceCandidate[]>("music_source_candidates", { track });
}

export function getSpotifyStatus(): Promise<SpotifyStatus> {
  return invoke<SpotifyStatus>("music_spotify_status");
}

export function connectSpotify(): Promise<SpotifyStatus> {
  return invoke<SpotifyStatus>("music_spotify_connect");
}

export function disconnectSpotify(): Promise<void> {
  return invoke("music_spotify_disconnect");
}

function artistMatches(target: string, candidate: string): boolean {
  const left = normalize(target);
  const right = normalize(candidate);
  return left === right || right.includes(left) || left.includes(right);
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

const HEALTH_TTL_MS = 30_000;
const SEARCH_LANE_TIMEOUT_MS = 9_000;
const FALLBACK_FANOUT_TIMEOUT_MS = 20_000;
const PREFERRED_SOURCE_KEY = "harbor.music.preferred-source.v1";

/** Mirrors source_rank in src-tauri/src/music/rows.rs so merged search agrees with catalog rows. */
const MUSIC_SOURCE_ORDER: readonly string[] = [
  "catalog",
  "spotify",
  "youtube",
  "soundcloud",
  "local",
  "jellyfin",
  "plex",
  "subsonic",
];

export function musicSourcePriority(connectorId: string | null | undefined): number {
  if (!connectorId) return MUSIC_SOURCE_ORDER.length + 1;
  if (connectorId === readMusicPreference(PREFERRED_SOURCE_KEY)) return -1;
  const index = MUSIC_SOURCE_ORDER.indexOf(connectorId);
  return index < 0 ? MUSIC_SOURCE_ORDER.length : index;
}

let healthCache: { at: number; value: Promise<MusicConnectorHealth[]> } | null = null;

export function invalidateMusicHealth(): void {
  healthCache = null;
}

export function musicHealthSnapshot(): Promise<MusicConnectorHealth[]> {
  if (healthCache && Date.now() - healthCache.at < HEALTH_TTL_MS) return healthCache.value;
  const entry = { at: Date.now(), value: getMusicHealth() };
  healthCache = entry;
  entry.value.catch(() => {
    if (healthCache === entry) healthCache = null;
  });
  return entry.value;
}

/** Same gate as the Rust fan-out: searchable sources, offline dropped unless that empties the set. */
export async function searchableMusicSources(): Promise<string[]> {
  const health = await musicHealthSnapshot();
  const searchable = health.filter((entry) => entry.searchable);
  const live = searchable.filter((entry) => entry.health !== "offline");
  return (live.length > 0 ? live : searchable)
    .map((entry) => entry.id)
    .sort((left, right) => musicSourcePriority(left) - musicSourcePriority(right));
}

/**
 * Stamped onto every merged search item. MusicTrack and the *Ref types do not declare these, so a
 * value that has passed through a MusicSearchResults annotation must be read with the accessors.
 */
export type MusicSourceRanked = {
  sourceRank?: number;
  sourceCount?: number;
  sourceConnectorIds?: string[];
};

export type MusicLaneOutcome = {
  id: string;
  ok: boolean;
  error: string | null;
  tracks: number;
  albums: number;
  artists: number;
  playlists: number;
};

export type RankedMusicSearchResults = {
  top?: MusicCatalogItem;
  tracks: (MusicTrack & MusicSourceRanked)[];
  albums: (MusicAlbumRef & MusicSourceRanked)[];
  artists: (MusicArtistRef & MusicSourceRanked)[];
  playlists: (MusicPlaylistRef & MusicSourceRanked)[];
  laneOutcomes?: MusicLaneOutcome[];
};

export function sourceRankOf(item: unknown): number | undefined {
  const value = (item as MusicSourceRanked | null | undefined)?.sourceRank;
  return typeof value === "number" ? value : undefined;
}

export function sourceCountOf(item: unknown): number | undefined {
  const value = (item as MusicSourceRanked | null | undefined)?.sourceCount;
  return typeof value === "number" ? value : undefined;
}

export function sourceConnectorIdsOf(item: unknown): string[] {
  const value = (item as MusicSourceRanked | null | undefined)?.sourceConnectorIds;
  return Array.isArray(value) ? value : [];
}

// A name of pure symbols normalises to nothing, so the raw text is the key of last resort.
const dedupeName = (value: string) => normalizeName(value) || value.trim().toLowerCase();
const dedupeTitle = (value: string) => normalizeTitle(value) || value.trim().toLowerCase();

/** Dedupe keys share the ranking layer's normaliser so a merge never splits what scoring joins. */
export function musicTrackKey(track: { title: string; artist: string }): string {
  const primary = artistCreditParts(track.artist)[0] ?? track.artist;
  return `${dedupeTitle(track.title)}|${dedupeName(primary)}`;
}

export type MusicSearchLane = { id: string; results: MusicSearchResults };

type MergedEntry<T> = { item: T; lane: number; rank: number; sources: string[] };

function mergeBucket<T extends object>(
  lanes: { id: string; items: T[] }[],
  keyOf: (item: T) => string,
  limit: number,
): (T & MusicSourceRanked)[] {
  const merged = new Map<string, MergedEntry<T>>();
  lanes.forEach((lane, laneIndex) => {
    lane.items.forEach((item, position) => {
      const key = keyOf(item);
      if (!key) return;
      const existing = merged.get(key);
      if (!existing) {
        merged.set(key, { item, lane: laneIndex, rank: position, sources: [lane.id] });
        return;
      }
      existing.rank = Math.min(existing.rank, position);
      if (!existing.sources.includes(lane.id)) existing.sources.push(lane.id);
    });
  });
  return [...merged.values()]
    .sort((left, right) => left.rank - right.rank || left.lane - right.lane)
    .slice(0, limit)
    .map((entry) => ({
      ...entry.item,
      sourceRank: entry.rank,
      sourceCount: entry.sources.length,
      sourceConnectorIds: entry.sources,
    }));
}

/**
 * Lanes must arrive in source-priority order: the first lane to supply an identity keeps its copy,
 * so the surviving payload is the better source rather than whichever call resolved first. Rank is
 * the best position any source gave the item, which is the weak relevance signal.
 */
export function mergeMusicSearchLanes(
  lanes: MusicSearchLane[],
  limit: number,
): RankedMusicSearchResults {
  const bucket = <T>(pick: (results: MusicSearchResults) => T[]) =>
    lanes.map((lane) => ({ id: lane.id, items: pick(lane.results) }));
  return {
    top: lanes.find((lane) => lane.results.top)?.results.top,
    tracks: mergeBucket(
      bucket((results) => results.tracks),
      musicTrackKey,
      limit,
    ),
    albums: mergeBucket(
      bucket((results) => results.albums),
      (album) => `${dedupeTitle(album.title)}|${dedupeName(album.artist)}`,
      limit,
    ),
    artists: mergeBucket(
      bucket((results) => results.artists),
      (artist) => `${artist.connectorId}:${artist.id}`,
      limit,
    ),
    playlists: mergeBucket(
      bucket((results) => results.playlists),
      (playlist) => `${dedupeName(playlist.name)}|${playlist.connectorId}`,
      limit,
    ),
  };
}

/**
 * One invoke per searchable source instead of the untimed Rust fan-out, so a hung connector is
 * abandoned at the deadline and the others still answer. The abandoned request cannot be cancelled
 * across the bridge, it is only stopped from holding the result.
 */
export async function searchAcrossMusicSources(
  query: string,
  limit: number,
): Promise<RankedMusicSearchResults> {
  const ids = await searchableMusicSources().catch(() => [] as string[]);
  if (ids.length === 0) {
    // Health is unreadable, so fall back to the Rust fan-out under one deadline for all of it.
    const results = await withTimeout(
      invoke<MusicSearchResults>("music_search_typed", { query, limit, connector: undefined }),
      FALLBACK_FANOUT_TIMEOUT_MS,
    );
    return {
      ...mergeMusicSearchLanes([{ id: "", results }], limit),
      laneOutcomes: [laneOutcome("", results, null)],
    };
  }
  const settled = await Promise.all(
    ids.map(async (id) => {
      try {
        const results = await withTimeout(
          invoke<MusicSearchResults>("music_search_typed", { query, limit, connector: id }),
          SEARCH_LANE_TIMEOUT_MS,
        );
        return { id, results, error: null as string | null };
      } catch (cause) {
        const reason = cause instanceof Error ? cause.message : String(cause);
        return { id, results: null, error: `${id}: ${reason}` };
      }
    }),
  );
  const live = settled.filter((lane): lane is MusicSearchLane & { error: string | null } =>
    Boolean(lane.results),
  );
  const outcomes = settled.map((lane) => laneOutcome(lane.id, lane.results, lane.error));
  if (outcomes.some((outcome) => !outcome.ok)) invalidateMusicHealth();
  if (live.length === 0) {
    const reasons = settled.map((lane) => lane.error).filter(Boolean);
    throw new Error(reasons.length > 0 ? reasons.join("; ") : "Music sources are offline");
  }
  return { ...mergeMusicSearchLanes(live, limit), laneOutcomes: outcomes };
}

function laneOutcome(
  id: string,
  results: MusicSearchResults | null,
  error: string | null,
): MusicLaneOutcome {
  return {
    id,
    ok: Boolean(results),
    error,
    tracks: results?.tracks.length ?? 0,
    albums: results?.albums.length ?? 0,
    artists: results?.artists.length ?? 0,
    playlists: results?.playlists.length ?? 0,
  };
}
