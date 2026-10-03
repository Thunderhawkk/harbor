const KEY = "harbor.anime-cw-ids.v1";
const MAX = 400;

const ANIME_SCHEME = /^(kitsu|mal|anilist|anidb):/;
// Catalog ids that can carry a recorded anime mapping: Cinemeta's IMDb ids and
// TMDB's tv ids — both resolve to the same anime entries.
const CATALOG_ID = /^(?:tt\d+|tmdb:tv:)/;

function read(): Record<string, string> {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as Record<string, string>) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function write(map: Record<string, string>): void {
  try {
    const keys = Object.keys(map);
    let out = map;
    if (keys.length > MAX) {
      out = {};
      for (const k of keys.slice(keys.length - MAX)) out[k] = map[k];
    }
    localStorage.setItem(KEY, JSON.stringify(out));
  } catch {
    /* ignore */
  }
}

export function recordAnimeCwId(catalogId: string, animeId: string): void {
  if (!CATALOG_ID.test(catalogId) || !ANIME_SCHEME.test(animeId)) return;
  const map = read();
  if (map[catalogId] === animeId) return;
  delete map[catalogId];
  map[catalogId] = animeId;
  write(map);
}

export function getAnimeCwId(catalogId: string): string | null {
  if (!CATALOG_ID.test(catalogId)) return null;
  return read()[catalogId] ?? null;
}
