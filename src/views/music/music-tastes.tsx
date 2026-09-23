import { useEffect, useRef, useState } from "react";
import { Check, ChevronLeft, LoaderCircle, Search, SlidersHorizontal } from "lucide-react";
import { MusicDiscoveryIcon } from "@/components/music/music-discovery-icon";
import { MusicCatalogRow } from "@/components/music/music-catalog-row";
import { MusicSectionError } from "@/components/music/music-track-grid";
import { useT } from "@/lib/i18n";
import {
  loadMusicDiscoveryChart,
  loadMusicDiscoveryGenres,
  loadMusicDiscoveryPlaylists,
  type MusicDiscoveryGenre,
} from "@/lib/music/discovery";
import { readMusicPreference, writeMusicPreference } from "@/lib/music/preferences";
import type { MusicCatalogItem, MusicCatalogRow as CatalogRow } from "@/lib/music/types";
import "./music-tastes.css";

const TASTES_KEY = "harbor.music.tastes.v1";
export function readMusicTastes(): number[] {
  try {
    const stored: unknown = JSON.parse(readMusicPreference(TASTES_KEY) ?? "[]");
    return Array.isArray(stored)
      ? [...new Set(stored.filter((id): id is number => Number.isSafeInteger(id) && id > 0))]
      : [];
  } catch {
    return [];
  }
}

export function MusicTastes({
  selected,
  onSave,
  onBack,
}: {
  selected: number[];
  onSave: (ids: number[]) => void;
  onBack: () => void;
}) {
  const t = useT();
  const heading = useRef<HTMLHeadingElement>(null);
  const [draft, setDraft] = useState(selected);
  const [genres, setGenres] = useState<MusicDiscoveryGenre[]>([]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("loading");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, []);
  useEffect(() => {
    let live = true;
    setStatus("loading");
    loadMusicDiscoveryGenres()
      .then((items) => {
        if (live) {
          setGenres(items);
          setStatus("ready");
        }
      })
      .catch(() => {
        if (live) setStatus("error");
      });
    return () => {
      live = false;
    };
  }, [retry]);
  const filtered = genres.filter((genre) =>
    genre.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()),
  );
  return (
    <section className="music-tastes">
      <button type="button" className="music-tastes-back" data-music-inner-back onClick={onBack}>
        <ChevronLeft className="dir-icon" size={18} />
        {t("music.watch.back")}
      </button>
      <header>
        <SlidersHorizontal size={26} />
        <h1 ref={heading} tabIndex={-1}>
          {t("music.taste.choose")}
        </h1>
        <p>{t("music.taste.body")}</p>
      </header>
      <div className="music-tastes-toolbar">
        <label>
          <Search size={18} />
          <input
            type="search"
            aria-label={t("music.taste.search")}
            placeholder={t("music.taste.search")}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <span>{t("music.taste.selected", { count: draft.length })}</span>
        <button type="button" onClick={() => setDraft([])} disabled={!draft.length}>
          {t("music.taste.clear")}
        </button>
      </div>
      {status === "loading" ? (
        <p role="status">
          <LoaderCircle className="animate-spin motion-reduce:animate-none" size={20} />
          {t("music.loading")}
        </p>
      ) : status === "error" ? (
        <MusicSectionError onRetry={() => setRetry((value) => value + 1)} />
      ) : (
        <div className="music-taste-grid">
          {filtered.map((genre) => (
            <button
              type="button"
              key={genre.id}
              aria-pressed={draft.includes(genre.id)}
              onClick={() =>
                setDraft((values) =>
                  values.includes(genre.id)
                    ? values.filter((id) => id !== genre.id)
                    : [...values, genre.id],
                )
              }
            >
              {(genre.picture_big || genre.picture_medium) && (
                <img
                  src={genre.picture_big || genre.picture_medium}
                  alt=""
                  loading="lazy"
                  decoding="async"
                />
              )}
              <MusicDiscoveryIcon genreId={genre.id} />
              <strong>{genre.name}</strong>
              <span className="music-taste-check">
                {draft.includes(genre.id) && <Check size={17} />}
              </span>
            </button>
          ))}
        </div>
      )}
      {status === "ready" && !filtered.length && <p>{t("music.row.emptyRow")}</p>}
      <footer>
        <p>{t("music.taste.local")}</p>
        <button
          type="button"
          className="music-home-primary"
          onClick={() => {
            writeMusicPreference(TASTES_KEY, JSON.stringify(draft));
            onSave(draft);
          }}
        >
          {t("music.taste.save")}
        </button>
      </footer>
    </section>
  );
}

export function useMusicTasteRows(selected: number[]) {
  const [rows, setRows] = useState<CatalogRow[]>([]);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let live = true;
    setRows([]);
    setError(false);
    setLoading(selected.length > 0);
    if (!selected.length) return;
    (async () => {
      const all = await loadMusicDiscoveryGenres();
      const genres = selected.flatMap((id) => all.find((genre) => genre.id === id) ?? []);
      for (let at = 0; at < genres.length && live; at += 3) {
        const batch = await Promise.allSettled(
          genres.slice(at, at + 3).map(async (genre) => {
            const chart = await loadMusicDiscoveryChart(genre.id);
            return {
              id: `taste:${genre.id}`,
              title: genre.name,
              titleLiteral: true,
              layout: "trackGrid" as const,
              source: "deezer",
              items: chart.tracks.map((track) => ({ ...track, kind: "track" as const })),
            };
          }),
        );
        if (!live) return;
        if (batch.some((result) => result.status === "rejected")) setError(true);
        setRows((previous) => [
          ...previous,
          ...batch.flatMap((result) =>
            result.status === "fulfilled" && result.value.items.length ? [result.value] : [],
          ),
        ]);
      }
    })()
      .catch(() => {
        if (live) setError(true);
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [selected, retry]);
  return { rows, error, loading, retry: () => setRetry((value) => value + 1) };
}

export function MusicTopPlaylists({
  onBack,
  onOpen,
}: {
  onBack: () => void;
  onOpen: (item: MusicCatalogItem, siblings: MusicCatalogItem[]) => void;
}) {
  const t = useT();
  const heading = useRef<HTMLHeadingElement>(null);
  const [items, setItems] = useState<MusicCatalogItem[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, []);
  useEffect(() => {
    let live = true;
    setStatus("loading");
    loadMusicDiscoveryPlaylists()
      .then((result) => {
        if (live) {
          setItems(result);
          setStatus("ready");
        }
      })
      .catch(() => {
        if (live) setStatus("error");
      });
    return () => {
      live = false;
    };
  }, [retry]);
  return (
    <section className="music-tastes">
      <button type="button" className="music-tastes-back" data-music-inner-back onClick={onBack}>
        <ChevronLeft className="dir-icon" size={18} />
        {t("music.watch.back")}
      </button>
      <h1 ref={heading} tabIndex={-1} className="text-3xl font-semibold">
        {t("music.taste.playlists")}
      </h1>
      <MusicCatalogRow
        row={{
          id: "discovery:playlists",
          title: "music.taste.playlists",
          titleLiteral: false,
          layout: "covers",
          source: "deezer",
          items,
        }}
        status={status}
        onRetry={() => setRetry((value) => value + 1)}
        onOpen={(item) => onOpen(item, items)}
      />
    </section>
  );
}
