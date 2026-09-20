import { esportsEmbedUrl } from "./esports-streams";
export type EsportsGameId = "dota2" | "cs2" | "valorant" | "lol" | "rocketleague";
export type EsportsMatchState = "live" | "upcoming" | "recent";

export interface EsportsTeam {
  id: string;
  name: string;
  code?: string;
  logo?: string;
  score?: number;
  winner?: boolean;
}

export interface EsportsStream {
  title: string;
  url: string;
  platform: "twitch" | "youtube" | "kick" | "external";
}

export interface EsportsMatch {
  id: string;
  game: EsportsGameId;
  state: EsportsMatchState;
  startMs: number;
  /** Last timestamp the provider explicitly reported for live data. */
  updatedMs?: number;
  event: { id: string; name: string; logo?: string; stage?: string };
  teams: [EsportsTeam, EsportsTeam];
  bestOf?: number;
  streams: EsportsStream[];
  sourceUrl: string;
}

export interface EsportsFeed {
  game: EsportsGameId;
  matches: EsportsMatch[];
  status: "ready" | "unavailable" | "stale";
  fetchedAt: number;
  source: { name: string; url: string };
  reason?: string;
  partial?: boolean;
}

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
const SOURCES: Record<EsportsGameId, EsportsFeed["source"]> = {
  lol: {
    name: "LoL Esports · official",
    url: "https://lolesports.com/en-US/schedule",
  },
  valorant: {
    name: "VALORANT Esports · official",
    url: "https://valorantesports.com/en-US/schedule",
  },
  dota2: { name: "OpenDota", url: "https://www.opendota.com/matches" },
  cs2: {
    name: "Bo3.gg · community coverage",
    url: "https://bo3.gg/matches/current",
  },
  rocketleague: {
    name: "BLAST.tv · official RLCS coverage",
    url: "https://blast.tv/rl",
  },
};
type RecordValue = Record<string, unknown>;
const object = (value: unknown): RecordValue =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as RecordValue) : {};
const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const string = (value: unknown): string =>
  typeof value === "string"
    ? value.trim()
    : typeof value === "number" && Number.isFinite(value)
      ? String(value)
      : "";
const number = (value: unknown): number | undefined =>
  value !== null && value !== "" && value !== undefined && Number.isFinite(Number(value))
    ? Number(value)
    : undefined;

function imageUrl(value: unknown): string | undefined {
  try {
    const url = new URL(string(value));
    if (url.protocol === "http:" && url.hostname === "static.lolesports.com")
      url.protocol = "https:";
    return url.protocol === "https:" && !url.username && !url.password ? url.href : undefined;
  } catch {
    return undefined;
  }
}

/** Time never promotes a schedule entry to LIVE. Only an explicit provider state can do that. */
export function currentEsportsMatches(matches: EsportsMatch[], now = Date.now()): EsportsMatch[] {
  const unique = new Map<string, EsportsMatch>();
  const stateRank = { upcoming: 0, live: 1, recent: 2 };
  for (const match of matches) {
    if (!match.id || !Number.isFinite(match.startMs) || match.teams.some((team) => !team.name))
      continue;
    if (match.state === "upcoming" && (match.startMs < now || match.startMs > now + 30 * DAY))
      continue;
    if (match.state === "recent" && (match.startMs < now - 2 * DAY || match.startMs > now))
      continue;
    if (
      match.state === "live" &&
      (match.startMs < now - 12 * 60 * MINUTE || match.startMs > now + 5 * MINUTE)
    )
      continue;
    if (
      match.state === "live" &&
      match.updatedMs !== undefined &&
      (now - match.updatedMs > 5 * MINUTE || match.updatedMs > now + MINUTE)
    )
      continue;
    const key = `${match.game}:${match.id}`;
    const existing = unique.get(key);
    if (!existing || stateRank[match.state] >= stateRank[existing.state]) unique.set(key, match);
  }
  const order = { live: 0, upcoming: 1, recent: 2 };
  return [...unique.values()]
    .sort(
      (a, b) =>
        order[a.state] - order[b.state] ||
        (a.state === "recent" ? b.startMs - a.startMs : a.startMs - b.startMs),
    )
    .slice(0, 240);
}

/** Read only JSON object literals in the official page's SSR data, never execute remote scripts. */
export function extractRiotEvents(html: string): RecordValue[] {
  if (html.length > 8_000_000) throw new Error("Schedule response is too large");
  const marker = '{"__typename":"EventMatch"';
  const events: RecordValue[] = [];
  let offset = 0;
  while (events.length < 500) {
    const start = html.indexOf(marker, offset);
    if (start < 0) break;
    let depth = 0;
    let quoted = false;
    let escaped = false;
    let end = start;
    for (; end < Math.min(html.length, start + 250_000); end++) {
      const c = html[end];
      if (quoted) {
        if (escaped) escaped = false;
        else if (c === "\\") escaped = true;
        else if (c === '"') quoted = false;
      } else if (c === '"') quoted = true;
      else if (c === "{") depth++;
      else if (c === "}" && --depth === 0) break;
    }
    offset = end + 1;
    try {
      events.push(object(JSON.parse(html.slice(start, offset))));
    } catch {
      /* Ignore malformed inert data; never evaluate it. */
    }
  }
  // A changed page must report unavailable rather than silently claiming an empty live board.
  if (!events.length) throw new Error("Official schedule format is unavailable");
  return events;
}

function riotStreams(raw: unknown): EsportsStream[] {
  return list(raw).flatMap<EsportsStream>((value) => {
    const row = object(value);
    const provider = string(row.provider).toLowerCase();
    const parameter = string(row.parameter);
    const title = string(row.name) || string(row.locale) || provider;
    if (provider === "twitch" && /^[a-z0-9_]{1,50}$/i.test(parameter))
      return [
        {
          title,
          url: `https://www.twitch.tv/${parameter}`,
          platform: "twitch" as const,
        },
      ];
    if (provider === "youtube" && /^[a-zA-Z0-9_-]{11}$/.test(parameter))
      return [
        {
          title,
          url: `https://www.youtube.com/watch?v=${parameter}`,
          platform: "youtube" as const,
        },
      ];
    return [];
  });
}

export function parseRiotEsports(
  html: string,
  game: "lol" | "valorant",
  now = Date.now(),
): EsportsMatch[] {
  return currentEsportsMatches(
    extractRiotEvents(html).flatMap((row) => {
      const id = string(row.id);
      const startMs = Date.parse(string(row.startTime));
      const state = (
        {
          unstarted: "upcoming",
          inProgress: "live",
          completed: "recent",
        } as const
      )[string(row.state) as "unstarted" | "inProgress" | "completed"];
      const teams = list(row.matchTeams)
        .slice(0, 2)
        .map((value) => {
          const team = object(value);
          const result = object(team.result);
          return {
            id: string(team.id).split(":").at(-1) || "",
            name: string(team.name),
            code: string(team.code),
            logo: imageUrl(team.image),
            score: state === "upcoming" ? undefined : number(result.gameWins),
            winner: result.outcome === "win",
          };
        });
      if (!/^\d+$/.test(id) || !state || teams.length !== 2) return [];
      const league = object(row.league);
      const tournament = object(row.tournament);
      const strategy = object(object(row.match).strategy);
      const origin = game === "lol" ? "https://lolesports.com" : "https://valorantesports.com";
      const sourceUrl = /^\d+$/.test(string(tournament.id))
        ? `${origin}/en-US/tournament/${string(tournament.id)}`
        : `${origin}/en-US/schedule`;
      return [
        {
          id,
          game,
          state,
          startMs,
          event: {
            id: string(tournament.id) || string(league.id),
            name: [string(league.name), string(tournament.name)].filter(Boolean).join(" · "),
            logo: imageUrl(league.image),
            stage: string(row.blockName),
          },
          teams: teams as [EsportsTeam, EsportsTeam],
          bestOf: strategy.type === "bestOf" ? number(strategy.count) : undefined,
          streams: riotStreams(row.streams),
          sourceUrl,
        },
      ];
    }),
    now,
  );
}

export function parseOpenDotaEsports(
  raw: unknown,
  live: boolean,
  now = Date.now(),
): EsportsMatch[] {
  if (!Array.isArray(raw)) throw new Error("Invalid OpenDota feed");
  return currentEsportsMatches(
    raw.flatMap((value) => {
      const row = object(value);
      const id = string(row.match_id);
      const leagueId = string(live ? row.league_id : row.leagueid);
      if (!/^\d+$/.test(id) || !Number(leagueId)) return [];
      const teams = [true, false].map((radiant) => {
        const side = radiant ? "radiant" : "dire";
        return {
          id: string(row[live ? `team_id_${side}` : `${side}_team_id`]),
          name: string(row[live ? `team_name_${side}` : `${side}_name`]),
          score: number(row[`${side}_score`]),
          winner:
            !live && typeof row.radiant_win === "boolean" ? row.radiant_win === radiant : undefined,
        };
      });
      const updatedMs = live ? (number(row.last_update_time) ?? 0) * 1000 : undefined;
      if (live && !updatedMs) return [];
      return [
        {
          id,
          game: "dota2" as const,
          state: live ? ("live" as const) : ("recent" as const),
          startMs: (number(live ? row.activate_time : row.start_time) ?? 0) * 1000,
          updatedMs,
          event: {
            id: leagueId,
            name: string(row.league_name) || "Dota 2 · professional match",
          },
          teams: teams as [EsportsTeam, EsportsTeam],
          streams: [],
          sourceUrl: `https://www.opendota.com/matches/${id}`,
        },
      ];
    }),
    now,
  );
}

/** Public Bo3.gg website feed. Deliberately omit odds, affiliate links and model predictions. */
export function parseBo3Esports(raw: unknown, now = Date.now()): EsportsMatch[] {
  const payload = object(raw);
  if (!payload.data || !payload.included) throw new Error("CS2 coverage is unavailable");
  const included = object(payload.included);
  const teamsById = object(included.teams);
  const tournaments = object(included.tournaments);
  const tiers = object(object(payload.data).tiers);
  const rows = Array.isArray(payload.data)
    ? payload.data
    : Object.values(tiers).flatMap((tier) => list(object(tier).matches));
  return currentEsportsMatches(
    rows.flatMap((value) => {
      const row = object(value);
      const state = ({ current: "live", upcoming: "upcoming", finished: "recent" } as const)[
        string(row.status) as "current" | "upcoming" | "finished"
      ];
      const id = string(row.id);
      const slug = string(row.slug);
      if (
        !state ||
        number(row.discipline_id) !== 1 ||
        !/^\d+$/.test(id) ||
        !/^[a-z0-9-]+$/.test(slug)
      )
        return [];
      const teams = [1, 2].map((side) => {
        const teamId = string(row[`team${side}_id`]);
        const team = object(teamsById[teamId]);
        return {
          id: teamId,
          name: string(team.name),
          logo: imageUrl(object(team.image_versions)["50x50"] || team.image_url),
          score: state === "upcoming" ? undefined : number(row[`team${side}_score`]),
          winner: row.winner_team_id ? string(row.winner_team_id) === teamId : undefined,
        };
      });
      const tournament = object(tournaments[string(row.tournament)]);
      return [
        {
          id,
          game: "cs2" as const,
          state,
          startMs: Date.parse(string(row.start_date)),
          event: {
            id: string(tournament.id),
            name: string(tournament.name),
            logo: imageUrl(tournament.image_url),
          },
          teams: teams as [EsportsTeam, EsportsTeam],
          bestOf: number(row.bo_type),
          streams: [],
          sourceUrl: `https://bo3.gg/matches/${slug}`,
        },
      ];
    }),
    now,
  );
}

/** BLAST's public RL page embeds an indexed JSON transport, not an executable API client. */
export function parseBlastRocketLeague(html: string, now = Date.now()): EsportsMatch[] {
  if (html.length > 8_000_000) throw new Error("Schedule response is too large");
  const tournaments: RecordValue[] = [];
  const chunks = html.matchAll(/streamController\.enqueue\(("(?:\\.|[^"\\])*")\)/g);
  for (const chunk of chunks) {
    let table: unknown[];
    try {
      table = JSON.parse(JSON.parse(chunk[1]));
    } catch {
      continue;
    }
    if (!Array.isArray(table) || table.length > 30_000) continue;
    const keyName = (key: string) =>
      /^_\d+$/.test(key) ? string(table[Number(key.slice(1))]) : "";
    let reads = 0;
    const resolve = (reference: unknown, depth = 0): unknown => {
      if (
        depth > 12 ||
        ++reads > 30_000 ||
        typeof reference !== "number" ||
        !Number.isInteger(reference) ||
        reference < 0 ||
        reference >= table.length
      )
        return undefined;
      const value = table[reference];
      if (Array.isArray(value)) return value.map((item) => resolve(item, depth + 1));
      if (value && typeof value === "object") {
        const decoded: RecordValue = Object.create(null);
        for (const [key, child] of Object.entries(value)) {
          const name = keyName(key);
          if (name && !["__proto__", "constructor", "prototype"].includes(name))
            decoded[name] = resolve(child, depth + 1);
        }
        return decoded;
      }
      return value;
    };
    table.forEach((entry, index) => {
      if (
        entry &&
        typeof entry === "object" &&
        !Array.isArray(entry) &&
        Object.keys(entry).some((key) => keyName(key) === "matches")
      )
        tournaments.push(object(resolve(index)));
    });
  }
  if (!tournaments.length) throw new Error("Official RLCS schedule format is unavailable");
  const matches = tournaments.flatMap((tournament) => {
    const tournamentId = string(tournament.id);
    const name = string(tournament.name);
    if (!/^[a-z0-9-]+$/.test(tournamentId) || !name) return [];
    return list(tournament.matches).flatMap<EsportsMatch>((value) => {
      const row = object(value);
      const id = string(row.id);
      if (!/^[a-f0-9-]{36}$/.test(id)) return [];
      const teams = [object(row.teamA), object(row.teamB)].map((team, index) => ({
        id: string(team.id),
        name: string(team.name),
        code: string(team.shortName),
        logo: /^[a-f0-9-]{36}$/.test(string(team.id))
          ? `https://assets.blast.tv/images/teams/${string(team.id)}?width=128&format=auto`
          : undefined,
        score:
          row.hasFinished === true || row.startedAt
            ? number(row[index === 0 ? "teamAScore" : "teamBScore"])
            : undefined,
      }));
      if (teams.some((team) => !team.name)) return [];
      const state: EsportsMatchState =
        row.hasFinished === true ? "recent" : row.startedAt ? "live" : "upcoming";
      const sourceUrl = `https://blast.tv/rl/tournaments/${tournamentId}/series/${id.slice(0, 8)}/${teams.map((team) => team.code).join("-")}`;
      let streams: EsportsStream[] = [];
      const externalStream = imageUrl(object(row.metadata).externalStreamUrl);
      if (externalStream) {
        const host = new URL(externalStream).hostname.replace(/^www\./, "");
        if (["youtube.com", "youtu.be", "twitch.tv"].includes(host))
          streams = [
            {
              title: "Official broadcast",
              url: externalStream,
              platform: (host === "twitch.tv" ? "twitch" : "youtube") as EsportsStream["platform"],
            },
          ].filter((stream) => esportsEmbedUrl(stream as EsportsStream, "localhost"));
      }
      return [
        {
          id,
          game: "rocketleague",
          state,
          startMs: Date.parse(string(row.startedAt || row.scheduledAt)),
          event: {
            id: tournamentId,
            name,
            stage: [string(row.stageName), string(row.name)].filter(Boolean).join(" · "),
            logo: `https://assets.blast.tv/images/tournament/${tournamentId}?width=128&format=auto`,
          },
          teams: teams as [EsportsTeam, EsportsTeam],
          bestOf: /^BO[1-9]$/.test(string(row.type))
            ? Number(string(row.type).slice(2))
            : undefined,
          streams,
          sourceUrl,
        },
      ];
    });
  });
  return currentEsportsMatches(matches, now);
}

const feedCache = new Map<EsportsGameId, EsportsFeed>();
const inFlight = new Map<EsportsGameId, Promise<EsportsFeed>>();
const responseCache = new Map<string, { at: number; data: string }>();

export async function requestEsportsText(url: string, ttl: number): Promise<string> {
  const cached = responseCache.get(url);
  if (cached && Date.now() - cached.at < ttl) return cached.data;
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const work = (async () => {
      const { safeFetch } = await import("../safe-fetch");
      const response = await safeFetch(url, { signal: controller.signal });
      if (!response.ok) throw new Error("Esports source is unavailable");
      if (Number(response.headers.get("content-length")) > 8_000_000)
        throw new Error("Schedule response is too large");
      const data = await response.text();
      if (data.length > 8_000_000) throw new Error("Schedule response is too large");
      return data;
    })();
    const data = await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new Error("Esports source timed out"));
        }, 10_000);
      }),
    ]);
    responseCache.set(url, { at: Date.now(), data });
    // Enforce a byte budget too: the official Riot SSR pages are much larger than JSON feeds.
    let retainedSize = [...responseCache.values()].reduce(
      (sum, value) => sum + value.data.length * 2,
      0,
    );
    for (const [key, value] of responseCache) {
      if (responseCache.size <= 20 && retainedSize <= 16_000_000) break;
      retainedSize -= value.data.length * 2;
      responseCache.delete(key);
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}

const request = requestEsportsText;

async function loadFeed(game: EsportsGameId): Promise<EsportsFeed> {
  const source = SOURCES[game];
  try {
    let matches: EsportsMatch[];
    let partial = false;
    if (game === "lol" || game === "valorant")
      matches = parseRiotEsports(await request(source.url, 90_000), game);
    else if (game === "rocketleague")
      matches = parseBlastRocketLeague(await request(source.url, 90_000));
    else {
      const iso = (days: number) => new Date(Date.now() + days * DAY).toISOString().slice(0, 10);
      const base = "https://api.bo3.gg/api/v2/matches/";
      const query = "?filter%5Bdiscipline_id%5D%5Beq%5D=1";
      const jobs =
        game === "dota2"
          ? [
              request("https://api.opendota.com/api/live", MINUTE).then((raw) =>
                parseOpenDotaEsports(JSON.parse(raw), true),
              ),
              request("https://api.opendota.com/api/proMatches", 5 * MINUTE).then((raw) =>
                parseOpenDotaEsports(JSON.parse(raw), false),
              ),
            ]
          : [
              request(`${base}live${query}`, MINUTE).then((raw) =>
                parseBo3Esports(JSON.parse(raw)),
              ),
              ...[0, 1].map((day) =>
                request(`${base}upcoming${query}&date=${iso(day)}&utc_offset=0`, 5 * MINUTE).then(
                  (raw) => parseBo3Esports(JSON.parse(raw)),
                ),
              ),
              ...[0, -1].map((day) =>
                request(`${base}finished${query}&date=${iso(day)}&utc_offset=0`, 5 * MINUTE).then(
                  (raw) => parseBo3Esports(JSON.parse(raw)),
                ),
              ),
            ];
      const results = await Promise.allSettled(jobs);
      const succeeded = results.filter(
        (result): result is PromiseFulfilledResult<EsportsMatch[]> => result.status === "fulfilled",
      );
      if (!succeeded.length) throw new Error("Esports source is unavailable");
      partial = succeeded.length !== results.length;
      matches = currentEsportsMatches(succeeded.flatMap((result) => result.value));
    }
    const result: EsportsFeed = {
      game,
      matches,
      status: "ready",
      partial,
      fetchedAt: Date.now(),
      source,
      reason: partial
        ? "Some match feeds did not respond. Available matches are shown."
        : undefined,
    };
    feedCache.set(game, result);
    return result;
  } catch {
    const previous = feedCache.get(game);
    return {
      game,
      matches: previous
        ? currentEsportsMatches(previous.matches.filter((match) => match.state !== "live"))
        : [],
      status: previous ? "stale" : "unavailable",
      fetchedAt: previous?.fetchedAt ?? Date.now(),
      source,
      reason: previous
        ? "Showing the last available schedule. Live status could not be refreshed."
        : "This match feed is unavailable. Try again or open the source schedule.",
    };
  }
}

/** Concurrent consumers share requests, while cancelling one view never cancels a peer. */
export async function fetchEsportsFeed(
  game: EsportsGameId,
  options: { signal?: AbortSignal; force?: boolean } = {},
): Promise<EsportsFeed> {
  options.signal?.throwIfAborted();
  const previous = feedCache.get(game);
  if (!options.force && previous && Date.now() - previous.fetchedAt < MINUTE)
    return { ...previous, matches: currentEsportsMatches(previous.matches) };
  let pending = inFlight.get(game);
  if (!pending) {
    if (options.force) {
      const hosts =
        game === "cs2"
          ? ["api.bo3.gg"]
          : game === "dota2"
            ? ["api.opendota.com"]
            : [new URL(SOURCES[game].url).hostname];
      for (const url of responseCache.keys())
        if (hosts.includes(new URL(url).hostname)) responseCache.delete(url);
    }
    pending = loadFeed(game).finally(() => {
      inFlight.delete(game);
    });
    inFlight.set(game, pending);
  }
  if (!options.signal) return pending;
  const signal = options.signal;
  return new Promise<EsportsFeed>((resolve, reject) => {
    const abort = () => reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
    signal.addEventListener("abort", abort, { once: true });
    pending!.then(
      (result) => {
        signal.removeEventListener("abort", abort);
        if (!signal.aborted) resolve(result);
      },
      (error) => {
        signal.removeEventListener("abort", abort);
        reject(error);
      },
    );
  });
}
