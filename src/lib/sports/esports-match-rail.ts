import {
  currentEsportsMatches,
  type EsportsFeed,
  type EsportsGameId,
  type EsportsMatch,
} from "./esports-feeds";

/** A compact cross-game selection; only fresh provider states can occupy live slots. */
export function esportsRailMatches(feeds: EsportsFeed[], now = Date.now()): EsportsMatch[] {
  const matches = currentEsportsMatches(
    feeds.flatMap((feed) =>
      feed.matches.filter(
        (match) =>
          match.state !== "live" || (feed.status === "ready" && now - feed.fetchedAt < 3 * 60_000),
      ),
    ),
    now,
  );
  const live = matches.filter((match) => match.state === "live");
  const upcoming = matches.filter((match) => match.state === "upcoming");
  const perGame = new Map<string, number>();
  const first = upcoming.filter((match) => {
    const count = perGame.get(match.game) ?? 0;
    perGame.set(match.game, count + 1);
    return count < 3;
  });
  const selected = [...live, ...first, ...upcoming.filter((match) => !first.includes(match))];
  return (selected.length ? selected : matches.filter((match) => match.state === "recent")).slice(
    0,
    12,
  );
}

const LEAGUE_GAMES: Record<string, EsportsGameId> = {
  DOTA2: "dota2",
  LCK: "lol",
  LEC: "lol",
  LPL: "lol",
  RLCS: "rocketleague",
};

/** Undefined is global browsing; an explicit empty selection requests nothing. */
export function esportsRailGames(leagueKeys?: readonly string[]): EsportsGameId[] | undefined {
  return leagueKeys === undefined
    ? undefined
    : [...new Set(leagueKeys.flatMap((key) => (LEAGUE_GAMES[key] ? [LEAGUE_GAMES[key]] : [])))];
}

export function selectedEsportsFeeds(
  feeds: EsportsFeed[],
  leagueKeys?: readonly string[],
): EsportsFeed[] {
  if (leagueKeys === undefined) return feeds;
  const games = esportsRailGames(leagueKeys)!;
  return feeds
    .filter((feed) => games.includes(feed.game))
    .map((feed) => ({
      ...feed,
      matches: feed.matches.filter((match) => {
        if (match.game !== "lol") return true;
        const league = match.event.name.split("·")[0].trim().toUpperCase();
        return leagueKeys.some((key) => LEAGUE_GAMES[key] === "lol" && league === key);
      }),
    }));
}
