import { isMusicLiked } from "@/lib/music/liked";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  Heart,
  ListPlus,
  MoreHorizontal,
  Play,
  Plus,
  X,
} from "lucide-react";
import { AnchoredMenu } from "@/components/anchored-menu";
import { MusicPlaylistCover } from "./music-playlist-cover";
import { MusicCollectionControls } from "./music-collection-controls";
import { MusicArtistLink } from "./music-artist-link";
import { MusicMediaBadge } from "./music-media-badge";
import { useMusicPlaylistPicker } from "./music-playlist-picker";
import { useMusicSourcePicker } from "./music-source-picker";
import { useT } from "@/lib/i18n";
import { LoaderCircle } from "lucide-react";
import { nowPlayingMatches } from "@/lib/music/now-playing-key";
import { recordMusicPlaylistPlayback } from "@/lib/music/playback-origin";
import { useMusicNowPlaying } from "@/lib/music/use-now-playing";
import { deleteMusicPlaylist, renameMusicPlaylist } from "@/lib/music/library";
import { enqueueMusic, toggleMusicLiked } from "@/lib/music/player";
import type { MusicPlaylist, MusicTrack } from "@/lib/music/types";

export function LibraryTrackList({
  title,
  subtitle,
  tracks,
  order = tracks,
  likedIds,
  onAdd,
  onRemove,
  onMove,
  selectedPlaylist,
  emptyCopy,
}: {
  title: string;
  subtitle: string;
  tracks: MusicTrack[];
  order?: MusicTrack[];
  likedIds: string[];
  onAdd?: (track: MusicTrack) => void;
  onRemove?: (track: MusicTrack) => void;
  onMove?: (track: MusicTrack, toIndex: number) => void;
  selectedPlaylist: MusicPlaylist | null;
  emptyCopy?: string;
}) {
  const t = useT();
  const now = useMusicNowPlaying();
  const play = (track: MusicTrack, queue: MusicTrack[]) => {
    recordMusicPlaylistPlayback(selectedPlaylist);
    openSourcePicker(track, queue);
  };
  const { openSourcePicker } = useMusicSourcePicker();
  const positions = new Map(order.map((track, index) => [track.id, index]));
  const added = new Set(selectedPlaylist?.tracks.map((track) => track.id));
  return (
    <section className="music-library-tracklist">
      <div className="music-library-tracklist-header">
        <div>
          {title && <h3>{title}</h3>}
          {subtitle && <p>{subtitle}</p>}
        </div>
        {!onAdd && !onRemove && tracks.length > 0 ? (
          <MusicCollectionControls tracks={tracks} onPlay={play} />
        ) : (
          <span>{tracks.length}</span>
        )}
      </div>
      {tracks.length ? (
        <div>
          {tracks.map((track) => (
            <LibraryTrack
              key={track.id}
              track={track}
              tracks={tracks}
              index={positions.get(track.id) ?? 0}
              count={order.length}
              liked={isMusicLiked(likedIds, track)}
              alreadyAdded={added.has(track.id)}
              onAdd={onAdd}
              onRemove={onRemove}
              onMove={onMove}
              onPlay={play}
              nowPlaying={nowPlayingMatches(now, track)}
              loading={nowPlayingMatches(now, track) && now.phase === "resolving"}
            />
          ))}
        </div>
      ) : (
        <p className="music-library-empty">{emptyCopy ?? t("music.library.saveEmpty")}</p>
      )}
    </section>
  );
}

function LibraryTrack({
  track,
  tracks,
  index,
  count,
  liked,
  alreadyAdded,
  onAdd,
  onRemove,
  onMove,
  onPlay,
  nowPlaying = false,
  loading = false,
}: {
  track: MusicTrack;
  tracks: MusicTrack[];
  index: number;
  count: number;
  liked: boolean;
  alreadyAdded: boolean;
  onAdd?: (track: MusicTrack) => void;
  onRemove?: (track: MusicTrack) => void;
  onMove?: (track: MusicTrack, toIndex: number) => void;
  onPlay?: (track: MusicTrack, queue: MusicTrack[]) => void;
  nowPlaying?: boolean;
  loading?: boolean;
}) {
  const t = useT();
  const { openSourcePicker } = useMusicSourcePicker();
  const { openPlaylistPicker } = useMusicPlaylistPicker();
  const anchor = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement | null>(null);
  const bindMenu = useCallback((node: HTMLDivElement | null) => {
    menu.current = node;
    node?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
  }, []);
  const start = (item: MusicTrack, queue: MusicTrack[]) => {
    if (onPlay) {
      onPlay(item, queue);
      return;
    }
    recordMusicPlaylistPlayback(null);
    openSourcePicker(item, queue);
  };
  const [open, setOpen] = useState(false);
  const close = () => {
    if (menu.current?.contains(document.activeElement)) anchor.current?.focus();
    setOpen(false);
  };
  const actions = [
    { label: t("music.play"), icon: <Play size={16} />, run: () => start(track, tracks) },
    {
      label: t("music.card.addToQueue"),
      icon: <ListPlus size={16} />,
      run: () => enqueueMusic(track),
    },
    {
      label: t("music.card.addToPlaylist"),
      icon: <Plus size={16} />,
      run: () => openPlaylistPicker(track),
    },
    {
      label: t(liked ? "music.unsaveTrack" : "music.saveTrack"),
      icon: <Heart size={16} fill={liked ? "currentColor" : "none"} />,
      run: () => toggleMusicLiked(track),
    },
    ...(onAdd
      ? [
          {
            label: t(alreadyAdded ? "music.playlist.alreadyAdded" : "music.playlist.add"),
            icon: <Plus size={16} />,
            disabled: alreadyAdded,
            run: () => onAdd(track),
          },
        ]
      : []),
    ...(onMove
      ? [
          {
            label: t("music.playlist.moveUp", { title: track.title }),
            icon: <ChevronUp size={16} />,
            disabled: index === 0,
            run: () => onMove(track, index - 1),
          },
          {
            label: t("music.playlist.moveDown", { title: track.title }),
            icon: <ChevronDown size={16} />,
            disabled: index === count - 1,
            run: () => onMove(track, index + 1),
          },
        ]
      : []),
    ...(onRemove
      ? [{ label: t("music.playlist.remove"), icon: <X size={16} />, run: () => onRemove(track) }]
      : []),
  ];
  return (
    <div
      className="music-library-track"
      data-library-track={track.id}
      data-now-playing={nowPlaying || undefined}
      aria-current={nowPlaying ? "true" : undefined}
    >
      <span className="music-library-track-number">{String(index + 1).padStart(2, "0")}</span>
      <div className="music-library-track-play">
        <button
          type="button"
          className="music-library-track-art"
          onClick={() => start(track, tracks)}
          aria-label={t("music.playTrack", { title: track.title, artist: track.artist })}
        >
          <MusicPlaylistCover artwork={[track.artwork]} seed={track.id} />
          {loading && (
            <span aria-hidden="true" className="music-library-track-state">
              <LoaderCircle size={16} className="animate-spin motion-reduce:animate-none" />
            </span>
          )}
          {nowPlaying && !loading && (
            <span aria-hidden="true" className="music-library-track-state music-eq">
              <span className="music-eq-bars">
                <i />
                <i />
                <i />
                <i />
              </span>
            </span>
          )}
        </button>
        <span className="music-library-track-copy">
          <button
            type="button"
            onClick={() => start(track, tracks)}
            className="text-start truncate"
          >
            <strong>{track.title}</strong>
          </button>
          <span className="flex min-w-0 items-center gap-2">
            <MusicArtistLink
              name={track.artist}
              track={track}
              className="truncate text-xs text-ink-muted"
            />
            <MusicMediaBadge kind={track.mediaKind} compact />
          </span>
        </span>
      </div>
      <span className="music-library-track-duration">{track.durationLabel}</span>
      <button
        type="button"
        ref={anchor}
        className="music-library-track-more"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t("music.card.moreActions", { title: track.title })}
        onClick={() => setOpen(true)}
      >
        <MoreHorizontal size={18} />
      </button>
      <AnchoredMenu anchorRef={anchor} open={open} onClose={close} width={260}>
        <div
          role="menu"
          ref={bindMenu}
          onKeyDown={(event) => {
            const buttons = [
              ...(menu.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? []),
            ];
            const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
            if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
              event.preventDefault();
              event.stopPropagation();
              const next =
                event.key === "Home"
                  ? 0
                  : event.key === "End"
                    ? buttons.length - 1
                    : (current + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) %
                      buttons.length;
              buttons[next]?.focus();
            } else if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              close();
            } else if (event.key === "Tab") close();
          }}
          className="music-library-track-menu harbor-float rounded-md bg-elevated p-1 ring-1 ring-edge-soft"
        >
          {actions.map((action, actionIndex) => (
            <button
              key={actionIndex}
              type="button"
              role="menuitem"
              tabIndex={-1}
              disabled={"disabled" in action && action.disabled}
              onClick={() => {
                close();
                action.run();
              }}
            >
              {action.icon}
              {action.label}
            </button>
          ))}
        </div>
      </AnchoredMenu>
    </div>
  );
}

/** Rename and delete for the playlist currently open in the library. */
export function PlaylistHeader({
  playlist,
  working,
  onRenamed,
  onDeleted,
  onError,
}: {
  playlist: MusicPlaylist;
  working: boolean;
  onRenamed: (playlist: MusicPlaylist) => void;
  onDeleted: (playlistId: string) => void;
  onError: (message: string | null) => void;
}) {
  const t = useT();
  // Stored tracks may carry no playbackUrl, so playing goes through the picker rather than
  // straight to the engine.
  const { openSourcePicker } = useMusicSourcePicker();
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(playlist.name);
  const [busy, setBusy] = useState(false);
  const renameButton = useRef<HTMLButtonElement>(null);
  const cancelRename = () => {
    setName(playlist.name);
    setRenaming(false);
    requestAnimationFrame(() => renameButton.current?.focus());
  };

  useEffect(() => {
    setName(playlist.name);
    setRenaming(false);
  }, [playlist.id, playlist.name]);

  const commit = async () => {
    const trimmed = name.trim();
    if (!trimmed || trimmed === playlist.name) {
      setRenaming(false);
      return;
    }
    setBusy(true);
    onError(null);
    try {
      onRenamed(await renameMusicPlaylist(playlist.id, trimmed));
      setRenaming(false);
      requestAnimationFrame(() => renameButton.current?.focus());
    } catch (reason) {
      onError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!window.confirm(t("music.playlist.deleteConfirm"))) return;
    setBusy(true);
    onError(null);
    try {
      await deleteMusicPlaylist(playlist.id);
      onDeleted(playlist.id);
    } catch (reason) {
      onError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="music-library-playlist-heading">
      {renaming ? (
        <form
          className="music-library-create w-full"
          onSubmit={(event) => {
            event.preventDefault();
            void commit();
          }}
        >
          <input
            autoFocus
            value={name}
            disabled={busy}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                cancelRename();
              }
            }}
            aria-label={t("music.playlist.nameLabel")}
            className="min-h-11 w-full min-w-0 rounded-md bg-elevated px-3 py-2 text-[15px] text-ink"
          />
          <button type="submit" className="music-library-button" disabled={busy || !name.trim()}>
            {t("common.save")}
          </button>
          <button
            type="button"
            className="music-library-text"
            disabled={busy}
            onClick={cancelRename}
          >
            {t("common.cancel")}
          </button>
        </form>
      ) : (
        <h3>{playlist.name}</h3>
      )}
      <div className="music-playlist-commands">
        <MusicCollectionControls
          tracks={playlist.tracks}
          onPlay={(track, queue) => {
            recordMusicPlaylistPlayback(playlist);
            openSourcePicker(track, queue);
          }}
          disabled={working || busy}
        />
        <button
          type="button"
          ref={renameButton}
          disabled={working || busy}
          onClick={() => setRenaming(true)}
          className="rounded-full px-3 py-1.5 text-[13px] text-ink-muted transition-colors hover:text-ink disabled:opacity-50"
        >
          {t("music.playlist.rename")}
        </button>
        <button
          type="button"
          disabled={working || busy}
          onClick={() => void remove()}
          className="rounded-full px-3 py-1.5 text-[13px] text-ink-muted transition-colors hover:text-danger disabled:opacity-50"
        >
          {t("music.playlist.delete")}
        </button>
      </div>
    </div>
  );
}
