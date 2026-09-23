import { musicSearchTop } from "@/lib/music/search-ranking";
import {
  artistIdentityKey,
  primeArtistCandidates,
  resolveArtist,
} from "@/lib/music/artist-authority";
import {
  collapseArtistRows,
  uniqueSearchArtists,
  resolveSearchCollaborations,
} from "@/lib/music/search-artists";
import { ChevronLeft, Disc3, ListMusic, Music2, Search, UserRound, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { MusicCatalogRow } from "@/components/music/music-catalog-row";
import {
  MusicSectionEmpty,
  MusicSectionError,
  MusicTrackGridSkeleton,
} from "@/components/music/music-track-grid";
import { useT, useUiLanguage } from "@/lib/i18n";
import type {
  MusicArtistRef,
  MusicCatalogItem,
  MusicSearchResults,
  MusicTrack,
} from "@/lib/music/types";
import { localRow } from "./music-band-types";

const IDENTITY_DEADLINE_MS = 1200;

export function MusicSearchPanel({
  query,
  results,
  error,
  searching,
  onRetry,
  onClear,
  onOpenItem,
  onPlayTrack,
  variant = "search",
}: {
  query: string;
  results: MusicSearchResults | null;
  error: string;
  searching: boolean;
  onRetry: () => void;
  onClear: () => void;
  onOpenItem: (item: MusicCatalogItem, siblings: MusicCatalogItem[]) => void;
  onPlayTrack: (track: MusicTrack, queue: MusicTrack[]) => void;
  variant?: "search" | "genre";
}) {
  const t = useT();
  const language = useUiLanguage();
  const [category, setCategory] = useState("all");
  const [resolvedArtists, setResolvedArtists] = useState<{
    source: MusicSearchResults;
    artists: MusicSearchResults["artists"];
  } | null>(null);
  useEffect(() => {
    if (!results) return;
    let active = true;
    void resolveSearchCollaborations(results.artists, async (name) => {
      const ranking = await resolveArtist(name);
      return ranking.canonical && !ranking.ambiguous ? [ranking.canonical] : [];
    }).then((artists) => {
      if (active) setResolvedArtists({ source: results, artists });
    });
    return () => {
      active = false;
    };
  }, [results]);
  const [settled, setSettled] = useState<{ results: MusicSearchResults } | null>(null);
  const queryRef = useRef(query);
  queryRef.current = query;
  useEffect(() => {
    if (!results) {
      setSettled(null);
      return;
    }
    let active = true;
    const settle = () => {
      if (active) setSettled({ results });
    };
    const groups = new Map<string, MusicArtistRef[]>();
    for (const artist of results.artists) {
      const key = artistIdentityKey(artist.name);
      const group = groups.get(key);
      if (group) group.push(artist);
      else groups.set(key, [artist]);
    }
    const own = artistIdentityKey(queryRef.current);
    for (const [key, refs] of groups) if (key !== own) primeArtistCandidates(key, refs);
    const deadline = window.setTimeout(settle, IDENTITY_DEADLINE_MS);
    void resolveArtist(queryRef.current, { hint: groups.get(own) ?? [] })
      .catch(() => null)
      .then(settle);
    return () => {
      active = false;
      window.clearTimeout(deadline);
    };
  }, [results]);
  const identitySettled = Boolean(results) && settled?.results === results;
  const artistResults = collapseArtistRows(
    uniqueSearchArtists(
      resolvedArtists && resolvedArtists.source === results
        ? resolvedArtists.artists
        : (results?.artists ?? []),
    ),
    language,
    t("music.metadata.deezerFans"),
    artistIdentityKey(query),
  );
  const tracks: MusicCatalogItem[] = (results?.tracks ?? []).map((track) => ({
    kind: "track",
    ...track,
  }));
  const albums: MusicCatalogItem[] = (results?.albums ?? []).map((album) => ({
    kind: "album",
    ...album,
  }));
  const artists: MusicCatalogItem[] = artistResults.map((artist) => ({
    kind: "artist",
    ...artist,
  }));
  const playlists: MusicCatalogItem[] = (results?.playlists ?? []).map((playlist) => ({
    kind: "playlist",
    ...playlist,
  }));
  const total = tracks.length + albums.length + artists.length + playlists.length;
  const top = musicSearchTop(results ? { ...results, artists: artistResults } : null, query);
  const categoryCount = (
    {
      tracks: tracks.length,
      albums: albums.length,
      artists: artists.length,
      playlists: playlists.length,
    } as Record<string, number>
  )[category];

  return (
    <section
      data-scroll-anchor="search"
      aria-label={variant === "genre" ? query : t("music.searchResults")}
      className="music-search-page flex flex-col gap-6"
    >
      <div className="flex items-end justify-between gap-4 border-b border-edge-soft pb-4">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.42em] text-ink-subtle">
            {variant === "genre" ? t("music.genre.eyebrow") : t("music.searchResults")}
          </p>
          <h2
            className="mt-2 truncate font-semibold text-[32px] font-medium leading-tight tracking-tight text-ink"
            title={query}
          >
            {query}
          </h2>
          {variant === "genre" && (
            <p className="mt-1 text-[13px] text-ink-subtle">{t("music.genre.tagged", { query })}</p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {results && variant !== "genre" && (
            <span className="hidden text-[13px] text-ink-subtle sm:inline">
              {t("music.search.resultCount", { count: total })}
            </span>
          )}
          <button
            type="button"
            data-music-inner-back
            onClick={onClear}
            className="inline-flex h-11 items-center gap-2 rounded-full border border-edge px-4 text-[12px] font-medium text-ink transition-colors duration-200 ease-out hover:bg-elevated"
          >
            {variant === "genre" ? (
              <ChevronLeft size={14} aria-hidden="true" />
            ) : (
              <X size={14} aria-hidden="true" />
            )}
            {variant === "genre" ? t("music.genre.back") : t("music.search.resume")}
          </button>
        </div>
      </div>
      <div className="flex flex-wrap gap-2" aria-label={t("music.searchResults")}>
        {[
          ["all", "music.filter.all", total, Search],
          ["artists", "music.search.artists", artists.length, UserRound],
          ["tracks", "music.search.tracks", tracks.length, Music2],
          ["albums", "music.search.albums", albums.length, Disc3],
          ["playlists", "music.search.playlists", playlists.length, ListMusic],
        ].map(([id, label, count, Icon]) => {
          const Glyph = Icon as typeof Search;
          return (
            <button
              type="button"
              key={String(id)}
              aria-pressed={category === id}
              onClick={() => setCategory(String(id))}
              className={`inline-flex items-center gap-2 rounded-md px-4 py-2.5 text-sm ${category === id ? "bg-ink text-canvas" : "bg-elevated text-ink-muted hover:text-ink"}`}
            >
              <Glyph size={16} />
              {t(String(label))}
              <small className="opacity-65">{String(count)}</small>
            </button>
          );
        })}
      </div>

      {error ? (
        <MusicSectionError message={error} onRetry={onRetry} />
      ) : !results ? (
        <MusicTrackGridSkeleton count={9} />
      ) : total === 0 && !top ? (
        <MusicSectionEmpty label={t("music.searchEmpty")} />
      ) : (
        <>
          {category !== "all" && categoryCount === 0 && (
            <MusicSectionEmpty label={t("music.row.emptyRow")} />
          )}
          {top && category === "all" && (
            <MusicCatalogRow
              row={localRow("search:top", t("music.search.top"), "", "wide", [top])}
              onPlay={(item) =>
                item.kind === "track" ? onPlayTrack(item, results.tracks) : onOpenItem(item, [item])
              }
            />
          )}
          {artists.length > 0 &&
            (category === "all" || category === "artists") &&
            (identitySettled ? (
              <MusicCatalogRow
                row={localRow("search:artists", t("music.search.artists"), "", "circles", artists)}
                onPlay={(item) => onOpenItem(item, artists)}
              />
            ) : (
              <MusicTrackGridSkeleton count={6} />
            ))}
          {tracks.length > 0 && (category === "all" || category === "tracks") && (
            <MusicCatalogRow
              row={localRow("search:tracks", t("music.search.tracks"), "", "trackGrid", tracks)}
              count={tracks.length}
              numbered
              onPlay={(item) =>
                item.kind === "track" ? onPlayTrack(item, results.tracks) : onOpenItem(item, tracks)
              }
            />
          )}
          {albums.length > 0 && (category === "all" || category === "albums") && (
            <MusicCatalogRow
              row={localRow("search:albums", t("music.search.albums"), "", "covers", albums)}
              onPlay={(item) => onOpenItem(item, albums)}
            />
          )}
          {playlists.length > 0 && (category === "all" || category === "playlists") && (
            <MusicCatalogRow
              row={localRow(
                "search:playlists",
                t("music.search.playlists"),
                "",
                "covers",
                playlists,
              )}
              onPlay={(item) => onOpenItem(item, playlists)}
            />
          )}
        </>
      )}
      {searching && results && (
        <p aria-live="polite" className="text-[13px] text-ink-subtle">
          {t("music.loading")}
        </p>
      )}
    </section>
  );
}
