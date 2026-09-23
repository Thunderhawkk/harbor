import { MusicBackButton } from "./music-back-button";
import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { open, save } from "@tauri-apps/plugin-dialog";
import { FileDown, FileUp, FolderOpen, LoaderCircle, Plus, Search, X } from "lucide-react";
import { Dropdown } from "@/components/dropdown";
import { pushBackHandler } from "@/lib/back-intercept";
import { MusicDownloads } from "./music-downloads";
import { MusicLocalCollection } from "./music-local-collection";
import { MusicSpotifyLibrary } from "./music-spotify-library";
import { useMusicConnections } from "./music-connections";
import { MusicLastFm } from "@/components/music/music-lastfm";
import { MusicCoverCard } from "./music-cover-card";
import { MusicPlaylistCover } from "./music-playlist-cover";
import { MusicServiceLogo } from "./music-service-logo";
import { LibraryTrackList, PlaylistHeader } from "@/components/music/music-library-parts";
import { useT } from "@/lib/i18n";
import {
  addTrackToMusicPlaylist,
  addTracksToMusicPlaylist,
  createMusicPlaylist,
  exportMusicM3u,
  importMusicM3u,
  listMusicPlaylists,
  removeTrackFromMusicPlaylist,
  reorderMusicPlaylist,
} from "@/lib/music/library";
import { useMusicPlayer } from "@/lib/music/player";
import type { MusicCatalogItem, MusicPlaylist, MusicTrack } from "@/lib/music/types";
import "./music-library.css";

type LibraryView =
  | "downloads"
  | "albums"
  | "artists"
  | "tracks"
  | "playlists"
  | "saved"
  | "recent"
  | "spotify";
const VIEWS: LibraryView[] = [
  "downloads",
  "albums",
  "artists",
  "tracks",
  "playlists",
  "saved",
  "recent",
  "spotify",
];

const EMPTY_LIBRARY = { playlists: [] as MusicPlaylist[] };

export function MusicLibrary({
  onOpen,
  active = true,
  initialView,
  initialPlaylistId,
}: {
  onOpen: (item: MusicCatalogItem, siblings: MusicCatalogItem[]) => void;
  active?: boolean;
  initialView?: string;
  initialPlaylistId?: string;
}) {
  const t = useT();
  const { openConnections } = useMusicConnections();
  const player = useMusicPlayer();
  const [library, setLibrary] = useState(EMPTY_LIBRARY);
  const [selectedId, setSelectedId] = useState<string | null>(initialPlaylistId ?? null);
  const [playlistName, setPlaylistName] = useState("");
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [readError, setReadError] = useState<string | null>(null);
  const [libraryRevision, setLibraryRevision] = useState(0);
  const [view, setView] = useState<LibraryView>(() =>
    (VIEWS as string[]).includes(initialView ?? "") ? (initialView as LibraryView) : "albums",
  );
  const [query, setQuery] = useState("");
  const [trackQuery, setTrackQuery] = useState("");
  const [sort, setSort] = useState("default");
  const [creating, setCreating] = useState(false);
  const [adding, setAdding] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const playlistHeading = useRef<HTMLDivElement>(null);
  const origin = useRef<{ id: string; scroll: Element | null; top: number } | null>(null);
  const restoreOrigin = useRef(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setReadError(null);
    void listMusicPlaylists()
      .then((playlists) => {
        if (cancelled) return;
        setLibrary({ playlists });
      })
      .catch((reason) => {
        if (!cancelled) setReadError(reason instanceof Error ? reason.message : String(reason));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [libraryRevision]);

  const selected = useMemo(
    () => library.playlists.find((playlist) => playlist.id === selectedId) ?? null,
    [library.playlists, selectedId],
  );

  const replacePlaylist = (playlist: MusicPlaylist) => {
    setLibrary((current) => ({
      ...current,
      playlists: [playlist, ...current.playlists.filter((item) => item.id !== playlist.id)],
    }));
    setSelectedId(playlist.id);
  };

  const browse = (next: LibraryView) => {
    setView(next);
    setSelectedId(null);
    setQuery("");
    setSort("default");
  };
  const closePlaylist = useCallback(() => {
    restoreOrigin.current = true;
    setSelectedId(null);
    setTrackQuery("");
    setSort("default");
    setAdding(false);
  }, []);
  useEffect(() => {
    const changed = () => setLibraryRevision((value) => value + 1);
    window.addEventListener("harbor:music-library-changed", changed);
    return () => window.removeEventListener("harbor:music-library-changed", changed);
  }, []);
  useEffect(() => {
    if (selectedId || view !== "playlists" || !restoreOrigin.current) return;
    const frame = requestAnimationFrame(() => {
      const previous = origin.current;
      if (previous?.scroll) previous.scroll.scrollTop = previous.top;
      const button = [
        ...(root.current?.querySelectorAll<HTMLButtonElement>("[data-library-playlist]") ?? []),
      ].find((item) => item.dataset.libraryPlaylist === previous?.id);
      (
        button ?? root.current?.querySelector<HTMLButtonElement>('[data-library-view="playlists"]')
      )?.focus({ preventScroll: true });
      origin.current = null;
      restoreOrigin.current = false;
    });
    return () => cancelAnimationFrame(frame);
  }, [selectedId, view, library.playlists]);
  useEffect(() => {
    if (!active || !selectedId || view !== "playlists") return;
    playlistHeading.current?.focus({ preventScroll: true });
    const remove = pushBackHandler(() => {
      closePlaylist();
      return true;
    });
    const escape = (event: KeyboardEvent) => {
      if (
        event.key !== "Escape" ||
        event.target instanceof HTMLInputElement ||
        document.querySelector('[role="dialog"], [role="menu"], [role="listbox"]')
      )
        return;
      event.preventDefault();
      event.stopImmediatePropagation();
      closePlaylist();
    };
    window.addEventListener("keydown", escape, true);
    return () => {
      remove();
      window.removeEventListener("keydown", escape, true);
    };
  }, [active, selectedId, view, closePlaylist]);
  const openPlaylist = (playlist: MusicPlaylist, button: HTMLButtonElement) => {
    let scroll: Element | null = button.parentElement;
    while (scroll && !/(auto|scroll)/.test(getComputedStyle(scroll).overflowY))
      scroll = scroll.parentElement;
    origin.current = { id: playlist.id, scroll, top: scroll?.scrollTop ?? 0 };
    setSelectedId(playlist.id);
    setTrackQuery("");
    setSort("default");
    setAdding(false);
  };

  const createPlaylist = (event: FormEvent) => {
    event.preventDefault();
    const name = playlistName.trim();
    if (!name || working) return;
    setWorking(true);
    setError(null);
    void createMusicPlaylist(name)
      .then((playlist) => {
        replacePlaylist(playlist);
        setPlaylistName("");
        setCreating(false);
        setView("playlists");
      })
      .catch((reason) => setError(reason instanceof Error ? reason.message : String(reason)))
      .finally(() => setWorking(false));
  };

  const addTrack = (track: MusicTrack) => {
    if (!selected || working) return;
    setWorking(true);
    setError(null);
    void addTrackToMusicPlaylist(selected.id, track)
      .then(replacePlaylist)
      .catch((reason) => setError(reason instanceof Error ? reason.message : String(reason)))
      .finally(() => setWorking(false));
  };

  const removeTrack = (track: MusicTrack) => {
    if (!selected || working) return;
    setWorking(true);
    setError(null);
    void removeTrackFromMusicPlaylist(selected.id, track.id)
      .then(replacePlaylist)
      .catch((reason) => setError(reason instanceof Error ? reason.message : String(reason)))
      .finally(() => setWorking(false));
  };

  const moveTrack = (track: MusicTrack, toIndex: number) => {
    if (!selected || working) return;
    setWorking(true);
    setError(null);
    void reorderMusicPlaylist(selected.id, track.id, toIndex)
      .then(replacePlaylist)
      .catch((reason) => setError(reason instanceof Error ? reason.message : String(reason)))
      .finally(() => setWorking(false));
  };

  const importM3u = () => {
    if (working) return;
    setWorking(true);
    setError(null);
    setNotice(null);
    void (async () => {
      const path = await open({
        multiple: false,
        filters: [{ name: t("music.m3u.playlist"), extensions: ["m3u", "m3u8"] }],
      });
      if (typeof path !== "string") return;
      const tracks = await importMusicM3u(path);
      const playlist = await createMusicPlaylist(nameFromM3uPath(path, t("music.m3u.imported")));
      const populated = await addTracksToMusicPlaylist(playlist.id, tracks);
      replacePlaylist(populated);
      setView("playlists");
      setNotice(t("music.m3u.importedNotice", { count: tracks.length, name: populated.name }));
    })()
      .catch((reason) => setError(reason instanceof Error ? reason.message : String(reason)))
      .finally(() => setWorking(false));
  };

  const exportM3u = () => {
    if (!selected || working) return;
    setWorking(true);
    setError(null);
    setNotice(null);
    void (async () => {
      const path = await save({
        defaultPath: playlistFilename(selected.name),
        filters: [{ name: t("music.m3u.playlist"), extensions: ["m3u"] }],
      });
      if (typeof path !== "string") return;
      await exportMusicM3u(selected.id, path);
      setNotice(
        t("music.m3u.exportedNotice", {
          count: selected.tracks.length,
          name: selected.name,
        }),
      );
    })()
      .catch((reason) => setError(reason instanceof Error ? reason.message : String(reason)))
      .finally(() => setWorking(false));
  };

  useEffect(() => {
    if (initialView && (VIEWS as string[]).includes(initialView))
      setView(initialView as LibraryView);
    if (initialPlaylistId) setSelectedId(initialPlaylistId);
  }, [initialView, initialPlaylistId]);

  const localView = view === "albums" || view === "artists" || view === "tracks";
  const currentQuery = selected && view === "playlists" ? trackQuery : query;
  const normalized = currentQuery.trim().toLocaleLowerCase();
  const sourceTracks =
    selected && view === "playlists"
      ? selected.tracks
      : view === "saved"
        ? player.likedTracks
        : player.recents;
  const visibleTracks = sourceTracks.filter(
    (track) =>
      !normalized ||
      `${track.title} ${track.artist} ${track.album ?? ""}`
        .toLocaleLowerCase()
        .includes(normalized),
  );
  if (sort === "title") visibleTracks.sort((a, b) => a.title.localeCompare(b.title));
  if (sort === "duration") visibleTracks.sort((a, b) => a.durationSeconds - b.durationSeconds);
  const playlists = library.playlists.filter(
    (playlist) => !normalized || playlist.name.toLocaleLowerCase().includes(normalized),
  );
  const viewLabel = (value: LibraryView) =>
    value === "spotify"
      ? "Spotify"
      : value === "downloads"
        ? t("music.download.library")
        : t(
            value === "saved"
              ? "music.saved"
              : value === "recent"
                ? "music.library.recent"
                : value === "playlists"
                  ? "music.playlists"
                  : `music.search.${value}`,
          );
  const recentItems: MusicCatalogItem[] = player.recents.map((track) => ({
    ...track,
    kind: "track",
  }));
  const trackView = view === "saved" || view === "recent" || (!!selected && view === "playlists");

  return (
    <div className="music-library" ref={root}>
      <header className="music-library-header">
        <div>
          <h2>{t("music.library")}</h2>
          <p>{t("music.library.permanent")}</p>
        </div>
        <div className="music-library-actions">
          <button
            type="button"
            className="music-library-button"
            onClick={() => openConnections("local")}
          >
            <FolderOpen size={17} />
            {t("music.home.addFolder")}
          </button>
          <button
            type="button"
            className="music-library-button"
            onClick={() => {
              browse("playlists");
              setCreating(true);
            }}
          >
            <Plus size={17} />
            {t("music.row.newPlaylist")}
          </button>
        </div>
      </header>

      {player.recents.length > 0 && view !== "recent" && !selected && (
        <section className="music-library-recent" aria-label={t("music.library.recent")}>
          <div className="music-library-section-heading">
            <h3>{t("music.library.recent")}</h3>
            <button type="button" className="music-library-text" onClick={() => browse("recent")}>
              {t("music.row.viewAll")}
            </button>
          </div>
          <div className="music-library-recent-covers">
            {recentItems.slice(0, 8).map((item) => (
              <MusicCoverCard key={item.id} item={item} onOpen={() => onOpen(item, recentItems)} />
            ))}
          </div>
        </section>
      )}

      <nav className="music-library-views" aria-label={t("music.library")}>
        {VIEWS.map((value) => (
          <button
            type="button"
            key={value}
            data-library-view={value}
            aria-current={view === value ? "page" : undefined}
            onClick={() => browse(value)}
          >
            {value === "spotify" && <MusicServiceLogo source="spotify" size={18} />}
            {viewLabel(value)}
            {value === "playlists" && library.playlists.length > 0 && (
              <small>{library.playlists.length}</small>
            )}
            {value === "saved" && player.likedTracks.length > 0 && (
              <small>{player.likedTracks.length}</small>
            )}
          </button>
        ))}
      </nav>

      {(error || notice) && (
        <p
          className={`music-library-notice ${error ? "text-danger" : "text-ink-muted"}`}
          role={error ? "alert" : "status"}
        >
          {error ?? notice}
        </p>
      )}
      {readError && view === "playlists" && (
        <div className="music-library-empty" role="alert">
          <p>{readError}</p>
          <button
            type="button"
            className="music-library-button"
            onClick={() => setLibraryRevision((value) => value + 1)}
          >
            {t("common.retry")}
          </button>
        </div>
      )}

      {view !== "spotify" && (
        <>
          {selected && view === "playlists" && <MusicBackButton onClick={closePlaylist} />}
          <div className="music-library-browser-toolbar">
            <div className="music-library-browser-title">
              <h3>
                {selected && view === "playlists"
                  ? t("music.spotifyLibrary.harbor")
                  : viewLabel(view)}
              </h3>
              {localView && <span>{t("music.connections.local")}</span>}
            </div>
            <div className="music-library-actions">
              <label className="music-library-search">
                <Search size={17} />
                <input
                  type="search"
                  value={currentQuery}
                  onChange={(event) =>
                    selected && view === "playlists"
                      ? setTrackQuery(event.target.value)
                      : setQuery(event.target.value)
                  }
                  maxLength={200}
                  aria-label={t(trackView ? "music.filter.tracks" : "music.searchLabel")}
                  placeholder={t(trackView ? "music.filter.tracks" : "music.searchPlaceholder")}
                />
                {currentQuery && (
                  <button
                    type="button"
                    aria-label={t("music.search.clear")}
                    onClick={() =>
                      selected && view === "playlists" ? setTrackQuery("") : setQuery("")
                    }
                  >
                    <X size={16} />
                  </button>
                )}
              </label>
              {trackView && (
                <Dropdown
                  value={sort}
                  onChange={setSort}
                  options={[
                    { value: "default", label: t("music.sort.default") },
                    { value: "title", label: t("music.sort.title") },
                    { value: "duration", label: t("music.sort.duration") },
                  ]}
                  ariaLabel={t("music.sort.label")}
                  className="music-library-sort"
                />
              )}
            </div>
          </div>
        </>
      )}

      {localView && (
        <MusicLocalCollection
          key={view}
          kind={view}
          query={query}
          onOpen={onOpen}
          onConnect={() => openConnections("local")}
        />
      )}
      {view === "downloads" && <MusicDownloads query={query} />}
      {view === "spotify" && (
        <MusicSpotifyLibrary
          active={active}
          onImported={(playlist) =>
            setLibrary((current) => ({
              ...current,
              playlists: [playlist, ...current.playlists.filter((item) => item.id !== playlist.id)],
            }))
          }
        />
      )}
      {view === "playlists" && (
        <section className="music-library-playlists">
          {!selected && (
            <>
              <div className="music-library-actions">
                <button
                  type="button"
                  className="music-library-button"
                  aria-expanded={creating}
                  onClick={() => setCreating((value) => !value)}
                >
                  <Plus size={17} />
                  {t("music.playlist.create")}
                </button>
                <button
                  type="button"
                  className="music-library-text"
                  disabled={working}
                  onClick={importM3u}
                >
                  <FileUp size={17} />
                  {t("music.m3u.import")}
                </button>
              </div>
              {creating && (
                <form className="music-library-create" onSubmit={createPlaylist}>
                  <input
                    autoFocus
                    value={playlistName}
                    onChange={(event) => setPlaylistName(event.target.value)}
                    maxLength={100}
                    aria-label={t("music.playlist.nameLabel")}
                    placeholder={t("music.playlist.namePlaceholder")}
                    onKeyDown={(event) => {
                      if (event.key === "Escape") {
                        event.stopPropagation();
                        setCreating(false);
                      }
                    }}
                  />
                  <button
                    type="submit"
                    className="music-library-button"
                    disabled={!playlistName.trim() || working}
                  >
                    {working ? (
                      <LoaderCircle size={17} className="animate-spin motion-reduce:animate-none" />
                    ) : (
                      <Plus size={17} />
                    )}
                    {t("music.playlist.create")}
                  </button>
                  <button
                    type="button"
                    className="music-library-text"
                    onClick={() => setCreating(false)}
                  >
                    {t("common.cancel")}
                  </button>
                </form>
              )}
              {loading ? (
                <p role="status" className="music-library-empty">
                  <LoaderCircle size={18} className="animate-spin motion-reduce:animate-none" />
                  {t("music.library.reading")}
                </p>
              ) : playlists.length > 0 ? (
                <div className="music-library-cover-grid">
                  {playlists.map((playlist) => (
                    <button
                      type="button"
                      key={playlist.id}
                      data-library-playlist={playlist.id}
                      onClick={(event) => openPlaylist(playlist, event.currentTarget)}
                      className="music-library-playlist-card"
                    >
                      <MusicPlaylistCover
                        artwork={playlist.tracks.map((track) => track.artwork)}
                        seed={playlist.id}
                        glyphSize={36}
                      />
                      <strong>{playlist.name}</strong>
                      <span>{t("music.card.trackCount", { count: playlist.tracks.length })}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="music-library-empty">
                  {t(query ? "music.row.emptyRow" : "music.playlist.first")}
                </p>
              )}
            </>
          )}
          {selected && (
            <>
              <div className="music-library-playlist-hero" ref={playlistHeading} tabIndex={-1}>
                <div className="music-library-playlist-art">
                  <MusicPlaylistCover
                    artwork={selected.tracks.map((track) => track.artwork)}
                    seed={selected.id}
                    glyphSize={48}
                  />
                </div>
                <div className="music-library-playlist-meta">
                  <PlaylistHeader
                    playlist={selected}
                    working={working}
                    onRenamed={replacePlaylist}
                    onDeleted={(id) => {
                      setLibrary((current) => ({
                        ...current,
                        playlists: current.playlists.filter((item) => item.id !== id),
                      }));
                      closePlaylist();
                    }}
                    onError={setError}
                  />
                  <span>{t("music.card.trackCount", { count: selected.tracks.length })}</span>
                  <button
                    type="button"
                    className="music-library-text"
                    disabled={working || !selected.tracks.length}
                    onClick={exportM3u}
                  >
                    <FileDown size={16} />
                    {t("music.m3u.export")}
                  </button>
                </div>
              </div>
              <LibraryTrackList
                title={t("music.search.tracks")}
                subtitle={
                  normalized ? t("music.search.resultCount", { count: visibleTracks.length }) : ""
                }
                tracks={visibleTracks}
                order={selected.tracks}
                likedIds={player.likedIds}
                onRemove={removeTrack}
                onMove={moveTrack}
                selectedPlaylist={null}
                emptyCopy={t(normalized ? "music.searchEmpty" : "music.library.playlistEmpty")}
              />
              {(player.likedTracks.length > 0 || player.recents.length > 0) && (
                <details
                  className="music-library-add-tracks"
                  onToggle={(event) => setAdding(event.currentTarget.open)}
                >
                  <summary>{t("music.library.readyForPlaylist", { name: selected.name })}</summary>
                  {adding && (
                    <>
                      {player.likedTracks.length > 0 && (
                        <LibraryTrackList
                          title={t("music.library.savedTracks")}
                          subtitle=""
                          tracks={player.likedTracks}
                          likedIds={player.likedIds}
                          onAdd={addTrack}
                          selectedPlaylist={selected}
                        />
                      )}
                      {player.recents.length > 0 && (
                        <LibraryTrackList
                          title={t("music.library.recent")}
                          subtitle=""
                          tracks={player.recents}
                          likedIds={player.likedIds}
                          onAdd={addTrack}
                          selectedPlaylist={selected}
                        />
                      )}
                    </>
                  )}
                </details>
              )}
            </>
          )}
        </section>
      )}
      {(view === "saved" || view === "recent") && (
        <LibraryTrackList
          title={viewLabel(view)}
          subtitle={t("music.search.resultCount", { count: visibleTracks.length })}
          tracks={visibleTracks}
          likedIds={player.likedIds}
          selectedPlaylist={null}
          emptyCopy={t(
            normalized
              ? "music.searchEmpty"
              : view === "saved"
                ? "music.library.saveEmpty"
                : "music.library.historyEmpty",
          )}
        />
      )}
      {view === "recent" && (
        <details className="music-library-lastfm">
          <summary>Last.fm</summary>
          <MusicLastFm />
        </details>
      )}
    </div>
  );
}

function nameFromM3uPath(path: string, fallback: string): string {
  const file = path.split(/[\\/]/).pop() ?? fallback;
  return file.replace(/\.m3u8?$/i, "").trim() || fallback;
}

function playlistFilename(name: string): string {
  const safe = name
    .replace(/[<>:"/\\|?*]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return `${safe || "playlist"}.m3u`;
}
