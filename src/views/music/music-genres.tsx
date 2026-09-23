import { useEffect, useRef, useState } from "react";
import { ChevronLeft, LoaderCircle } from "lucide-react";
import { MusicCatalogRow } from "@/components/music/music-catalog-row";
import {
  MusicBillboardCharts,
  MusicDiscoveryChartRow,
} from "@/components/music/music-discovery-charts";
import { MusicDiscoveryIcon } from "@/components/music/music-discovery-icon";
import {
  MusicSectionEmpty,
  MusicSectionError,
  MusicSectionHead,
} from "@/components/music/music-track-grid";
import { useT } from "@/lib/i18n";
import {
  loadMusicDiscoveryChart,
  loadMusicDiscoveryGenres,
  type MusicDiscoveryChart,
} from "@/lib/music/discovery";
import type { MusicCatalogItem } from "@/lib/music/types";
import "./music-discovery.css";

export type MusicGenreEntry = {
  id: number;
  name: string;
  picture_big?: string;
  picture_medium?: string;
};
// Song/artist detail temporarily unmounts discovery; keep the genre-grid return point.
let genreOrigin: { id: number; top: number } | null = null;
export function MusicGenres({
  onOpen,
  genre,
  onGenre,
  onBillboard,
}: {
  onBillboard?: (chartId?: string) => void;
  genre: MusicGenreEntry | null;
  onGenre: (genre: MusicGenreEntry | null) => void;
  onOpen: (item: MusicCatalogItem, siblings: MusicCatalogItem[]) => void;
}) {
  const t = useT();
  const [genres, setGenres] = useState<MusicGenreEntry[]>([]);
  const [genreLoading, setGenreLoading] = useState(true);
  const [genreError, setGenreError] = useState(false);
  const [chart, setChart] = useState<MusicDiscoveryChart>({
    tracks: [],
    positions: [],
    artists: [],
  });
  const [chartLoading, setChartLoading] = useState(true);
  const [chartError, setChartError] = useState(false);
  const [genreRetry, setGenreRetry] = useState(0);
  const [chartRetry, setChartRetry] = useState(0);
  const root = useRef<HTMLElement>(null);

  useEffect(() => {
    let cancelled = false;
    setGenreLoading(true);
    setGenreError(false);
    loadMusicDiscoveryGenres()
      .then((result) => {
        if (!cancelled) setGenres(result);
      })
      .catch(() => {
        if (!cancelled) setGenreError(true);
      })
      .finally(() => {
        if (!cancelled) setGenreLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [genreRetry]);

  useEffect(() => {
    let cancelled = false;
    setChartLoading(true);
    setChartError(false);
    setChart({ tracks: [], positions: [], artists: [] });
    loadMusicDiscoveryChart(genre?.id)
      .then((result) => {
        if (!cancelled) setChart(result);
      })
      .catch(() => {
        if (!cancelled) setChartError(true);
      })
      .finally(() => {
        if (!cancelled) setChartLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [genre?.id, chartRetry]);

  useEffect(() => {
    if (genre || genreLoading || chartLoading || !genreOrigin) return;
    const saved = genreOrigin;
    const frame = requestAnimationFrame(() => {
      const scroll = root.current?.closest<HTMLElement>("[data-music-view]");
      if (scroll) scroll.scrollTop = saved.top;
      root.current
        ?.querySelector<HTMLButtonElement>(`[data-music-genre="${saved.id}"]`)
        ?.focus({ preventScroll: true });
      genreOrigin = null;
    });
    return () => cancelAnimationFrame(frame);
  }, [genre, genreLoading, chartLoading]);

  const selectGenre = (selected: MusicGenreEntry) => {
    const scroll = root.current?.closest<HTMLElement>("[data-music-view]");
    genreOrigin = { id: selected.id, top: scroll?.scrollTop ?? 0 };
    onGenre(selected);
    scroll?.scrollTo({ top: 0 });
    requestAnimationFrame(() =>
      (
        document.querySelector<HTMLElement>("[data-music-mast-back]") ??
        document.querySelector<HTMLElement>("[data-music-consolidated-back] h1") ??
        root.current?.querySelector<HTMLButtonElement>(".music-discovery-back")
      )?.focus({ preventScroll: true }),
    );
  };

  return (
    <section
      ref={root}
      className="music-discovery"
      aria-busy={chartLoading || (!genre && genreLoading)}
    >
      {genre ? (
        <>
          <button
            data-music-inner-back
            className="music-discovery-back"
            type="button"
            onClick={() => onGenre(null)}
          >
            <ChevronLeft className="dir-icon" size={18} aria-hidden="true" />
            {t("music.tab.explore")}
          </button>
          <header className="music-discovery-hero">
            {(genre.picture_big || genre.picture_medium) && (
              <img src={genre.picture_big ?? genre.picture_medium} alt="" />
            )}
            <div>
              <h2>{genre.name}</h2>
              <p>
                <MusicDiscoveryIcon genreId={genre.id} />
                Deezer
              </p>
            </div>
          </header>
        </>
      ) : (
        <h2 className="text-[28px] font-semibold tracking-tight text-ink">{t("music.discover")}</h2>
      )}

      <MusicDiscoveryChartRow
        tracks={chart.tracks}
        positions={chart.positions}
        loading={chartLoading}
        error={chartError}
        genreId={genre?.id}
        onRetry={() => setChartRetry((value) => value + 1)}
        onOpen={onOpen}
      />

      {genre ? (
        !chartError && (
          <MusicCatalogRow
            row={{
              id: `genre:${genre.id}:artists`,
              title: "music.search.artists",
              titleLiteral: false,
              layout: "circles",
              source: "deezer",
              items: chart.artists,
            }}
            status={chartLoading ? "loading" : "ready"}
            onOpen={(item) => onOpen(item, chart.artists)}
          />
        )
      ) : (
        <>
          <MusicBillboardCharts onOpen={onOpen} onBrowse={onBillboard} />
          <section className="flex flex-col gap-4">
            <MusicSectionHead title={t("music.tab.explore")} subtitle="Deezer" />
            {genreLoading ? (
              <div role="status" className="flex items-center gap-3 py-8 text-ink-muted">
                <LoaderCircle
                  className="animate-spin motion-reduce:animate-none"
                  size={20}
                  aria-hidden="true"
                />
                {t("music.loading")}
              </div>
            ) : genreError ? (
              <MusicSectionError onRetry={() => setGenreRetry((value) => value + 1)} />
            ) : !genres.length ? (
              <MusicSectionEmpty />
            ) : (
              <div className="music-discovery-genres">
                {genres.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    data-music-genre={item.id}
                    onClick={() => selectGenre(item)}
                  >
                    {(item.picture_big || item.picture_medium) && (
                      <img
                        src={item.picture_big ?? item.picture_medium}
                        alt=""
                        loading="lazy"
                        decoding="async"
                      />
                    )}
                    <MusicDiscoveryIcon genreId={item.id} />
                    <span>{item.name}</span>
                  </button>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </section>
  );
}
