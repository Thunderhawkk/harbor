import { useEffect, useRef, useState } from "react";
import { marqueeDurationMs } from "@/components/player/subtitle-menu/marquee-motion";
import type { MusicTrack } from "@/lib/music/types";
import { useArtistCredits } from "./use-artist-credits";
import { useMusicNavigate } from "./music-navigate";

const SWEEP_SHARE = 0.52;

export function MusicArtistLink({
  name,
  track,
  className = "",
  onArtist,
}: {
  name: string;
  track?: MusicTrack;
  className?: string;
  onArtist?: (name: string) => void;
}) {
  const { goToArtist } = useMusicNavigate();
  const artists = useArtistCredits(name, track?.title ?? "");
  const viewport = useRef<HTMLSpanElement>(null);
  const line = useRef<HTMLSpanElement>(null);
  const [hovered, setHovered] = useState(false);
  const [shift, setShift] = useState(0);
  const credit = artists.map((artist) => artist.name).join(", ");
  useEffect(() => {
    if (!hovered) {
      setShift(0);
      return;
    }
    const frame = requestAnimationFrame(() => {
      const box = viewport.current,
        text = line.current;
      if (box && text) setShift(Math.max(0, text.scrollWidth - box.clientWidth));
    });
    return () => cancelAnimationFrame(frame);
  }, [hovered, credit]);
  return (
    <span
      ref={viewport}
      className={`min-w-0 truncate text-start ${className}`}
      title={credit}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
    >
      <span
        ref={line}
        className={`harbor-marquee-line ${hovered ? "block w-max whitespace-nowrap" : "block truncate"}`}
        data-marquee={shift > 0 || undefined}
        style={
          shift > 0
            ? ({
                "--harbor-marquee": `${-shift}px`,
                animationDuration: `${Math.round(marqueeDurationMs(shift) / SWEEP_SHARE)}ms`,
              } as React.CSSProperties)
            : undefined
        }
      >
        {artists.map((artist, index) => (
          <span key={`${artist.name}:${index}`}>
            {artist.separator && <span>{artist.separator.includes(",") ? ", " : " feat. "}</span>}
            <button
              type="button"
              className="underline-offset-4 hover:text-ink hover:underline focus-visible:outline-2 focus-visible:outline-accent"
              title={artist.name}
              onClick={(event) => {
                event.stopPropagation();
                if (onArtist) onArtist(artist.name);
                else goToArtist(artist.name, track);
              }}
            >
              {artist.name}
            </button>
          </span>
        ))}
      </span>
    </span>
  );
}
