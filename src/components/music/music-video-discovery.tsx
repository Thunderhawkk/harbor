import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowLeft, ArrowRight, Film, Mic2, Play, Radio, RotateCcw, Search } from "lucide-react";
import { Poster } from "@/components/poster";
import { MusicArtistLink } from "./music-artist-link";
import { useT } from "@/lib/i18n";
import { useDragScroll } from "@/lib/use-drag-scroll";
import {
  MUSIC_VIDEO_KIND_LABELS,
  musicVideoQuery,
  musicVideoUsesYoutube,
  searchMusicVideos,
  type MusicVideoKind,
} from "@/lib/music/video-discovery";
import type { MusicTrack } from "@/lib/music/types";
import youtubeLogo from "@/assets/service-logos/youtube.ico";
import "./music-video-discovery.css";

export function MusicVideoDiscovery({
  query = "music videos",
  active = true,
  interviews = false,
  kinds,
  subject = "",
  onWatch,
}: {
  query?: string;
  active?: boolean;
  interviews?: boolean;
  kinds?: MusicVideoKind[];
  subject?: string;
  onWatch: (track: MusicTrack, queue: MusicTrack[]) => void;
}) {
  const t = useT();
  const root = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(false);
  const tabs = kinds && kinds.length > 1 ? kinds : null;
  const [kind, setKind] = useState<MusicVideoKind>(
    kinds?.[0] ?? (interviews ? "interviews" : "videos"),
  );
  const baseQuery = tabs ? musicVideoQuery(kind, subject) : query;
  const regular = tabs ? musicVideoUsesYoutube(kind) : interviews;
  const [draft, setDraft] = useState(baseQuery);
  const [search, setSearch] = useState(baseQuery);
  const [retry, setRetry] = useState(0);
  const [result, setResult] = useState<{
    key: string;
    tracks: MusicTrack[];
    error: boolean;
  } | null>(null);
  const [edges, setEdges] = useState({ start: true, end: true });
  const rail = useDragScroll<HTMLDivElement>();
  useEffect(() => {
    setDraft(baseQuery);
    setSearch(baseQuery);
  }, [baseQuery]);
  useEffect(() => {
    const node = root.current;
    if (!node) return;
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), {
      rootMargin: "160px",
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!active || !visible || !search.trim()) return;
    let cancelled = false;
    setResult(null);
    searchMusicVideos(search, retry > 0, regular)
      .then((tracks) => {
        if (!cancelled) setResult({ key: search, tracks, error: false });
      })
      .catch(() => {
        if (!cancelled) setResult({ key: search, tracks: [], error: true });
      });
    return () => {
      cancelled = true;
    };
  }, [active, visible, search, retry, regular]);
  const current = result?.key === search ? result : null;
  const railRef = rail.ref;
  const measure = useCallback(() => {
    const el = railRef.current;
    if (!el) return;
    const travel = el.scrollWidth - el.clientWidth;
    const offset = Math.abs(el.scrollLeft);
    setEdges({ start: offset <= 1, end: offset >= travel - 1 });
  }, [railRef]);
  useEffect(() => {
    const el = railRef.current;
    if (!el) {
      setEdges({ start: true, end: true });
      return;
    }
    measure();
    el.addEventListener("scroll", measure, { passive: true });
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => {
      el.removeEventListener("scroll", measure);
      observer.disconnect();
    };
  }, [measure, railRef, current]);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (draft.trim()) {
      setRetry(0);
      setSearch(draft.trim());
    }
  };
  const move = (step: number) => {
    const el = railRef.current;
    if (!el) return;
    const rtl = getComputedStyle(el).direction === "rtl";
    el.scrollBy({
      left: (rtl ? -1 : 1) * step * el.clientWidth * 0.85,
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
    });
  };
  const heading = tabs
    ? MUSIC_VIDEO_KIND_LABELS[kind]
    : interviews
      ? "music.videos.interviews"
      : "music.videos.title";
  const glyph = (tabs ? kind === "interviews" : interviews) ? (
    <Mic2 size={21} aria-hidden />
  ) : tabs && kind === "concerts" ? (
    <Radio size={21} aria-hidden />
  ) : (
    <Film size={21} aria-hidden />
  );
  return (
    <section ref={root} className="music-video-discovery" aria-label={t(heading)}>
      <header>
        <div>
          <h2>
            {glyph}
            {t(heading)}
          </h2>
          <p>
            <img src={youtubeLogo} alt="" />
            {t(regular ? "music.videos.youtubeSource" : "music.videos.source")}
          </p>
          {tabs && (
            <div className="music-video-kinds" role="tablist" aria-label={t("music.videos.title")}>
              {tabs.map((entry) => (
                <button
                  key={entry}
                  type="button"
                  role="tab"
                  aria-selected={entry === kind}
                  onClick={() => {
                    setRetry(0);
                    setKind(entry);
                  }}
                >
                  {t(MUSIC_VIDEO_KIND_LABELS[entry])}
                </button>
              ))}
            </div>
          )}
        </div>
        <form onSubmit={submit}>
          <Search size={17} aria-hidden />
          <input
            aria-label={t("music.videos.search")}
            placeholder={t("music.videos.search")}
            maxLength={200}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          <button type="submit" disabled={!draft.trim()} aria-label={t("common.search")}>
            <ArrowRight size={19} className="dir-icon" />
          </button>
        </form>
      </header>
      {!current ? (
        <div className="music-video-skeleton" role="status" aria-label={t("music.videos.loading")}>
          {[0, 1, 2].map((i) => (
            <div key={i}>
              <span className="music-video-skeleton-art" />
              <span className="music-video-skeleton-line" />
              <span className="music-video-skeleton-line music-video-skeleton-short" />
            </div>
          ))}
        </div>
      ) : current.error ? (
        <div className="music-video-message" role="alert">
          <p>{t("music.videos.error")}</p>
          <button type="button" onClick={() => setRetry((n) => n + 1)}>
            <RotateCcw size={15} aria-hidden />
            {t("common.retry")}
          </button>
        </div>
      ) : !current.tracks.length ? (
        <p className="music-video-message" role="status">
          {t("music.videos.empty")}
        </p>
      ) : (
        <>
          <div className="music-video-rail" ref={railRef} {...rail.handlers}>
            {current.tracks.map((track) => (
              <div key={track.sourceId} className="music-video-tile">
                <button
                  type="button"
                  className="flex min-w-0 flex-col text-start"
                  onClick={() => onWatch(track, current.tracks)}
                  aria-label={t("music.videos.watch", { title: track.title })}
                >
                  <span className="music-video-art">
                    <Poster
                      src={track.artwork}
                      seed={track.id}
                      ratio="wide"
                      className="h-full w-full object-cover"
                    />
                    <span className="music-video-play">
                      <Play size={22} fill="currentColor" />
                    </span>
                    {track.durationLabel && <small>{track.durationLabel}</small>}
                  </span>
                  <strong className="max-w-full">{track.title}</strong>
                </button>
                <MusicArtistLink name={track.artist} track={track} className="music-video-artist" />
                <button
                  type="button"
                  className="music-video-watch"
                  onClick={() => onWatch(track, current.tracks)}
                >
                  <Play size={13} />
                  {t("music.videos.action")}
                </button>
              </div>
            ))}
          </div>
          <div className="music-video-rail-controls">
            <button
              type="button"
              onClick={() => move(-1)}
              disabled={edges.start}
              aria-label={t("common.previous")}
            >
              <ArrowLeft className="dir-icon" size={18} />
            </button>
            <button
              type="button"
              onClick={() => move(1)}
              disabled={edges.end}
              aria-label={t("common.next")}
            >
              <ArrowRight className="dir-icon" size={18} />
            </button>
          </div>
        </>
      )}
    </section>
  );
}
