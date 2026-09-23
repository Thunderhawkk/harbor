import { useEffect, useRef, useState } from "react";
import { musicVideoStream } from "@/lib/music/video";
import { searchMusicVideos } from "@/lib/music/video-discovery";
import { useHeroLayers } from "./use-hero-layers";
import type { MusicCatalogItem, MusicTrack } from "@/lib/music/types";

async function previewUrlFor(track: MusicTrack): Promise<string | null> {
  const direct = await musicVideoStream(track).catch(() => null);
  if (direct?.url) return direct.url;
  const query = [track.artist, track.title].filter(Boolean).join(" ").trim();
  if (!query) return null;
  const found = await searchMusicVideos(query).catch(() => []);
  const top = found[0];
  if (!top) return null;
  const stream = await musicVideoStream(top).catch(() => null);
  return stream?.url ?? null;
}

export function MusicHeroMedia({ item, hovering }: { item?: MusicCatalogItem; hovering: boolean }) {
  const [preview, setPreview] = useState<{ key: string; url: string } | null>(null);
  const [readyUrl, setReadyUrl] = useState<string | null>(null);
  const [settled, setSettled] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  const key = item?.id ?? "";
  const art = item?.artwork;
  const layers = useHeroLayers(Array.isArray(art) ? art[0] : art);
  useEffect(() => {
    setPreview(null);
    setReadyUrl(null);
  }, [key]);
  useEffect(() => {
    if (
      !hovering ||
      item?.kind !== "track" ||
      preview?.key === key ||
      document.hidden ||
      matchMedia("(prefers-reduced-motion: reduce)").matches
    )
      return;
    let cancelled = false;
    const timer = setTimeout(() => {
      previewUrlFor(item)
        .then((url) => {
          if (!cancelled && url) setPreview({ key, url });
        })
        .catch(() => {});
    }, 700);
    const hide = () => {
      if (document.hidden) {
        cancelled = true;
        setPreview(null);
        setReadyUrl(null);
      }
    };
    document.addEventListener("visibilitychange", hide);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", hide);
    };
  }, [hovering, key, item?.kind, preview?.key]);
  const live = preview?.key === key ? preview : null;
  const playing = !!live && readyUrl === live.url;
  useEffect(() => {
    if (!(hovering && playing)) setSettled(false);
  }, [hovering, playing]);
  useEffect(() => {
    const el = video.current;
    if (!el || !playing) return;
    if (hovering) void el.play().catch(() => {});
    else el.pause();
  }, [hovering, playing]);
  return (
    <>
      <div className="music-hero-media" aria-hidden="true">
        {layers.map((layer) => (
          <img key={layer.id} src={layer.src} alt="" />
        ))}
      </div>
      <div
        className="music-hero-video"
        aria-hidden="true"
        data-on={(hovering && playing) || undefined}
        data-settled={(hovering && playing && settled) || undefined}
        onTransitionEnd={(event) => {
          if (event.propertyName === "clip-path") setSettled(hovering && playing);
        }}
      >
        {live && (
          <video
            ref={video}
            key={live.url}
            src={live.url}
            muted
            autoPlay
            playsInline
            loop
            onPlaying={() => setReadyUrl(live.url)}
            onError={() => {
              setPreview(null);
              setReadyUrl(null);
            }}
          />
        )}
      </div>
    </>
  );
}
