import { useEffect, useState } from "react";
import { setPlaybackPresence } from "@/lib/discord/presence";
import { getPlaybackPosition } from "@/lib/player/playback-clock";
import type { PlayerSnapshot } from "@/lib/player/bridge";
import type { PlayerSrc } from "@/lib/view";
import { resolvePreferredAnimeTitle } from "@/lib/anime-title";
import { useSettings } from "@/lib/settings";

const POSITION_REFRESH_MS = 30000;
const ANIME_META_ID = /^(kitsu|mal|anilist):/;

export function usePlaybackPresence(params: {
  src: PlayerSrc;
  snap: PlayerSnapshot;
  season: number | undefined;
  episode: number | undefined;
  liveGuideOpen: boolean;
}) {
  const { src, snap, season, episode, liveGuideOpen } = params;
  const { settings } = useSettings();
  const [preferredTitle, setPreferredTitle] = useState<string | null>(null);

  // Presence shows one title for the whole session, but the meta a launch
  // carries depends on where it came from: a Kitsu addon meta is the Kitsu
  // canonical title (often romaji), while the detail page resolves an English
  // one. Resolve it the same way the cards do so both agree.
  useEffect(() => {
    const id = src.meta.id ?? "";
    const wanted = settings.discordRichPresence || settings.shareWatchPresence;
    if (!wanted || !ANIME_META_ID.test(id)) {
      setPreferredTitle(null);
      return;
    }
    let cancelled = false;
    void resolvePreferredAnimeTitle(id, settings.simklAnimeTitleLanguage)
      .then((title) => {
        if (!cancelled) setPreferredTitle(title?.trim() || null);
      })
      .catch(() => {
        if (!cancelled) setPreferredTitle(null);
      });
    return () => {
      cancelled = true;
    };
  }, [
    src.meta.id,
    settings.simklAnimeTitleLanguage,
    settings.discordRichPresence,
    settings.shareWatchPresence,
  ]);

  useEffect(() => {
    if (snap.status !== "playing" && snap.status !== "paused") {
      setPlaybackPresence(null);
      return;
    }
    if (src.meta.id?.startsWith("iptv:")) return;
    const year =
      typeof src.meta.releaseInfo === "string" ? src.meta.releaseInfo.slice(0, 4) : undefined;
    const epLabel =
      season != null && episode != null
        ? `S${src.episode?.imdbSeason ?? season} E${src.episode?.imdbEpisode ?? episode}`
        : undefined;
    const epTitle = src.episode?.name?.trim();
    const epLine = epLabel && epTitle ? `${epLabel} · ${epTitle}` : epLabel;
    const title = preferredTitle ?? src.meta.name ?? "Untitled";
    const publish = () =>
      setPlaybackPresence({
        title,
        subtitle: epLine || year,
        metaId: src.meta.id ?? undefined,
        metaType: src.meta.type ?? undefined,
        posterUrl: src.meta.poster ?? src.episode?.still ?? undefined,
        smallImageUrl: src.episode?.still ?? undefined,
        year,
        paused: snap.status === "paused",
        positionSec: getPlaybackPosition(),
        durationSec: snap.durationSec,
      });
    publish();
    if (snap.status !== "playing") return;
    const tick = window.setInterval(publish, POSITION_REFRESH_MS);
    return () => window.clearInterval(tick);
  }, [
    snap.status,
    snap.durationSec,
    src.meta.id,
    src.meta.name,
    src.meta.poster,
    src.meta.releaseInfo,
    src.episode?.name,
    src.episode?.still,
    src.liveProgram,
    season,
    episode,
    preferredTitle,
  ]);

  useEffect(() => {
    if (!(src.meta.id?.startsWith("iptv:") ?? false)) return;
    if (snap.status !== "playing" && snap.status !== "paused") {
      setPlaybackPresence(null);
      return;
    }
    if (liveGuideOpen) {
      setPlaybackPresence({
        title: "Browsing the TV guide",
        subtitle: "Live TV",
        paused: false,
        positionSec: 0,
        durationSec: 0,
      });
      return;
    }
    const lead = src.liveProgram || src.meta.name || "Live TV";
    setPlaybackPresence({
      title: `Live · ${lead}`,
      subtitle: src.liveProgram ? src.meta.name : undefined,
      posterUrl: src.meta.poster ?? undefined,
      paused: snap.status === "paused",
      positionSec: 0,
      durationSec: 0,
    });
  }, [liveGuideOpen, snap.status, src.meta.id, src.meta.name, src.meta.poster, src.liveProgram]);

  useEffect(() => () => setPlaybackPresence(null), []);
}
