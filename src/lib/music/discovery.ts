import { safeFetch } from "@/lib/safe-fetch";
import type { MusicCatalogItem, MusicTrack } from "./types";

export type MusicDiscoveryGenre = {
  id: number;
  name: string;
  picture_big?: string;
  picture_medium?: string;
};

export type MusicDiscoveryChart = {
  tracks: MusicTrack[];
  positions: (number | null)[];
  artists: Extract<MusicCatalogItem, { kind: "artist" }>[];
};

type RecordValue = Record<string, unknown>;
const cache = new Map<string, { at: number; data: unknown[] }>();
const pending = new Map<string, Promise<unknown[]>>();
const CACHE_MS = 15 * 60 * 1000;

function record(value: unknown): RecordValue {
  return value !== null && typeof value === "object" ? (value as RecordValue) : {};
}

function label(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function image(...values: unknown[]): string {
  return values.map(label).find((value) => value.startsWith("https://")) ?? "";
}

async function entries(path: string): Promise<unknown[]> {
  const stored = cache.get(path);
  if (stored && Date.now() - stored.at < CACHE_MS) return stored.data;
  const active = pending.get(path);
  if (active) return active;
  const request = (async () => {
    const response = await safeFetch(`https://api.deezer.com/${path}`, {
      signal: AbortSignal.timeout(12000),
    });
    if (!response.ok) throw new Error(`Deezer: ${response.status}`);
    const body = record(await response.json());
    if (body.error || !Array.isArray(body.data)) throw new Error("Deezer discovery unavailable");
    cache.set(path, { at: Date.now(), data: body.data });
    return body.data;
  })().finally(() => {
    pending.delete(path);
  });
  pending.set(path, request);
  return request;
}

export async function loadMusicDiscoveryGenres(): Promise<MusicDiscoveryGenre[]> {
  return (await entries("genre")).flatMap((value) => {
    const entry = record(value);
    if (!Number.isSafeInteger(entry.id) || Number(entry.id) <= 0 || !label(entry.name)) return [];
    return [
      {
        id: Number(entry.id),
        name: label(entry.name),
        picture_big: image(entry.picture_big, entry.picture_medium),
        picture_medium: image(entry.picture_medium),
      },
    ];
  });
}

export function parseMusicDiscoveryChart(data: unknown[]): MusicDiscoveryChart {
  const tracks: MusicTrack[] = [];
  const positions: (number | null)[] = [];
  const artists = new Map<string, Extract<MusicCatalogItem, { kind: "artist" }>>();
  const seen = new Set<number>();
  for (const value of data) {
    const entry = record(value);
    const credit = record(entry.artist);
    const album = record(entry.album);
    const id = Number(entry.id);
    const title = label(entry.title);
    const artist = label(credit.name);
    if (!Number.isSafeInteger(id) || id <= 0 || seen.has(id) || !title || !artist) continue;
    seen.add(id);
    const duration =
      typeof entry.duration === "number" && Number.isFinite(entry.duration)
        ? Math.max(0, Math.floor(entry.duration))
        : 0;
    tracks.push({
      id: `deezer:track:${id}`,
      sourceId: String(id),
      connectorId: "catalog",
      title,
      artist,
      album: label(album.title) || undefined,
      artwork: image(album.cover_xl, album.cover_big, album.cover_medium),
      durationSeconds: duration,
      durationLabel: `${Math.floor(duration / 60)}:${String(duration % 60).padStart(2, "0")}`,
    });
    positions.push(
      typeof entry.position === "number" &&
        Number.isSafeInteger(entry.position) &&
        entry.position > 0
        ? entry.position
        : null,
    );
    const artistId = Number(credit.id);
    if (Number.isSafeInteger(artistId) && artistId > 0 && !artists.has(String(artistId))) {
      artists.set(String(artistId), {
        kind: "artist",
        id: `deezer:artist:${artistId}`,
        connectorId: "catalog",
        name: artist,
        artwork: image(credit.picture_big, credit.picture_medium, credit.picture_xl),
      });
    }
  }
  return { tracks, positions, artists: [...artists.values()] };
}

export async function loadMusicDiscoveryChart(genreId = 0): Promise<MusicDiscoveryChart> {
  if (!Number.isSafeInteger(genreId) || genreId < 0) throw new Error("Invalid music genre");
  // The genre artist endpoint currently ignores its filter. Credits from these genre charts
  // keep artist browsing relevant and avoid a second provider request.
  return parseMusicDiscoveryChart(await entries(`chart/${genreId}/tracks?limit=24`));
}

export async function loadMusicDiscoveryPlaylists(): Promise<
  Extract<MusicCatalogItem, { kind: "playlist" }>[]
> {
  return (await entries("chart/0/playlists?limit=12")).flatMap((value) => {
    const entry = record(value);
    const id = Number(entry.id);
    if (!Number.isSafeInteger(id) || id <= 0 || !label(entry.title)) return [];
    const artwork = image(entry.picture_xl, entry.picture_big, entry.picture_medium);
    return [
      {
        kind: "playlist" as const,
        id: `deezer:playlist:${id}`,
        connectorId: "catalog",
        name: label(entry.title),
        artwork: artwork ? [artwork] : [],
        trackCount: typeof entry.nb_tracks === "number" ? entry.nb_tracks : undefined,
        subtitle: label(record(entry.user).name) || "Deezer",
      },
    ];
  });
}
