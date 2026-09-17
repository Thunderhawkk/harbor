import { useMemo, useRef } from "react";
import { useT } from "@/lib/i18n";
import { useMangaFavorites } from "@/lib/manga-favorites";
import { mangaLists } from "@/lib/manga-lists";
import { searchManga, type MangaSummary } from "@/lib/manga/api";
import { hasAnyMangaSource } from "@/lib/manga/sources";
import { useView } from "@/lib/view";
import { Poster } from "@/components/poster";
import { MyListsTab } from "../library/my-lists-tab";
import { MangaPosterRow } from "./manga-poster-row";

function useOpenTitle() {
  const { openManga } = useView();
  const busyRef = useRef<Set<string>>(new Set());
  return async (id: string, title: string) => {
    if (busyRef.current.has(id)) return;
    const name = title.trim();
    if (!name || !hasAnyMangaSource()) {
      openManga(id);
      return;
    }
    busyRef.current.add(id);
    try {
      const norm = (s: string) => s.trim().toLowerCase();
      const results = await searchManga(name);
      const match =
        results.find(
          (r) => norm(r.title) === norm(name) || (r.altTitle != null && norm(r.altTitle) === norm(name)),
        ) ?? results[0];
      openManga(match ? match.id : id);
    } catch {
      openManga(id);
    } finally {
      busyRef.current.delete(id);
    }
  };
}

export function MangaLibrary() {
  const t = useT();
  const openTitle = useOpenTitle();
  const { items } = useMangaFavorites();
  const favs = useMemo(() => [...items.values()].sort((a, b) => b.addedAt - a.addedAt), [items]);
  const [spotlight, ...rest] = favs;
  const railItems: MangaSummary[] = rest;
  const openRailTitle = (m: MangaSummary) => void openTitle(m.id, m.title);

  return (
    <div className="flex flex-col gap-8">
      {spotlight ? (
        <div className="relative overflow-hidden rounded-2xl ring-1 ring-edge-soft">
          {spotlight.cover && (
            <img
              src={spotlight.cover}
              alt=""
              aria-hidden
              loading="eager"
              decoding="async"
              className="absolute inset-0 h-full w-full scale-125 object-cover opacity-30 blur-2xl [transform:translateZ(0)]"
            />
          )}
          <span
            aria-hidden
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(to right, color-mix(in oklch, var(--color-canvas), transparent 8%) 30%, color-mix(in oklch, var(--color-canvas), transparent 62%))",
            }}
          />
          <span className="absolute start-6 top-5 text-[11px] font-bold uppercase tracking-[0.24em] text-accent sm:start-8 sm:top-6">
            {t("Favorites")}
          </span>
          <button
            type="button"
            onClick={() => void openTitle(spotlight.id, spotlight.title)}
            className="group relative flex w-full items-center gap-6 p-6 pt-11 text-start sm:p-8 sm:pt-12"
          >
            <span className="w-28 shrink-0 sm:w-36">
              <Poster
                src={spotlight.cover}
                seed={spotlight.id}
                ratio="portrait"
                className="rounded-xl shadow-[0_24px_50px_-12px_rgba(0,0,0,0.7)] ring-1 ring-white/20 transition-transform duration-300 group-hover:scale-[1.02] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
              />
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-1.5">
              <span className="text-[11px] font-bold uppercase tracking-[0.24em] text-accent">
                {t("Latest addition")}
              </span>
              <span className="text-[26px] font-semibold leading-[1.05] tracking-tight text-ink drop-shadow-[0_2px_18px_rgba(0,0,0,0.55)] sm:text-[36px]">
                {spotlight.title}
              </span>
              <span className="mt-2 inline-flex w-fit items-center rounded-full bg-ink px-5 py-2 text-[13px] font-semibold text-canvas transition-transform duration-200 group-hover:scale-[1.03] motion-reduce:transition-none">
                {t("Open")}
              </span>
            </span>
          </button>
          {rest.length > 0 && (
            <div className="px-8 [content-visibility:auto] [contain-intrinsic-size:auto_320px]">
              <MangaPosterRow
                items={railItems}
                onOpen={openRailTitle}
                scrollKey="manga:library:favorites"
                min={112}
                alwaysActive
                releasePosters={false}
              />
              <div className="h-3" />
            </div>
          )}
        </div>
      ) : (
        <p className="rounded-2xl border border-dashed border-edge-soft bg-surface/40 px-6 py-10 text-center text-[14px] text-ink-muted">
          {t("Star any manga and it takes over this screen.")}
        </p>
      )}

      <section className="flex flex-col gap-4">
        <h2 className="text-[22px] font-medium tracking-tight text-ink">{t("Lists")}</h2>
        <MyListsTab
          store={mangaLists}
          showSearch={false}
          emptyCopy={{
            title: t("Create your first manga list"),
            body: t("Group the manga you love. Reading now, backlog, all-time favorites."),
            action: t("New list"),
          }}
        />
      </section>
    </div>
  );
}
