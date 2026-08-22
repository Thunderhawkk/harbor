import { useEffect, useMemo, useState } from "react";
import { isGenericEpisodeName, isUsableLocalizedText } from "@/lib/providers/anime-episode-build";
import { harborImdbEpisodes } from "@/lib/providers/harbor-imdb";
import { omdbSeasonRatings } from "@/lib/providers/omdb";
import type { Episode } from "@/lib/providers/tmdb";
import { tmdbLanguageIso } from "@/lib/providers/tmdb/tmdb-client";
import { tvdbEpisodes, tvdbLangFromIso1, tvdbSeriesByImdb, type TvdbEpisode } from "@/lib/providers/tvdb";

export function useEpisodeEnrich({
  episodes,
  active,
  imdbId,
  tvdbKey,
  omdbKey,
  enEpisodes,
}: {
  episodes: Episode[];
  active: number;
  imdbId: string | null;
  tvdbKey: string;
  omdbKey: string;
  /** en-US counterparts for `episodes`; used to detect TMDB's silent language fallback. */
  enEpisodes?: Episode[];
}): { episodes: Episode[]; imdbRatings: Map<string, number> } {
  const [tvdbBySeason, setTvdbBySeason] = useState<Map<number, Map<number, TvdbEpisode>>>(new Map());
  const [omdbBySeason, setOmdbBySeason] = useState<Map<number, Map<number, number>>>(new Map());
  const [harborImdb, setHarborImdb] = useState<Map<string, number>>(new Map());

  useEffect(() => {
    if (!tvdbKey || !imdbId) return;
    if (tvdbBySeason.has(active)) return;
    let cancelled = false;
    void (async () => {
      const seriesId = await tvdbSeriesByImdb(tvdbKey, imdbId);
      if (!seriesId || cancelled) return;
      const eps = await tvdbEpisodes(tvdbKey, seriesId, active, tvdbLangFromIso1(tmdbLanguageIso()));
      if (cancelled) return;
      const map = new Map<number, TvdbEpisode>();
      for (const e of eps) map.set(e.number, e);
      setTvdbBySeason((prev) => new Map(prev).set(active, map));
    })();
    return () => {
      cancelled = true;
    };
  }, [imdbId, active, tvdbKey, tvdbBySeason]);

  useEffect(() => {
    if (!omdbKey || !imdbId) return;
    if (omdbBySeason.has(active)) return;
    let cancelled = false;
    void (async () => {
      const map = await omdbSeasonRatings(omdbKey, imdbId, active);
      if (cancelled || map.size === 0) return;
      setOmdbBySeason((prev) => new Map(prev).set(active, map));
    })();
    return () => {
      cancelled = true;
    };
  }, [imdbId, active, omdbKey, omdbBySeason]);

  useEffect(() => {
    if (!imdbId) return;
    let cancelled = false;
    void harborImdbEpisodes(imdbId).then((map) => {
      if (!cancelled && map.size > 0) setHarborImdb(map);
    });
    return () => {
      cancelled = true;
    };
  }, [imdbId]);

  const tvdbForSeason = tvdbBySeason.get(active);
  const omdbForSeason = omdbBySeason.get(active);
  const enriched = useMemo<Episode[]>(() => {
    if (!tvdbForSeason && !omdbForSeason && harborImdb.size === 0) return episodes;
    const lang = tmdbLanguageIso();
    // A localized candidate only counts as real if it differs from its en-US counterpart:
    // equality means TMDB had no translation and silently served English.
    const usable = (text: string | null | undefined, enText?: string | null) => {
      const t = (text ?? "").trim();
      if (!t || isGenericEpisodeName(t) || !isUsableLocalizedText(t, lang)) return false;
      const e = (enText ?? "").trim();
      return !(lang && e && t === e);
    };
    const enByNumber = new Map<number, Episode>();
    for (const e of enEpisodes ?? []) enByNumber.set(e.episodeNumber, e);
    return episodes.map((ep): Episode => {
      let next: Episode = ep;
      const tv = tvdbForSeason?.get(ep.episodeNumber);
      const en = enByNumber.get(ep.episodeNumber);
      if (tv) {
        // Precedence: verified-localized TMDB, then TVDB (its requested-language fetch can
        // also carry genuine translations TMDB lacks), then raw TMDB as last resort.
        const name =
          (usable(next.name, en?.name) ? next.name : undefined) ??
          (usable(tv.name) ? tv.name : undefined) ??
          next.name;
        const overview =
          (usable(next.overview, en?.overview) ? next.overview : undefined) ??
          (usable(tv.overview) ? tv.overview : undefined) ??
          next.overview;
        next = {
          ...next,
          name,
          overview,
          runtime: next.runtime ?? tv.runtime ?? null,
          airDate: next.airDate ?? tv.aired ?? null,
        };
      }
      const imdbRating =
        harborImdb.get(`${active}:${ep.episodeNumber}`) ?? omdbForSeason?.get(ep.episodeNumber);
      if (imdbRating != null && imdbRating > 0) {
        next = { ...next, imdbRating };
      }
      return next;
    });
  }, [episodes, tvdbForSeason, omdbForSeason, harborImdb, active, enEpisodes]);
  return { episodes: enriched, imdbRatings: harborImdb };
}
