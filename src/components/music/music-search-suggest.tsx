import { useEffect, useMemo, useRef, useState } from "react";
import { Disc3, Mic2, Music2 } from "lucide-react";
import { searchTyped } from "@/lib/music/catalog";
import { artistIdentityKey, peekArtistIdentity, resolveArtist } from "@/lib/music/artist-authority";
import { collapseArtistRows } from "@/lib/music/search-artists";
import type { MusicCatalogItem } from "@/lib/music/types";
import { useT, useUiLanguage } from "@/lib/i18n";

const DEBOUNCE_MS = 200;
const MIN_CHARS = 2;
const CAP = { artists: 3, tracks: 5, albums: 3 } as const;

type Group = { key: "artists" | "tracks" | "albums"; label: string; items: MusicCatalogItem[] };
type Suggest = { query: string; results: Awaited<ReturnType<typeof searchTyped>> };

export function useMusicSuggest(query: string, connector: string | null, enabled: boolean) {
  const t = useT();
  const language = useUiLanguage();
  const [found, setFound] = useState<Suggest | null>(null);
  const [pass, setPass] = useState(0);
  const generation = useRef(0);

  useEffect(() => {
    const trimmed = query.trim();
    if (!enabled || trimmed.length < MIN_CHARS) {
      generation.current += 1;
      setFound(null);
      return;
    }
    const mine = ++generation.current;
    const timer = window.setTimeout(() => {
      void searchTyped(trimmed, 8, connector ?? undefined)
        .then((res) => {
          if (generation.current !== mine) return;
          setFound({ query: trimmed, results: res });
          const key = artistIdentityKey(trimmed);
          const named = res.artists.filter((a) => artistIdentityKey(a.name) === key);
          if (named.length < 2 || peekArtistIdentity(trimmed).probed) return;
          void resolveArtist(named[0].name, { hint: named })
            .catch(() => null)
            .then(() => {
              if (generation.current === mine) setPass((value) => value + 1);
            });
        })
        .catch(() => {
          if (generation.current === mine) setFound(null);
        });
    }, DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [query, connector, enabled]);

  return useMemo(() => {
    if (!enabled || !found) return [];
    const res = found.results;
    const next: Group[] = [
      {
        key: "artists",
        label: t("music.search.artists"),
        items: collapseArtistRows(
          res.artists,
          language,
          t("music.metadata.deezerFans"),
          artistIdentityKey(found.query),
        )
          .slice(0, CAP.artists)
          .map((a) => ({ kind: "artist", ...a })),
      },
      {
        key: "tracks",
        label: t("music.search.tracks"),
        items: res.tracks.slice(0, CAP.tracks).map((a) => ({ kind: "track", ...a })),
      },
      {
        key: "albums",
        label: t("music.search.albums"),
        items: res.albums.slice(0, CAP.albums).map((a) => ({ kind: "album", ...a })),
      },
    ];
    return next.filter((g) => g.items.length > 0);
  }, [found, pass, t, language, enabled]);
}

function artOf(item: MusicCatalogItem): string | null {
  if (item.kind === "artist") return item.artwork ?? null;
  if (item.kind === "album" || item.kind === "track") return item.artwork || null;
  return null;
}

function titleOf(item: MusicCatalogItem): string {
  if (item.kind === "artist") return item.name;
  if (item.kind === "album") return item.title;
  if (item.kind === "track") return item.title;
  return "";
}

function subtitleOf(item: MusicCatalogItem): string {
  if (item.kind === "artist") return item.subtitle ?? "";
  if (item.kind === "album") return item.artist;
  if (item.kind === "track") return item.artist;
  return "";
}

function GlyphFor({ kind }: { kind: MusicCatalogItem["kind"] }) {
  if (kind === "artist") return <Mic2 size={13} aria-hidden />;
  if (kind === "album") return <Disc3 size={13} aria-hidden />;
  return <Music2 size={13} aria-hidden />;
}

export function MusicSearchSuggest({
  groups,
  activeIndex,
  onPick,
  onHover,
}: {
  groups: Group[];
  activeIndex: number;
  onPick: (item: MusicCatalogItem) => void;
  onHover: (index: number) => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const flat = useMemo(() => groups.flatMap((g) => g.items), [groups]);

  useEffect(() => {
    if (activeIndex < 0) return;
    const el = listRef.current?.querySelector<HTMLElement>(`[data-suggest-index="${activeIndex}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  if (!flat.length) return null;

  let index = -1;
  return (
    <div
      ref={listRef}
      role="listbox"
      aria-label="search suggestions"
      className="harbor-float animate-menu-in max-h-[336px] overflow-y-auto overscroll-contain rounded-md bg-elevated p-1 ring-1 ring-edge-soft"
    >
      {groups.map((group) => (
        <div key={group.key}>
          <div className="px-2.5 pb-1 pt-2 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-ink-subtle">
            {group.label}
          </div>
          {group.items.map((item) => {
            index += 1;
            const i = index;
            const art = artOf(item);
            const sub = subtitleOf(item);
            return (
              <button
                key={`${item.kind}:${item.id}`}
                type="button"
                role="option"
                aria-selected={i === activeIndex}
                data-suggest-index={i}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => onHover(i)}
                onClick={() => onPick(item)}
                className={`flex h-[42px] w-full items-center gap-2.5 rounded-md px-2 text-start transition-colors duration-150 ease-out ${
                  i === activeIndex ? "bg-raised" : ""
                }`}
              >
                <span
                  className={`grid size-[30px] shrink-0 place-items-center overflow-hidden bg-canvas/60 text-ink-subtle ${
                    item.kind === "artist" ? "rounded-full" : "rounded-[5px]"
                  }`}
                >
                  {art ? (
                    <img
                      src={art}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      className="size-full object-cover"
                    />
                  ) : (
                    <GlyphFor kind={item.kind} />
                  )}
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-[12.5px] text-ink">{titleOf(item)}</span>
                  {sub ? <span className="truncate text-[11px] text-ink-subtle">{sub}</span> : null}
                </span>
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

export type { Group as MusicSuggestGroup };
