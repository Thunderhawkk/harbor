import { useCallback } from "react";
import { useT } from "@/lib/i18n";
import { headersFromChannel } from "@/lib/iptv/channel-headers";
import { recordChannelPlay } from "@/lib/iptv/channel-stats";
import type { IptvChannel } from "@/lib/iptv/types";
import type { SportsGame } from "@/lib/sports/espn";
import { useView } from "@/lib/view";
import type { AttachedStream } from "./source-store";

export function fixtureLabelOf(game: SportsGame): string {
  return `${game.away.name} v ${game.home.name}`;
}

export function useChannelPlayer(): (channel: IptvChannel, subtitle: string) => void {
  const t = useT();
  const { openPlayer } = useView();
  return useCallback(
    (channel: IptvChannel, subtitle: string) => {
      recordChannelPlay(channel);
      openPlayer({
        meta: {
          id: `iptv:${channel.id}`,
          type: "tv",
          name: channel.name,
          poster: channel.logo ?? undefined,
          logo: channel.logo ?? undefined,
          background: channel.logo ?? undefined,
          description: channel.group
            ? t("Live channel: {group}", { group: channel.group })
            : t("Live channel"),
          releaseInfo: t("Live"),
        },
        url: channel.url,
        title: channel.name,
        subtitle,
        notWebReady: true,
        isLive: true,
        headers: headersFromChannel(channel),
      });
    },
    [openPlayer, t],
  );
}

export function useStreamPlayer(): (stream: AttachedStream, name: string) => void {
  const t = useT();
  const { openPlayer } = useView();
  return useCallback(
    (stream: AttachedStream, name: string) => {
      openPlayer({
        meta: {
          id: `page-stream:${stream.url}`,
          type: "tv",
          name,
          poster: stream.poster || undefined,
          background: stream.poster || undefined,
          description: t("Resolved from {host}", { host: hostOf(stream.page) }),
          releaseInfo: t("Live"),
        },
        url: stream.url,
        title: name,
        subtitle: hostOf(stream.page),
        notWebReady: true,
        isLive: stream.kind !== "file",
        headers: stream.headers,
      });
    },
    [openPlayer, t],
  );
}

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./i, "");
  } catch {
    return url;
  }
}
