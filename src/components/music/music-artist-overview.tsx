import { useEffect, useState } from "react";
import { ArrowUpRight, Globe2, ShoppingBag } from "lucide-react";
import { useT, useUiLanguage } from "@/lib/i18n";
import { openUrl } from "@/lib/window";
import { requestMusicGenre } from "@/lib/music/navigation";
import { loadArtistProfile, type MusicArtistProfile } from "@/lib/music/artist-profile";
import { resolveArtist } from "@/lib/music/artist-authority";
import type { MusicArtistRef, MusicCatalogItem } from "@/lib/music/types";
import { MusicServiceLogo } from "./music-service-logo";
import { MusicArtistExtras } from "./music-artist-extras";
import "./music-artist-overview.css";

export function MusicArtistOverview({
  artist,
  onOpen,
  compact = false,
}: {
  artist: MusicArtistRef;
  onOpen: (artist: MusicArtistRef) => void;
  compact?: boolean;
}) {
  const language = useUiLanguage();
  const [result, setResult] = useState<{ key: string; data: MusicArtistProfile | null } | null>(
    null,
  );
  const key = `${artist.id}:${language}`;
  useEffect(() => {
    const controller = new AbortController();
    void loadArtistProfile(artist, language, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setResult({ key, data });
      })
      .catch(() => {
        if (!controller.signal.aborted) setResult({ key, data: null });
      });
    return () => controller.abort();
  }, [key, artist.id, artist.musicBrainzId]);
  const profile = result?.key === key ? result.data : null;
  if (!profile) return null;
  return (
    <MusicArtistStory
      profile={profile}
      artwork={artist.artwork}
      onOpen={onOpen}
      compact={compact}
    />
  );
}

export function MusicArtistStory({
  profile,
  artwork,
  onOpen,
  compact = false,
}: {
  profile: MusicArtistProfile;
  artwork?: string;
  onOpen: (artist: MusicArtistRef) => void;
  compact?: boolean;
}) {
  const t = useT();
  const [expanded, setExpanded] = useState(false);
  const image = profile.artwork || artwork;
  const artistLinks = profile.links.filter((link) => link.kind !== "merch");
  return (
    <section className="music-artist-overview" data-compact={compact || undefined}>
      <div className="music-artist-story">
        {image && (
          <div className="music-artist-story-image">
            <img src={image} alt={profile.name} loading="lazy" />
            <span>{t("music.artist.about")}</span>
          </div>
        )}
        <div className="music-artist-story-copy">
          <h2>{image ? profile.name : t("music.artist.about")}</h2>
          {profile.biography && (
            <>
              <p data-expanded={expanded || undefined}>{profile.biography}</p>
              {profile.biography.length > 320 && (
                <button
                  type="button"
                  className="music-home-text music-artist-read-more"
                  aria-expanded={expanded}
                  onClick={() => setExpanded((value) => !value)}
                >
                  {t(expanded ? "music.artist.readLess" : "music.artist.readMore")}
                </button>
              )}
            </>
          )}
          <dl className="music-artist-facts">
            {profile.origin && (
              <div>
                <dt>{t("music.artist.origin")}</dt>
                <dd>{profile.origin}</dd>
              </div>
            )}
            {profile.began && (
              <div>
                <dt>{t("music.artist.began")}</dt>
                <dd>
                  {profile.began}
                  {profile.ended ? ` – ${profile.ended}` : ""}
                </dd>
              </div>
            )}
            {profile.aliases.length > 0 && (
              <div>
                <dt>{t("music.artist.aliases")}</dt>
                <dd>{profile.aliases.join(" · ")}</dd>
              </div>
            )}
          </dl>
          {profile.genres.length > 0 && (
            <div className="music-artist-genres">
              {profile.genres.map((genre) => (
                <button key={genre} type="button" onClick={() => requestMusicGenre(genre)}>
                  {genre}
                </button>
              ))}
            </div>
          )}
          {profile.biographyUrl && (
            <button
              type="button"
              className="music-home-text music-artist-biography-source"
              onClick={() => openUrl(profile.biographyUrl!)}
            >
              Wikipedia
              <ArrowUpRight size={14} />
            </button>
          )}
        </div>
      </div>
      {profile.members.length > 0 && (
        <div>
          <h3>{t("music.artist.connections")}</h3>
          <div className="music-artist-links">
            {profile.members.map((member) => (
              <button key={member.id} type="button" onClick={() => onOpen(member)}>
                {member.name}
                <ArrowUpRight size={14} />
              </button>
            ))}
          </div>
        </div>
      )}
      {artistLinks.length > 0 && (
        <div>
          <h3>{t("music.artist.aroundWeb")}</h3>
          <div className="music-artist-links">
            {artistLinks.map((link) => (
              <button key={link.url} type="button" onClick={() => openUrl(link.url)}>
                {link.kind === "store" ? (
                  <ShoppingBag size={18} />
                ) : link.kind === "source" ? (
                  <MusicServiceLogo source={link.name.toLowerCase()} size={18} />
                ) : (
                  <Globe2 size={18} />
                )}
                <span>
                  {link.kind === "source"
                    ? link.name
                    : t(link.kind === "tour" ? "music.extras.tour" : `music.artist.${link.kind}`)}
                  <small>{link.kind === "source" ? "" : link.name}</small>
                </span>
                <ArrowUpRight size={14} />
              </button>
            ))}
          </div>
        </div>
      )}
      <MusicArtistExtras profile={profile} />
      <button
        type="button"
        className="music-home-text"
        onClick={() => openUrl(`https://musicbrainz.org/artist/${profile.id}`)}
      >
        <img
          src="https://icons.duckduckgo.com/ip3/musicbrainz.org.ico"
          alt=""
          width={15}
          height={15}
          loading="lazy"
          referrerPolicy="no-referrer"
          style={{ borderRadius: 3 }}
        />
        MusicBrainz
        <ArrowUpRight size={14} />
      </button>
    </section>
  );
}

export function MusicWhereToBuy({ item }: { item: MusicCatalogItem }) {
  const t = useT();
  const [opened, setOpened] = useState(false);
  const [profile, setProfile] = useState<MusicArtistProfile | null>(null);
  const artist =
    item.kind === "track" || item.kind === "album"
      ? item.artist
      : item.kind === "artist"
        ? item.name
        : "";
  const title = item.kind === "track" || item.kind === "album" ? item.title : "";
  useEffect(() => {
    setProfile(null);
    if (!opened || !artist) return;
    const controller = new AbortController();
    void resolveArtist(artist, { track: item.kind === "track" ? item : undefined })
      .then(async (ranking) => {
        if (!ranking.canonical || controller.signal.aborted) return;
        const value = await loadArtistProfile(ranking.canonical, "en", controller.signal);
        if (!controller.signal.aborted) setProfile(value);
      })
      .catch(() => {});
    return () => controller.abort();
  }, [item.id, artist, opened]);
  if (!artist) return null;
  const links =
    profile?.links.filter((link) => link.kind === "store" || link.kind === "merch") ?? [];
  return (
    <details className="music-buy-links" onToggle={(event) => setOpened(event.currentTarget.open)}>
      <summary>
        <ShoppingBag size={17} aria-hidden="true" />
        {t("music.buy.title")}
      </summary>
      <div className="music-artist-links">
        {links.map((link) => (
          <button type="button" key={link.url} onClick={() => openUrl(link.url)}>
            <span>
              {t(`music.artist.${link.kind}`)}
              <small>{link.name}</small>
            </span>
            <ArrowUpRight size={14} />
          </button>
        ))}
        <button
          type="button"
          onClick={() =>
            openUrl(
              `https://bandcamp.com/search?q=${encodeURIComponent(`${artist} ${title}`.trim())}`,
            )
          }
        >
          <ShoppingBag size={17} />
          {t("music.buy.search", { store: "Bandcamp" })}
          <ArrowUpRight size={14} />
        </button>
      </div>
    </details>
  );
}
