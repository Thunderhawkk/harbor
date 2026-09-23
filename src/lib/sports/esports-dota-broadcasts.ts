import { requestEsportsText, type EsportsMatch } from "./esports-feeds";
import { esportsEmbedUrl, type EsportsStream } from "./esports-streams";

type Row = Record<string, unknown>;
const row = (v: unknown): Row =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Row) : {};
const text = (v: unknown) => (typeof v === "string" ? v : "");
const normalize = (v: unknown) =>
  text(v)
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, "");
const slug = (v: unknown) => /^[a-z0-9][a-z0-9-]{0,180}$/.test(text(v));

/** Read public page data only. Never execute scripts or import advertising markup. */
export function dotaPageProps(html: string): Row {
  const raw = html.match(/\bdata-page="([^"]+)"/)?.[1];
  if (!raw) throw new Error("Dota match listing unavailable");
  const decoded = raw.replace(/&(?:quot|apos|amp|lt|gt|#39|#\d+|#x[0-9a-f]+);/gi, (entity) => {
    const named: Record<string, string> = {
      "&quot;": '"',
      "&apos;": "'",
      "&#39;": "'",
      "&amp;": "&",
      "&lt;": "<",
      "&gt;": ">",
    };
    if (named[entity]) return named[entity];
    const code = entity.toLowerCase().startsWith("&#x")
      ? parseInt(entity.slice(3, -1), 16)
      : Number(entity.slice(2, -1));
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : "";
  });
  return row(row(JSON.parse(decoded)).props);
}

function sameMatch(series: Row, match: EsportsMatch): boolean {
  const names = [normalize(row(series.team1).name), normalize(row(series.team2).name)].sort();
  const expected = match.teams.map((team) => normalize(team.name)).sort();
  const start = Date.parse(text(series.startAt));
  return (
    names.every(Boolean) &&
    names[0] === expected[0] &&
    names[1] === expected[1] &&
    Number.isFinite(start) &&
    Math.abs(start - match.startMs) <= 12 * 60 * 60_000
  );
}

export function dotaBroadcastMatchUrl(html: string, match: EsportsMatch): string | null {
  const props = dotaPageProps(html);
  const candidates = ["seriesList", "upcomingSeriesList", "latestSeriesResults"]
    .flatMap((key) => (Array.isArray(props[key]) ? (props[key] as unknown[]) : []))
    .map(row)
    .filter((series) => sameMatch(series, match));
  const urls = [
    ...new Set(
      candidates.flatMap((series) =>
        slug(series.slug) && slug(row(series.championship).slug)
          ? [`https://hawk.live/dota-2/matches/${row(series.championship).slug}/${series.slug}`]
          : [],
      ),
    ),
  ];
  return urls.length === 1 ? urls[0] : null;
}

export function parseDotaBroadcasts(html: string, match: EsportsMatch): EsportsStream[] {
  const series = row(dotaPageProps(html).seriesPageData);
  if (!sameMatch(series, match)) return [];
  const streams = Array.isArray(series.streams) ? series.streams.slice(0, 24) : [];
  const result = new Map<string, EsportsStream>();
  for (const value of streams) {
    const item = row(value);
    try {
      const url = new URL(text(item.url));
      if (url.protocol !== "https:" || url.username || url.password) continue;
      const host = url.hostname.replace(/^www\./, "");
      const channel =
        host === "player.twitch.tv"
          ? url.searchParams.get("channel")
          : host === "twitch.tv"
            ? url.pathname.split("/")[1]
            : null;
      const stream: EsportsStream | null =
        channel && /^[a-z0-9_]{1,25}$/i.test(channel)
          ? {
              title: text(item.name) || channel,
              url: `https://www.twitch.tv/${channel}`,
              platform: "twitch",
            }
          : ["youtube.com", "youtu.be", "youtube-nocookie.com"].includes(host)
            ? { title: text(item.name) || "YouTube", url: url.href, platform: "youtube" }
            : host === "kick.com"
              ? { title: text(item.name) || "Kick", url: url.href, platform: "kick" }
              : null;
      if (stream && esportsEmbedUrl(stream, "localhost")) result.set(stream.url, stream);
    } catch {
      /* Skip invalid or unrelated links. */
    }
  }
  return [...result.values()];
}

const pending = new Map<string, Promise<EsportsStream[]>>();
export async function fetchDotaBroadcasts(
  match: EsportsMatch,
  signal?: AbortSignal,
): Promise<EsportsStream[]> {
  signal?.throwIfAborted();
  if (match.game !== "dota2") return [];
  const key = `${match.id}:${match.startMs}:${match.teams.map((team) => team.name).join("|")}`;
  let task = pending.get(key);
  if (!task) {
    task = (async () => {
      const listing = await requestEsportsText("https://hawk.live/", 60_000);
      const url = dotaBroadcastMatchUrl(listing, match);
      if (!url) return [];
      return parseDotaBroadcasts(await requestEsportsText(url, 60_000), match);
    })().finally(() => pending.delete(key));
    pending.set(key, task);
  }
  const streams = await task;
  signal?.throwIfAborted();
  return streams;
}
