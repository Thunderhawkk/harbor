import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { Check, Loader2, Plus } from "lucide-react";
import { ModalShell, useModalExit } from "@/components/modal-shell";
import { useT } from "@/lib/i18n";
import {
  addTrackToMusicPlaylist,
  createMusicPlaylist,
  listMusicPlaylists,
} from "@/lib/music/library";
import type { MusicPlaylist, MusicTrack } from "@/lib/music/types";
import { useMusicConnections } from "./music-connections";
import { MusicSpotifyDestination } from "./music-spotify-destination";
import { MusicServiceLogo } from "./music-service-logo";

type PickerValue = { openPlaylistPicker: (track: MusicTrack) => void };

const Context = createContext<PickerValue>({ openPlaylistPicker: () => {} });

export function useMusicPlaylistPicker(): PickerValue {
  return useContext(Context);
}

/**
 * Saving a track to a playlist from any list in the app. The track rows already carry an
 * "add to playlist" entry; this is what that entry opens.
 */
export function MusicPlaylistPickerProvider({ children }: { children: ReactNode }) {
  const [track, setTrack] = useState<MusicTrack | null>(null);
  const openPlaylistPicker = useCallback((next: MusicTrack) => setTrack(next), []);
  const value = useMemo(() => ({ openPlaylistPicker }), [openPlaylistPicker]);

  return (
    <Context.Provider value={value}>
      {children}
      {track && <PickerModal track={track} onDismiss={() => setTrack(null)} />}
    </Context.Provider>
  );
}

function PickerModal({ track, onDismiss }: { track: MusicTrack; onDismiss: () => void }) {
  const t = useT();
  const { closing, close } = useModalExit(onDismiss);
  const [playlists, setPlaylists] = useState<MusicPlaylist[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [destination, setDestination] = useState<"harbor" | "spotify">("harbor");
  const { openConnections } = useMusicConnections();

  useEffect(() => {
    let cancelled = false;
    listMusicPlaylists()
      .then((next) => {
        if (!cancelled) setPlaylists(next);
      })
      .catch((cause) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const save = async (playlistId: string) => {
    setBusy(true);
    setError("");
    try {
      await addTrackToMusicPlaylist(playlistId, track);
      setSaved(playlistId);
      window.setTimeout(close, 500);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  const createAndSave = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setBusy(true);
    setError("");
    try {
      const playlist = await createMusicPlaylist(trimmed);
      await addTrackToMusicPlaylist(playlist.id, track);
      setSaved(playlist.id);
      window.setTimeout(close, 500);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalShell closing={closing} onDismiss={close} width={420}>
      <div className="flex flex-col gap-4 p-6">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-subtle">
            {t("music.playlist.add")}
          </p>
          <h2 className="mt-1 truncate text-[18px] text-ink">{track.title}</h2>
        </div>

        <div
          className="grid grid-cols-2 gap-2"
          role="group"
          aria-label={t("music.spotifyLibrary.destination")}
        >
          {(["harbor", "spotify"] as const).map((value) => (
            <button
              type="button"
              key={value}
              disabled={busy}
              aria-pressed={destination === value}
              onClick={() => setDestination(value)}
              className={`flex min-h-11 items-center justify-center gap-2 rounded-md px-3 text-[13px] ${destination === value ? "bg-ink text-canvas" : "bg-raised text-ink-muted"}`}
            >
              {value === "spotify" && <MusicServiceLogo source="spotify" size={16} />}
              {t(
                value === "harbor"
                  ? "music.spotifyLibrary.harbor"
                  : "music.spotifyLibrary.playlists",
              )}
            </button>
          ))}
        </div>
        {destination === "spotify" ? (
          <MusicSpotifyDestination
            track={track}
            onDone={close}
            onSetup={() => {
              close();
              openConnections("spotify");
            }}
          />
        ) : (
          <>
            {error && <p className="text-[13px] text-danger">{error}</p>}

            {loading ? (
              <span className="flex items-center gap-2 text-[13px] text-ink-muted">
                <Loader2 className="size-4 animate-spin" aria-hidden />
                {t("common.loading")}
              </span>
            ) : (
              <ul className="max-h-64 overflow-y-auto">
                {playlists.map((playlist) => (
                  <li key={playlist.id}>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void save(playlist.id)}
                      className="flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-[14px] text-ink transition-colors hover:bg-elevated disabled:opacity-60"
                    >
                      <span className="truncate">{playlist.name}</span>
                      {saved === playlist.id && (
                        <Check className="size-4 shrink-0 text-ink-muted" aria-hidden />
                      )}
                    </button>
                  </li>
                ))}
                {playlists.length === 0 && (
                  <li className="px-3 py-2 text-[13px] text-ink-muted">
                    {t("music.playlist.none")}
                  </li>
                )}
              </ul>
            )}

            <div className="flex items-center gap-2 border-t border-edge pt-4">
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void createAndSave();
                }}
                placeholder={t("music.playlist.namePlaceholder")}
                aria-label={t("music.playlist.nameLabel")}
                className="min-w-0 flex-1 rounded-md bg-elevated px-3 py-2 text-[14px] text-ink outline-none placeholder:text-ink-subtle"
              />
              <button
                type="button"
                disabled={busy || name.trim().length === 0}
                onClick={() => void createAndSave()}
                className="inline-flex shrink-0 items-center gap-1 rounded-md px-3 py-2 text-[13px] text-ink transition-colors hover:bg-elevated disabled:opacity-50"
              >
                <Plus className="size-4" aria-hidden />
                {t("music.playlist.create")}
              </button>
            </div>
          </>
        )}
      </div>
    </ModalShell>
  );
}
