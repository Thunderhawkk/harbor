import { getResolved, makeKey, resolveOnce } from "./cache";
import { findEpisodeInSeasons, hasAnyComparableSignal, normalizeTitle } from "./match";
import type {
  EpisodeIdentity,
  ExternalShowIds,
  ResolutionResult,
  ResolvedEpisode,
  SeasonListing,
} from "./types";

export type ShowCandidate = {
  showIds: ExternalShowIds;
  title: string;
  year: number | null;
};

export type CatalogDeps = {
  searchShows: (title: string) => Promise<ShowCandidate[]>;
  fetchShowSeasons: (showIds: ExternalShowIds) => Promise<SeasonListing[] | null>;
};

const MAX_CANDIDATES = 5;
const MAX_FETCHES = 6;

export function shouldResolve(input: { kind?: string; hasEpisodeIds?: boolean }): boolean {
  return input.kind === "episode" && !input.hasEpisodeIds;
}

async function runResolution(
  identity: EpisodeIdentity,
  deps: CatalogDeps,
): Promise<ResolutionResult> {
  if (!identity.showTitle.trim()) return { ok: false, reason: "error" };

  let candidates: ShowCandidate[];
  try {
    candidates = await deps.searchShows(identity.showTitle);
  } catch {
    return { ok: false, reason: "error" };
  }
  if (candidates.length === 0) return { ok: false, reason: "not-found" };

  let fetches = 0;
  let evaluated = false;
  for (const candidate of candidates.slice(0, MAX_CANDIDATES)) {
    if (fetches >= MAX_FETCHES) break;
    fetches += 1;
    let seasons: SeasonListing[] | null;
    try {
      seasons = await deps.fetchShowSeasons(candidate.showIds);
    } catch {
      return { ok: false, reason: "error" };
    }
    if (!seasons || seasons.length === 0) continue;
    if (hasAnyComparableSignal(identity, seasons)) evaluated = true;
    const hit = findEpisodeInSeasons(identity, seasons);
    if (hit) {
      return {
        ok: true,
        episode: { showIds: candidate.showIds, season: hit.season, number: hit.number },
      };
    }
  }

  // A miss we could actually evaluate is a real one, and is worth remembering so the
  // same impossible id is not re-probed. A search where nothing was comparable tells
  // us nothing, so it must stay retryable instead of being cached as absent.
  return { ok: false, reason: evaluated ? "not-found" : "error" };
}

export async function resolveEpisode(
  identity: EpisodeIdentity,
  deps: CatalogDeps,
): Promise<ResolutionResult> {
  const key = makeKey(
    `${normalizeTitle(identity.showTitle)}|${identity.showYear ?? ""}`,
    identity.season,
    identity.number,
  );
  const cached = getResolved(key);
  if (cached) return cached;
  return resolveOnce(key, () => runResolution(identity, deps));
}

export function resolvedToTraktTarget(episode: ResolvedEpisode) {
  return {
    kind: "episode" as const,
    show: { ids: episode.showIds },
    season: episode.season,
    number: episode.number,
  };
}

export function resolvedToSimklTarget(episode: ResolvedEpisode) {
  return {
    kind: "episode" as const,
    show: { ids: episode.showIds },
    season: episode.season,
    number: episode.number,
  };
}
