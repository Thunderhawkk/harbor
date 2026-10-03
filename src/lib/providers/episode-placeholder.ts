import { isGenericEpisodeName } from "@/lib/providers/anime-episode-build";
import type { KitsuEpisode } from "@/lib/providers/kitsu";

// Providers publish placeholders such as "TBA" for episodes whose name has not
// been announced yet. That is honest text for an episode that has not aired, but
// it must never replace — or hide — the real title of an episode that already
// aired, which another source may well know.
const PLACEHOLDER = /^(?:tba|tbd|tbc|n\/?a|unknown|to be announced|to be determined)\b/i;

export function isPlaceholderEpisodeText(text: string | null | undefined): boolean {
  const t = text?.trim();
  return !!t && PLACEHOLDER.test(t);
}

/**
 * First candidate that is neither empty nor a placeholder; when every candidate
 * is a placeholder the first non-empty one is kept (an unaired episode is better
 * off with "TBA" than with nothing).
 */
export function firstRealEpisodeText(
  candidates: Array<string | null | undefined>,
): string | undefined {
  let fallback: string | undefined;
  for (const candidate of candidates) {
    const text = candidate?.trim();
    if (!text) continue;
    if (isPlaceholderEpisodeText(text)) {
      fallback ??= text;
      continue;
    }
    return text;
  }
  return fallback;
}

function hasAired(iso: string | null | undefined, now: number): boolean {
  if (!iso) return false;
  const t = Date.parse(iso);
  return Number.isFinite(t) && t <= now;
}

function isRealTitle(text: string | null | undefined): text is string {
  const t = text?.trim();
  return !!t && !isPlaceholderEpisodeText(t) && !isGenericEpisodeName(t);
}

/**
 * Replace a placeholder title/synopsis on an already-aired row with the real
 * text of the matching pool episode (same TVDB id, provider pair or absolute
 * number). Title and synopsis are handled independently — a row can have a real
 * name and a "TBA" description. Unaired rows keep the placeholder: "TBA" is
 * correct while nothing has been published, and a generic "Episode 4" from
 * another provider is not an improvement over it either. Rows that need no
 * change keep their identity.
 */
export function fillAiredPlaceholderTitles(
  rows: KitsuEpisode[],
  pool: KitsuEpisode[],
  now = Date.now(),
): KitsuEpisode[] {
  const byTvdbId = new Map<number, KitsuEpisode>();
  const byPair = new Map<string, KitsuEpisode>();
  const byAbs = new Map<number, KitsuEpisode>();
  for (const ep of pool) {
    const hasRealSynopsis =
      !!ep.synopsis?.trim() && !isPlaceholderEpisodeText(ep.synopsis);
    if (!isRealTitle(ep.title) && !hasRealSynopsis) continue;
    if (ep.tvdbEpisodeId != null && !byTvdbId.has(ep.tvdbEpisodeId)) {
      byTvdbId.set(ep.tvdbEpisodeId, ep);
    }
    if (ep.imdbSeason != null && ep.imdbEpisode != null) {
      const key = `${ep.imdbSeason}:${ep.imdbEpisode}`;
      if (!byPair.has(key)) byPair.set(key, ep);
    }
    const abs = ep.absoluteNumber ?? ep.number;
    if (abs != null && !byAbs.has(abs)) byAbs.set(abs, ep);
  }
  let changed = false;
  const out = rows.map((ep) => {
    const titleMissing = !ep.title?.trim() || isPlaceholderEpisodeText(ep.title);
    const synopsisMissing = !ep.synopsis?.trim() || isPlaceholderEpisodeText(ep.synopsis);
    if (!titleMissing && !synopsisMissing) return ep;
    const abs = ep.absoluteNumber;
    const base =
      (ep.tvdbEpisodeId != null ? byTvdbId.get(ep.tvdbEpisodeId) : undefined) ??
      (ep.imdbSeason != null && ep.imdbEpisode != null
        ? byPair.get(`${ep.imdbSeason}:${ep.imdbEpisode}`)
        : undefined) ??
      (abs != null ? byAbs.get(abs) : undefined);
    if (!base || !hasAired(ep.airdate ?? base.airdate, now)) return ep;
    const patch: Partial<KitsuEpisode> = {};
    if (titleMissing && isRealTitle(base.title)) patch.title = base.title;
    if (synopsisMissing) {
      const synopsis = base.synopsis?.trim();
      if (synopsis && !isPlaceholderEpisodeText(synopsis)) patch.synopsis = synopsis;
    }
    if (patch.title == null && patch.synopsis == null) return ep;
    changed = true;
    return { ...ep, ...patch };
  });
  return changed ? out : rows;
}
