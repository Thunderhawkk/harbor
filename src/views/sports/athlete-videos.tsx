import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, LoaderCircle, Play, X, Youtube } from "lucide-react";
import { useT } from "@/lib/i18n";
import { openUrl } from "@/lib/window";
import { useDragScroll } from "@/lib/use-drag-scroll";
import {
  athleteYoutubeSearch,
  loadAthleteVideos,
  type AthleteVideo,
} from "@/lib/sports/athlete-videos";
import "./athlete-videos.css";
import { loadSportsYoutubeVideos } from "@/lib/sports/youtube-videos";

type Video = AthleteVideo & { publisher?: string; youtube?: boolean };

function VideoThumbnail({ video }: { video: Video }) {
  const [settled, setSettled] = useState(!video.image);
  return (
    <span className="sh-athlete-video-thumb">
      {video.image && (
        <img
          src={video.image}
          alt=""
          loading="lazy"
          decoding="async"
          draggable={false}
          data-ready={settled}
          onLoad={() => setSettled(true)}
          onError={(event) => {
            event.currentTarget.hidden = true;
            setSettled(true);
          }}
        />
      )}
      <span className="sh-athlete-video-play">
        {settled ? (
          <Play size={21} fill="currentColor" />
        ) : (
          <LoaderCircle size={19} className="animate-spin" />
        )}
      </span>
      {video.duration && <small>{video.duration}</small>}
    </span>
  );
}

export function AthleteVideos({
  name,
  league,
  sport = league,
}: {
  name: string;
  league: string;
  sport?: string;
}) {
  const t = useT();
  const section = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(false);
  const [videos, setVideos] = useState<Video[]>([]);
  const [status, setStatus] = useState("loading");
  const [retry, setRetry] = useState(0);
  const [selected, setSelected] = useState<Video | null>(null);
  const trigger = useRef<HTMLElement | null>(null);
  const { ref, handlers } = useDragScroll<HTMLDivElement>();
  useEffect(() => {
    if (!section.current) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "150px" },
    );
    observer.observe(section.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!visible) return;
    const controller = new AbortController();
    setStatus("loading");
    setVideos([]);
    setSelected(null);
    const clips: Video[] = [];
    const publish = (next: Video[]) => {
      if (controller.signal.aborted) return;
      clips.push(...next);
      clips.sort(
        (a, b) => (Date.parse(b.published || "") || 0) - (Date.parse(a.published || "") || 0),
      );
      setVideos(clips.slice(0, 12));
    };
    void Promise.allSettled([
      loadAthleteVideos(name, sport, controller.signal).then(publish),
      loadSportsYoutubeVideos({ names: [name], league }, controller.signal).then((result) =>
        publish(
          result.map((video) => ({
            ...video,
            id: `youtube:${video.id}`,
            publisher: video.channel,
            youtube: true,
            embed: `https://www.youtube-nocookie.com/embed/${video.id}?autoplay=0&rel=0`,
          })),
        ),
      ),
    ])
      .then((result) => {
        if (!controller.signal.aborted) {
          setStatus(
            !clips.length && result.some((item) => item.status === "rejected") ? "error" : "ready",
          );
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setStatus("error");
      });
    return () => controller.abort();
  }, [name, sport, league, visible, retry]);
  return (
    <section ref={section} className="sh-athlete-videos">
      <header>
        <div>
          <span className="sh-eyebrow">{t("In motion")}</span>
          <h3>{t("Highlights & videos")}</h3>
        </div>
        <button
          className="sh-text-button"
          onClick={() => openUrl(athleteYoutubeSearch(name, league))}
        >
          <Youtube size={19} />
          {t("Search YouTube")}
          <ArrowUpRight size={14} />
        </button>
      </header>
      {selected && (
        <div className="sh-athlete-video-player">
          <div>
            <strong>{selected.title}</strong>
            <button
              className="sh-icon"
              aria-label={t("Close video")}
              onClick={() => {
                setSelected(null);
                requestAnimationFrame(() => trigger.current?.focus({ preventScroll: true }));
              }}
            >
              <X size={18} />
            </button>
          </div>
          <iframe
            key={selected.id}
            src={selected.embed}
            title={selected.title}
            allow="fullscreen; encrypted-media; picture-in-picture"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
          />
          <p>
            {t("Playback and regional availability are managed by the publisher.")}{" "}
            <button className="sh-text-button" onClick={() => openUrl(selected.url)}>
              {t(selected.youtube ? "Open on YouTube" : "Watch on ESPN")}
              <ArrowUpRight size={12} />
            </button>
          </p>
        </div>
      )}
      {status === "loading" && !videos.length && (
        <div className="sh-athlete-video-loading" role="status">
          <LoaderCircle size={18} className="animate-spin" />
          {t("Loading videos…")}
        </div>
      )}
      {!!videos.length && (
        <div className="sh-athlete-video-rail" ref={ref} {...handlers}>
          {videos.map((video) => (
            <button
              key={video.id}
              className="sh-athlete-video-card"
              onClick={(event) => {
                trigger.current = event.currentTarget;
                setSelected(video);
              }}
            >
              <VideoThumbnail video={video} />
              <strong>{video.title}</strong>
              <span className="sh-athlete-video-publisher">
                {video.youtube && <Youtube size={14} />} {video.publisher || "ESPN"} · {t("Video")}
              </span>
            </button>
          ))}
        </div>
      )}
      {status !== "loading" && !videos.length && (
        <p className="sh-athlete-video-empty">
          {t(
            status === "error"
              ? "Videos are unavailable right now."
              : "No matching clips were published by this feed.",
          )}
          {status === "error" && (
            <button className="sh-text-button" onClick={() => setRetry((n) => n + 1)}>
              {t("Retry")}
            </button>
          )}
        </p>
      )}
    </section>
  );
}
