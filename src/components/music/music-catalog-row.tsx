import { Fragment, type MouseEvent, type ReactNode } from "react";
import { Play } from "lucide-react";
import { MusicArtistCard } from "@/components/music/music-artist-card";
import {
  coverCardSeed,
  coverCardSubtitle,
  coverCardTitle,
  MusicCardBadgeChip,
  MusicCoverCard,
  type MusicCardBadge,
} from "@/components/music/music-cover-card";
import { MusicPlaylistCover } from "@/components/music/music-playlist-cover";
import {
  MusicSectionConnectCard,
  MusicSectionEmpty,
  MusicSectionError,
  MusicSectionHead,
  MusicTrackGrid,
  type MusicSectionConnect,
  type MusicSectionStatus,
} from "@/components/music/music-track-grid";
import { Poster } from "@/components/poster";
import { Row } from "@/components/row";
import { useT } from "@/lib/i18n";
import type {
  MusicArtistRef,
  MusicCatalogItem,
  MusicCatalogRow as MusicCatalogRowData,
} from "@/lib/music/types";

export const MUSIC_SHELF_MIN = 160;

const SOURCE_LABEL: Record<string, string> = {
  spotify: "Spotify",
  soundcloud: "SoundCloud",
  youtube: "YouTube Music",
  youtubemusic: "YouTube Music",
  "youtube-music": "YouTube Music",
  youtube_music: "YouTube Music",
  local: "Local files",
  direct: "Local files",
  plex: "Plex",
  jellyfin: "Jellyfin",
  navidrome: "Navidrome",
  subsonic: "Subsonic",
  lastfm: "Last.fm",
  "last-fm": "Last.fm",
  listenbrainz: "ListenBrainz",
  bandcamp: "Bandcamp",
  harbor: "Harbor",
};

export function sourceLabel(id: string, override?: string): string {
  if (override && override.trim()) return override.trim();
  const key = id.trim().toLowerCase();
  if (!key) return "";
  const known = SOURCE_LABEL[key];
  if (known) return known;
  const words = key.replace(/[_-]+/g, " ").trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : "";
}

type TrackItem = Extract<MusicCatalogItem, { kind: "track" }>;
type ArtistItem = Extract<MusicCatalogItem, { kind: "artist" }>;

function defaultBadge(item: MusicCatalogItem): MusicCardBadge | undefined {
  if (item.kind === "track" && item.connectorId) {
    return { kind: "connector", connectorId: item.connectorId };
  }
  return undefined;
}

function CoverSkeleton({ circle = false }: { circle?: boolean }) {
  return (
    <div className="flex w-full min-w-0 flex-col gap-2.5">
      <div
        className={`aspect-square w-full bg-elevated/40 ${circle ? "rounded-full" : "rounded-md"}`}
      />
      <div className={`flex h-9 flex-col gap-1.5 ${circle ? "items-center" : ""}`}>
        <div className="h-3 w-3/5 rounded bg-elevated/35" />
        <div className="h-3 w-2/5 rounded bg-elevated/25" />
      </div>
    </div>
  );
}

function WideFeature({
  item,
  badge,
  subtitle,
  onPlay,
  onOpen,
  onMenu,
}: {
  item: MusicCatalogItem;
  badge?: MusicCardBadge | null;
  subtitle?: string;
  onPlay?: () => void;
  onOpen?: () => void;
  onMenu?: (event: MouseEvent<HTMLElement>) => void;
}) {
  const t = useT();
  const heading = coverCardTitle(item);
  const caption = subtitle ?? coverCardSubtitle(item);
  const seed = coverCardSeed(item);
  const activate = onPlay ?? onOpen;
  const label = onPlay
    ? item.kind === "track"
      ? t("music.playTrack", { title: heading, artist: caption })
      : t("music.card.playItem", { title: heading })
    : t("music.card.openItem", { title: heading });

  return (
    <button
      type="button"
      onClick={activate}
      onContextMenu={onMenu}
      aria-label={label}
      className="music-top-result group flex w-full min-w-0 items-center gap-6 rounded-xl border border-edge-soft bg-surface p-5 text-start"
    >
      <span className="relative block w-[168px] shrink-0 overflow-hidden rounded-md">
        {item.kind === "playlist" ? (
          <MusicPlaylistCover artwork={item.artwork} seed={seed} className="rounded-md" />
        ) : (
          <Poster
            src={item.artwork}
            seed={seed}
            ratio="square"
            className="w-full [--poster-radius:0px]"
          />
        )}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="flex min-w-0 items-center gap-[5px]">
          <span
            className="truncate font-semibold text-[22px] leading-tight tracking-tight text-ink"
            title={heading}
          >
            {heading}
          </span>
          {badge && <MusicCardBadgeChip badge={badge} />}
        </span>
        {caption && (
          <span className="mt-1.5 truncate text-[13px] text-ink-subtle" title={caption}>
            {caption}
          </span>
        )}
        {activate && (
          <span
            aria-hidden="true"
            className="mt-5 inline-flex h-11 w-fit items-center gap-2 rounded-full bg-ink px-5 text-[12px] font-semibold text-canvas transition-transform duration-200 ease-out group-hover:scale-[1.02]"
          >
            <Play size={14} fill="currentColor" />
            {t("music.play")}
          </span>
        )}
      </span>
    </button>
  );
}

export function MusicCatalogRow({
  row,
  status = "ready",
  error,
  onRetry,
  connect,
  sourceName,
  titleVars,
  min = MUSIC_SHELF_MIN,
  count,
  emptyLabel,
  leadingCard,
  badgeFor,
  artistArtwork,
  artistSubtitle,
  numbered,
  onPlay,
  onOpen,
  onMenu,
  onViewAll,
  viewAllLabel,
  onEndReached,
  className = "",
}: {
  row: MusicCatalogRowData;
  status?: MusicSectionStatus;
  error?: string;
  onRetry?: () => void;
  connect?: MusicSectionConnect | null;
  sourceName?: string;
  titleVars?: Record<string, string | number>;
  min?: number;
  count?: number;
  emptyLabel?: string;
  leadingCard?: ReactNode;
  badgeFor?: (item: MusicCatalogItem, index: number) => MusicCardBadge | null | undefined;
  artistArtwork?: (artist: MusicArtistRef) => readonly (string | null | undefined)[];
  artistSubtitle?: (artist: MusicArtistRef) => string | undefined;
  numbered?: boolean;
  onPlay?: (item: MusicCatalogItem, index: number) => void;
  onOpen?: (item: MusicCatalogItem, index: number) => void;
  onMenu?: (item: MusicCatalogItem, event: MouseEvent<HTMLElement>) => void;
  onViewAll?: () => void;
  viewAllLabel?: string;
  onEndReached?: () => void;
  className?: string;
}) {
  const t = useT();
  const heading = row.titleLiteral ? row.title : t(row.title, titleVars);
  const rawSubtitle = row.subtitle
    ? row.titleLiteral
      ? row.subtitle
      : t(row.subtitle, titleVars)
    : "";
  const provider = sourceLabel(row.source, sourceName);
  const caption = !provider
    ? rawSubtitle
    : !rawSubtitle
      ? provider
      : rawSubtitle.includes(provider)
        ? rawSubtitle
        : `${rawSubtitle} · ${provider}`;
  const badgeAt = (item: MusicCatalogItem, index: number) =>
    badgeFor ? badgeFor(item, index) : defaultBadge(item);

  if (row.layout === "trackGrid") {
    const tracks = row.items.filter((item): item is TrackItem => item.kind === "track");
    return (
      <MusicTrackGrid
        title={heading}
        subtitle={caption}
        tracks={tracks}
        status={status}
        error={error}
        onRetry={onRetry}
        connect={connect}
        numbered={numbered}
        count={count ?? 9}
        emptyLabel={emptyLabel}
        badgeFor={(_track, index) => badgeAt(tracks[index], index)}
        onPlay={(_track, index) => onPlay?.(tracks[index], index)}
        onViewAll={onViewAll}
        viewAllLabel={viewAllLabel}
        className={className}
      />
    );
  }

  const cellMin = Math.min(min, MUSIC_SHELF_MIN);
  const circles = row.layout === "circles";
  const artists = circles
    ? row.items.filter((item): item is ArtistItem => item.kind === "artist")
    : [];
  const items: MusicCatalogItem[] = circles ? artists : [...row.items];
  const visible = count ? items.slice(0, count) : items;
  const skeletonCount = count ?? 8;

  if (connect || status === "error" || (status === "ready" && visible.length === 0)) {
    return (
      <section className={`flex min-w-0 flex-col gap-5 ps-[9px] ${className}`}>
        <MusicSectionHead
          title={heading}
          subtitle={caption}
          onViewAll={onViewAll}
          viewAllLabel={viewAllLabel}
        />
        {connect ? (
          <MusicSectionConnectCard connect={connect} />
        ) : status === "error" ? (
          <MusicSectionError message={error} onRetry={onRetry} />
        ) : (
          <MusicSectionEmpty label={emptyLabel} />
        )}
      </section>
    );
  }

  if (row.layout === "wide") {
    const feature = visible[0];
    return (
      <section className={`flex min-w-0 flex-col gap-5 ps-[9px] ${className}`}>
        <MusicSectionHead
          title={heading}
          subtitle={caption}
          onViewAll={onViewAll}
          viewAllLabel={viewAllLabel}
        />
        {status === "loading" || !feature ? (
          <div className="min-h-[168px] rounded-xl bg-elevated/30" />
        ) : (
          <WideFeature
            item={feature}
            badge={badgeAt(feature, 0)}
            onPlay={onPlay && (() => onPlay(feature, 0))}
            onOpen={onOpen && (() => onOpen(feature, 0))}
            onMenu={onMenu && ((event) => onMenu(feature, event))}
          />
        )}
      </section>
    );
  }

  const head = (
    <span className="flex min-w-0 flex-col gap-0.5">
      <span className="truncate text-[17px] font-medium tracking-tight text-ink">{heading}</span>
      {caption && (
        <span className="truncate text-[12px] font-medium text-ink-subtle">{caption}</span>
      )}
    </span>
  );

  if (status === "loading") {
    return (
      <Row
        title={head}
        shape="square"
        min={cellMin}
        scrollKey={`music:${row.id}`}
        className={className}
        alwaysActive
      >
        {Array.from({ length: skeletonCount }).map((_, index) => (
          <CoverSkeleton key={index} circle={circles} />
        ))}
      </Row>
    );
  }

  const cards: ReactNode[] = visible.map((item, index) =>
    item.kind === "artist" ? (
      <MusicArtistCard
        key={`${coverCardSeed(item)}:${index}`}
        artist={item}
        albumArtwork={artistArtwork?.(item)}
        subtitle={artistSubtitle?.(item)}
        onPlay={onPlay && (() => onPlay(item, index))}
        onOpen={onOpen && (() => onOpen(item, index))}
        onMenu={onMenu && ((event) => onMenu(item, event))}
      />
    ) : (
      <MusicCoverCard
        key={`${coverCardSeed(item)}:${index}`}
        item={item}
        badge={badgeAt(item, index)}
        onPlay={onPlay && (() => onPlay(item, index))}
        onOpen={onOpen && (() => onOpen(item, index))}
        onMenu={onMenu && ((event) => onMenu(item, event))}
      />
    ),
  );

  return (
    <Row
      title={head}
      shape="square"
      min={cellMin}
      scrollKey={`music:${row.id}`}
      onViewAll={onViewAll}
      viewAllLabel={viewAllLabel ?? "music.row.viewAll"}
      onEndReached={onEndReached}
      className={className}
    >
      {leadingCard ? [<Fragment key="music-row-lead">{leadingCard}</Fragment>, ...cards] : cards}
    </Row>
  );
}
