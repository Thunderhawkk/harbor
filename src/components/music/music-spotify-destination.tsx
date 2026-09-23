import { useEffect, useRef, useState } from "react";
import { Check, LoaderCircle, Plus } from "lucide-react";
import { useT } from "@/lib/i18n";
import { connectSource } from "@/lib/music/catalog";
import {
  addTrackToSpotifyPlaylist,
  createSpotifyPlaylist,
  loadSpotifyLibraryPage,
  spotifyLibraryErrorKey,
  spotifyTrackUri,
  type SpotifyLibraryPage,
} from "@/lib/music/spotify-library";
import type { MusicTrack } from "@/lib/music/types";
import { useMusicConnections } from "./music-connections";
import "./music-spotify-library.css";

export function MusicSpotifyDestination({
  track,
  onDone,
  onSetup,
}: {
  track: MusicTrack;
  onDone: () => void;
  onSetup: () => void;
}) {
  const t = useT();
  const connections = useMusicConnections();
  const account = connections.connections.find((connection) => connection.id === "spotify");
  const connected = account?.status === "connected";
  const uri = spotifyTrackUri(track);
  const [page, setPage] = useState<SpotifyLibraryPage | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saved, setSaved] = useState("");
  const [name, setName] = useState("");
  const generation = useRef(0);
  const finishTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = async (offset = 0) => {
    const run = ++generation.current;
    setLoading(true);
    setError("");
    try {
      const next = await loadSpotifyLibraryPage("playlists", offset);
      if (generation.current === run)
        setPage((previous) =>
          offset && previous
            ? { ...next, playlists: [...previous.playlists, ...next.playlists] }
            : next,
        );
    } catch (error) {
      if (generation.current === run) setError(spotifyLibraryErrorKey(error));
    } finally {
      if (generation.current === run) setLoading(false);
    }
  };

  useEffect(() => {
    if (connected && uri) void load();
    return () => {
      generation.current += 1;
      if (finishTimer.current) clearTimeout(finishTimer.current);
    };
  }, [connected, account?.account, uri]);

  const add = async (playlistId: string) => {
    setBusy(true);
    setError("");
    try {
      await addTrackToSpotifyPlaylist(playlistId, track);
      setSaved(playlistId);
      finishTimer.current = setTimeout(onDone, 500);
    } catch (error) {
      setError(spotifyLibraryErrorKey(error));
    } finally {
      setBusy(false);
    }
  };

  const create = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    setError("");
    try {
      const playlist = await createSpotifyPlaylist(name);
      setName("");
      setNotice(t("music.spotifyLibrary.created", { name: playlist.name }));
      setPage((previous) =>
        previous
          ? {
              ...previous,
              playlists: [playlist, ...previous.playlists],
              total: previous.total == null ? null : previous.total + 1,
            }
          : previous,
      );
      window.dispatchEvent(new Event("harbor:spotify-library-changed"));
    } catch (error) {
      setError(spotifyLibraryErrorKey(error));
    } finally {
      setBusy(false);
    }
  };

  const reconnect = async () => {
    setBusy(true);
    setError("");
    try {
      connections.apply(await connectSource("spotify"));
      await load();
    } catch (error) {
      setError(spotifyLibraryErrorKey(error));
    } finally {
      setBusy(false);
    }
  };

  if (!connected)
    return (
      <button type="button" className="music-spotify-button" onClick={onSetup}>
        {t("music.spotifyLibrary.connect")}
      </button>
    );
  if (!uri)
    return <p className="text-sm text-ink-muted">{t("music.spotifyLibrary.spotifyTrackOnly")}</p>;
  return (
    <div className="music-spotify-destination flex min-w-0 flex-col gap-4">
      {error && (
        <p role="alert" className="text-sm text-danger">
          {t(error)}
        </p>
      )}
      {((page && !page.canCreate) ||
        error === "music.spotifyLibrary.permission" ||
        error === "music.spotifyLibrary.reconnectNeeded") && (
        <div className="music-spotify-permission">
          <p>{t("music.spotifyLibrary.permission")}</p>
          <button
            type="button"
            className="music-spotify-button"
            disabled={busy}
            onClick={() => void reconnect()}
          >
            {t("music.spotifyLibrary.reconnect")}
          </button>
        </div>
      )}
      {notice && (
        <p role="status" className="text-sm text-ink-muted">
          {notice}
        </p>
      )}
      <ul className="max-h-64 overflow-y-auto">
        {page?.playlists.map((playlist) => (
          <li key={playlist.id}>
            <button
              type="button"
              disabled={busy || !!saved || !playlist.editable}
              onClick={() => void add(playlist.id)}
              className="flex min-h-11 w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-start text-sm text-ink hover:bg-raised disabled:opacity-40"
            >
              <span className="truncate">{playlist.name}</span>
              {saved === playlist.id && <Check size={17} />}
            </button>
          </li>
        ))}
      </ul>
      {!loading && page && !page.playlists.length && (
        <p className="text-sm text-ink-muted">{t("music.playlist.none")}</p>
      )}
      {loading && (
        <p role="status" className="music-spotify-actions text-sm text-ink-muted">
          <LoaderCircle size={18} className="animate-spin motion-reduce:animate-none" />
          {t("music.loading")}
        </p>
      )}
      {error && !page && (
        <button
          type="button"
          className="music-spotify-button"
          disabled={loading}
          onClick={() => void load()}
        >
          {t("common.retry")}
        </button>
      )}
      {page?.nextOffset != null && (
        <button
          type="button"
          className="music-spotify-button"
          disabled={loading || busy}
          onClick={() => void load(page.nextOffset!)}
        >
          {t("music.library.loadMore")}
        </button>
      )}
      {page?.canCreate && (
        <form
          className="music-spotify-create border-t border-edge-soft pt-4"
          onSubmit={(event) => {
            event.preventDefault();
            void create();
          }}
        >
          <p>{t("music.spotifyLibrary.createThenAdd")}</p>
          <input
            value={name}
            maxLength={100}
            onChange={(event) => setName(event.target.value)}
            aria-label={t("music.playlist.nameLabel")}
            placeholder={t("music.playlist.namePlaceholder")}
          />
          <button type="submit" className="music-spotify-button" disabled={busy || !name.trim()}>
            <Plus size={17} />
            {t("music.spotifyLibrary.create")}
          </button>
        </form>
      )}
    </div>
  );
}
