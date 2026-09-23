import { useT } from "@/lib/i18n";
import "./music-skeletons.css";

export function MusicTrackRowsSkeleton({ rows = 6 }: { rows?: number }) {
  const t = useT();
  return (
    <div
      role="status"
      aria-label={t("music.loading")}
      aria-busy="true"
      className="music-skeleton-tracks"
    >
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="music-skeleton-track" aria-hidden="true">
          <span className="music-skeleton-fill music-skeleton-cover" />
          <span className="music-skeleton-copy">
            <span
              className="music-skeleton-fill music-skeleton-title"
              style={{ width: `${190 - (index % 3) * 25}px` }}
            />
            <span
              className="music-skeleton-fill music-skeleton-subtitle"
              style={{ width: `${110 - (index % 2) * 20}px` }}
            />
          </span>
          <span className="music-skeleton-fill music-skeleton-duration" />
        </div>
      ))}
    </div>
  );
}

export function MusicCardsSkeleton({
  count = 7,
  round = false,
}: {
  count?: number;
  round?: boolean;
}) {
  const t = useT();
  return (
    <div
      role="status"
      aria-label={t("music.loading")}
      aria-busy="true"
      className="music-skeleton-cards"
    >
      {Array.from({ length: count }, (_, index) => (
        <div
          key={index}
          className={`music-skeleton-card${round ? " is-round" : ""}`}
          aria-hidden="true"
        >
          <span className="music-skeleton-fill music-skeleton-art" />
          <span className="music-skeleton-fill music-skeleton-title" />
          <span className="music-skeleton-fill music-skeleton-subtitle" />
        </div>
      ))}
    </div>
  );
}

export function MusicSectionSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="music-skeleton-section">
      <MusicTrackRowsSkeleton rows={rows} />
      <MusicCardsSkeleton />
    </div>
  );
}
