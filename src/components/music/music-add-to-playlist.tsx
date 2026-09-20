import { useCallback, useEffect, useRef, useState } from "react";
import { Check, ListPlus, Loader2, Plus } from "lucide-react";
import { useT } from "@/lib/i18n";
import {
  addTrackToMusicPlaylist,
  createMusicPlaylist,
  listMusicPlaylists,
} from "@/lib/music/library";
import type { MusicPlaylist, MusicTrack } from "@/lib/music/types";

/**
 * Saving a track to a playlist from wherever the track appears. The library tab owns
 * arranging playlists; this only puts a track into one.
 */
export function MusicAddToPlaylist({ track }: { track: MusicTrack }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [playlists, setPlaylists] = useState<MusicPlaylist[]>([]);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const root = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setError("");
    listMusicPlaylists()
      .then(setPlaylists)
      .catch((cause) => setError(cause instanceof Error ? cause.message : String(cause)));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const save = useCallback(
    async (playlistId: string) => {
      setBusy(true);
      setError("");
      try {
        await addTrackToMusicPlaylist(playlistId, track);
        setSaved(playlistId);
        // A moment of confirmation, then out of the way.
        window.setTimeout(() => setOpen(false), 600);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
      } finally {
        setBusy(false);
      }
    },
    [track],
  );

  const createAndSave = useCallback(async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setBusy(true);
    setError("");
    try {
      const playlist = await createMusicPlaylist(trimmed);
      await addTrackToMusicPlaylist(playlist.id, track);
      setName("");
      setCreating(false);
      setSaved(playlist.id);
      window.setTimeout(() => setOpen(false), 600);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }, [name, track]);

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[13px] text-ink-muted ring-1 ring-white/10 transition-colors hover:text-ink"
      >
        <ListPlus className="size-4" aria-hidden />
        {t("music.playlist.save")}
      </button>

      {open && (
        <div className="absolute right-0 z-30 mt-2 w-64 rounded-xl bg-canvas p-2 shadow-xl ring-1 ring-white/10">
          {error && <p className="px-2 py-1 text-[13px] text-danger">{error}</p>}

          <ul className="max-h-64 overflow-y-auto">
            {playlists.map((playlist) => (
              <li key={playlist.id}>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void save(playlist.id)}
                  className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-[13px] text-ink transition-colors hover:bg-white/5 disabled:opacity-60"
                >
                  <span className="truncate">{playlist.name}</span>
                  {saved === playlist.id && (
                    <Check className="size-4 shrink-0 text-ink-muted" aria-hidden />
                  )}
                </button>
              </li>
            ))}
            {playlists.length === 0 && !error && (
              <li className="px-2 py-1.5 text-[13px] text-ink-muted">{t("music.playlist.none")}</li>
            )}
          </ul>

          {creating ? (
            <div className="mt-1 flex items-center gap-1 border-t border-white/10 pt-2">
              <input
                autoFocus
                value={name}
                onChange={(event) => setName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void createAndSave();
                }}
                placeholder={t("music.playlist.namePlaceholder")}
                className="min-w-0 flex-1 rounded-lg bg-white/5 px-2 py-1.5 text-[13px] text-ink outline-none placeholder:text-ink-subtle"
              />
              <button
                type="button"
                disabled={busy || name.trim().length === 0}
                onClick={() => void createAndSave()}
                className="shrink-0 rounded-lg px-2 py-1.5 text-[13px] text-ink transition-colors hover:bg-white/5 disabled:opacity-50"
              >
                {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : t("common.save")}
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="mt-1 flex w-full items-center gap-2 border-t border-white/10 px-2 pt-2 pb-1 text-left text-[13px] text-ink-muted transition-colors hover:text-ink"
            >
              <Plus className="size-4" aria-hidden />
              {t("music.playlist.new")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
