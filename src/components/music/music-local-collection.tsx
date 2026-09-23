import { MusicCollectionControls } from "./music-collection-controls";
import { useCallback, useEffect, useRef, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { MusicArtistCard } from "./music-artist-card";
import { MusicCoverCard } from "./music-cover-card";
import { MusicTrackRow } from "./music-track-row";
import { useMusicPlaylistPicker } from "./music-playlist-picker";
import { enqueueMusic } from "@/lib/music/player";
import { localCollection } from "@/lib/music/catalog";
import type { MusicCatalogItem } from "@/lib/music/types";
import { useT } from "@/lib/i18n";

type Kind = "albums" | "artists" | "tracks";
export function MusicLocalCollection({
  kind,
  query,
  onOpen,
  onConnect,
}: {
  kind: Kind;
  query: string;
  onOpen: (item: MusicCatalogItem, siblings: MusicCatalogItem[]) => void;
  onConnect: () => void;
}) {
  const t = useT();
  const { openPlaylistPicker } = useMusicPlaylistPicker();
  const [items, setItems] = useState<MusicCatalogItem[]>([]);
  const [next, setNext] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const generation = useRef(0);
  const load = useCallback(
    (offset: number) => {
      const request = ++generation.current;
      setLoading(true);
      setError("");
      localCollection(kind, query.trim(), offset)
        .then((page) => {
          if (generation.current !== request) return;
          setItems((current) =>
            offset === 0
              ? page.items
              : [
                  ...current,
                  ...page.items.filter(
                    (item) => !current.some((old) => old.id === item.id && old.kind === item.kind),
                  ),
                ],
          );
          setNext(page.nextOffset);
        })
        .catch((cause) => {
          if (generation.current === request)
            setError(cause instanceof Error ? cause.message : String(cause));
        })
        .finally(() => {
          if (generation.current === request) setLoading(false);
        });
    },
    [kind, query],
  );
  useEffect(() => {
    setItems([]);
    setNext(null);
    setLoading(true);
    setError("");
    const timer = setTimeout(() => load(0), query ? 180 : 0);
    return () => {
      clearTimeout(timer);
      generation.current += 1;
    };
  }, [load, revision, query]);
  useEffect(() => {
    const changed = () => setRevision((value) => value + 1);
    window.addEventListener("harbor:music-library-changed", changed);
    return () => window.removeEventListener("harbor:music-library-changed", changed);
  }, []);
  return (
    <section className="music-library-local" aria-label={t("music.connections.local")}>
      {kind === "tracks" && items.length > 0 && (
        <div className="mb-5">
          <MusicCollectionControls
            tracks={items.filter((item) => item.kind === "track")}
            onPlay={(track) => onOpen({ ...track, kind: "track" }, items)}
          />
        </div>
      )}
      {loading && items.length === 0 ? (
        <p role="status" className="music-library-empty">
          <LoaderCircle size={18} className="animate-spin motion-reduce:animate-none" />
          {t("music.loading")}
        </p>
      ) : items.length > 0 ? (
        <div
          className={kind === "tracks" ? "music-library-local-tracks" : "music-library-cover-grid"}
        >
          {items.map((item, index) =>
            item.kind === "track" ? (
              <MusicTrackRow
                key={item.id}
                track={item}
                showDuration
                index={index + 1}
                onPlay={() => onOpen(item, items)}
                onAddToQueue={() => enqueueMusic(item)}
                onAddToPlaylist={() => openPlaylistPicker(item)}
              />
            ) : item.kind === "artist" ? (
              <MusicArtistCard key={item.id} artist={item} onOpen={() => onOpen(item, items)} />
            ) : (
              <MusicCoverCard key={item.id} item={item} onOpen={() => onOpen(item, items)} />
            ),
          )}
        </div>
      ) : (
        !error && (
          <div className="music-library-empty">
            <p>{t(query ? "music.library.noMatches" : "music.library.localEmpty")}</p>
            {!query && (
              <button type="button" className="music-library-text" onClick={onConnect}>
                {t("music.home.addFolder")}
              </button>
            )}
          </div>
        )
      )}
      {error && (
        <div role="alert" className="music-library-empty">
          <p>{error}</p>
          <button type="button" onClick={() => load(next ?? 0)} className="music-library-button">
            {t("common.retry")}
          </button>
        </div>
      )}
      {next !== null && !error && (
        <button
          type="button"
          disabled={loading}
          onClick={() => load(next)}
          className="music-library-button music-library-load-more"
        >
          {loading && (
            <LoaderCircle size={17} className="animate-spin motion-reduce:animate-none" />
          )}
          {t("music.library.loadMore")}
        </button>
      )}
    </section>
  );
}
