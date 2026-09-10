import { useMemo } from "react";
import { getEpisodeProgress } from "@/lib/episode-progress";
import { manualWatchedState } from "@/lib/manual-watched";
import type { KitsuEpisode } from "@/lib/providers/kitsu";
import { parseKitsuId } from "@/lib/providers/kitsu";
import { splitFranchiseDisplaySeason } from "@/lib/streams/anime-identity-core";
import { lastPlayedEpisode } from "@/lib/resume";
import { animeSeasonKey } from "./anime-season-key";

export function useAnimePreferredSeason({
  episodes,
  metaId,
  trackId,
  traktWatched,
  anilistWatched,
  malWatched,
  mwVersion,
}: {
  episodes: KitsuEpisode[];
  metaId: string;
  trackId?: string;
  traktWatched: Set<string>;
  anilistWatched?: Set<string>;
  malWatched?: Set<string>;
  mwVersion: number;
}): string | null {
  return useMemo(() => {
    if (episodes.length === 0) return null;
    const partScoped =
      splitFranchiseDisplaySeason(parseKitsuId(metaId)) != null ||
      (trackId ? splitFranchiseDisplaySeason(parseKitsuId(trackId)) != null : false);
    const played = lastPlayedEpisode(metaId) ?? (trackId ? lastPlayedEpisode(trackId) : null);
    const playedEp = played != null ? episodes.find((e) => e.number === played.episode) : undefined;
    const playedSeason = partScoped
      ? (playedEp?.seasonNumber ?? playedEp?.imdbSeason ?? null)
      : (playedEp?.imdbSeason ?? playedEp?.seasonNumber ?? null);
    let maxSeason = 1;
    for (const ep of episodes) {
      const isCurrent = ep.sourceMetaId == null;
      let progress = getEpisodeProgress(
        ep.sourceMetaId ?? metaId,
        animeSeasonKey(ep),
        ep.number,
        ep.length ?? null,
        ep.imdbId ?? null,
        traktWatched,
        undefined,
        isCurrent ? anilistWatched : undefined,
        undefined,
        isCurrent ? malWatched : undefined,
        ep.imdbSeason,
        ep.imdbEpisode,
      );
      if (
        isCurrent &&
        !progress.watched &&
        trackId &&
        trackId !== metaId &&
        manualWatchedState(metaId, animeSeasonKey(ep), ep.number) !== false
      ) {
        const alt = getEpisodeProgress(
          trackId,
          animeSeasonKey(ep),
          ep.number,
          ep.length ?? null,
          ep.imdbId ?? null,
          traktWatched,
          undefined,
          anilistWatched,
          undefined,
          malWatched,
          ep.imdbSeason,
          ep.imdbEpisode,
        );
        if (alt.watched) progress = alt;
      }
      const seasonNo = partScoped
        ? (ep.seasonNumber ?? ep.imdbSeason ?? 1)
        : (ep.imdbSeason ?? ep.seasonNumber ?? 1);
      if (seasonNo > maxSeason) maxSeason = seasonNo;
      if (!progress.watched) {
        if (playedSeason != null && seasonNo < playedSeason) continue;
        return String(seasonNo);
      }
    }
    if (playedSeason != null) return String(playedSeason);
    return String(maxSeason);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [episodes, metaId, trackId, traktWatched, anilistWatched, malWatched, mwVersion]);
}
