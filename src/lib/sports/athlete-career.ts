export type AthleteCareerCategory = {
  name: string;
  rowLabel?: string;
  teamLabel?: string;
  labels: string[];
  descriptions: string[];
  totals: string[];
  rows: { season: string; team: string; teamLogo?: string; values: string[] }[];
};

type Json = Record<string, unknown>;
const object = (value: unknown): Json =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Json) : {};
const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const text = (value: unknown): string =>
  typeof value === "string" ? value.trim().slice(0, 300) : "";
const cell = (value: unknown): string =>
  text(value) || (typeof value === "number" && Number.isFinite(value) ? String(value) : "—");
const cells = (value: unknown): string[] => list(value).slice(0, 40).map(cell);
function image(value: unknown): string | undefined {
  try {
    const url = new URL(text(value));
    return url.protocol === "https:" && !url.username && !url.password ? url.href : undefined;
  } catch {
    return undefined;
  }
}
function teamImage(team: Json): string | undefined {
  return (
    image(team.logo) ||
    image(team.headshot) ||
    image(object(team.headshot).href) ||
    list(team.logos)
      .map((logo) => image(object(logo).href))
      .find(Boolean)
  );
}

/** ESPN's web stats teams are keyed by slug, not necessarily by numeric team ID. */
export function parseWebAthleteCareer(raw: unknown): AthleteCareerCategory[] {
  const data = object(raw),
    teams = object(data.teams);
  const byId = new Map(
    Object.values(teams)
      .map((team) => {
        const item = object(team);
        return [cell(item.id), item] as const;
      })
      .filter(([id]) => /^\d+$/.test(id)),
  );
  return list(data.categories)
    .slice(0, 20)
    .map((entry) => {
      const category = object(entry),
        labels = cells(category.labels);
      const width = labels.length;
      const align = (value: unknown): string[] => {
        const values = cells(value);
        return Array.from({ length: width }, (_, index) => values[index] || "—");
      };
      const descriptions = list(category.descriptions),
        displayNames = list(category.displayNames);
      return {
        name: text(category.displayName) || text(category.name),
        labels,
        descriptions: labels.map(
          (label, index) => text(descriptions[index]) || text(displayNames[index]) || label,
        ),
        totals: list(category.totals).length ? align(category.totals) : [],
        rows: list(category.statistics)
          .slice(-200)
          .map((entry) => {
            const row = object(entry),
              season = object(row.season);
            const team = object(
              teams[text(row.teamSlug)] ||
                teams[cell(row.teamId)] ||
                byId.get(cell(row.teamId)) ||
                row.team,
            );
            return {
              season:
                text(season.displayName) ||
                (typeof season.year === "number" ? String(season.year) : ""),
              team:
                text(team.displayName) ||
                text(team.shortDisplayName) ||
                text(team.abbreviation) ||
                text(team.name) ||
                text(row.teamSlug).replaceAll("-", " "),
              teamLogo: teamImage(team),
              values: align(row.stats),
            };
          }),
      };
    })
    .filter(
      (category) =>
        category.name && category.labels.length && (category.rows.length || category.totals.length),
    );
}

/** MMA /stats is unsupported. The common profile includes the actual completed fight history. */
export function parseMmaAthleteCareer(raw: unknown, athleteId: string): AthleteCareerCategory[] {
  const data = object(raw),
    athlete = object(data.athlete);
  if (cell(athlete.id) !== athleteId) return [];
  const events = object(data.eventsMap),
    seen = new Set<string>();
  const ordered = [...list(data.events).map((id) => events[text(id)]), ...Object.values(events)];
  const rows = ordered
    .map(object)
    .filter((event) => {
      const key = text(event.uid) || `${cell(event.id)}:${cell(object(event.opponent).id)}`;
      const result = text(event.gameResult);
      if (!result || seen.has(key) || !text(object(event.opponent).displayName)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => (Date.parse(text(a.gameDate)) || 0) - (Date.parse(text(b.gameDate)) || 0))
    .slice(-200)
    .map((event) => {
      const opponent = object(event.opponent),
        status = object(event.status);
      return {
        season: /^\d{4}-\d{2}-\d{2}/.exec(text(event.gameDate))?.[0] || "—",
        team: text(opponent.displayName),
        teamLogo: teamImage(opponent),
        values: [
          cell(event.gameResult),
          cell(object(status.result).displayName || object(status.result).shortDisplayName),
          cell(status.period),
          cell(status.displayClock),
          cell(event.name || event.shortName),
        ],
      };
    });
  return rows.length
    ? [
        {
          name: "Fight history",
          rowLabel: "Date",
          teamLabel: "Opponent",
          labels: ["Result", "Method", "Round", "Time", "Event"],
          descriptions: ["Result", "Method", "Round", "Time", "Event"],
          totals: [],
          rows,
        },
      ]
    : [];
}

/** Tennis exposes career totals in the core total split; no season rows are implied. */
export function parseCoreAthleteCareer(raw: unknown): AthleteCareerCategory[] {
  const splits = object(object(raw).splits);
  if (splits.type !== "total") return [];
  return list(splits.categories)
    .slice(0, 20)
    .map((entry) => {
      const category = object(entry);
      const stats = list(category.stats)
        .slice(0, 40)
        .map(object)
        .filter((stat) => text(stat.name));
      return {
        name: text(category.displayName) || text(category.name),
        labels: stats.map(
          (stat) => text(stat.abbreviation) || text(stat.displayName) || text(stat.name),
        ),
        descriptions: stats.map(
          (stat) => text(stat.description) || text(stat.displayName) || text(stat.name),
        ),
        totals: stats.map((stat) => cell(stat.displayValue ?? stat.value)),
        rows: [],
      };
    })
    .filter((category) => category.name && category.labels.length);
}

type RequestJson = (url: string, signal: AbortSignal) => Promise<unknown>;
const BASE = "https://site.web.api.espn.com/apis/common/v3/sports";
const validPath =
  /^(?:football|basketball|baseball|hockey|mma|tennis|racing|golf|soccer|rugby|cricket|lacrosse|volleyball|australian-football|field-hockey)\/[a-z0-9][a-z0-9.-]{0,70}$/;
function abortable<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => {
      cleanup();
      reject(signal.reason || new DOMException("Aborted", "AbortError"));
    };
    const cleanup = () => signal.removeEventListener("abort", abort);
    // Always observe the supplied promise, including after a caller has cancelled.
    work.then(
      (value) => {
        cleanup();
        if (!signal.aborted) resolve(value);
      },
      (error) => {
        cleanup();
        if (!signal.aborted) reject(error);
      },
    );
    if (signal.aborted) abort();
    else signal.addEventListener("abort", abort, { once: true });
  });
}

/** One bounded request per profile; no season-by-season fan-out. Failures are never cached. */
export function createAthleteCareerClient(request: RequestJson) {
  const cache = new Map<string, { at: number; data: AthleteCareerCategory[] }>();
  let active = 0;
  const queue: (() => void)[] = [];
  const acquire = async (signal: AbortSignal) => {
    signal.throwIfAborted();
    if (active >= 3) {
      await new Promise<void>((resolve, reject) => {
        const ready = () => {
          signal.removeEventListener("abort", cancel);
          active++;
          resolve();
        };
        const cancel = () => {
          const index = queue.indexOf(ready);
          if (index >= 0) queue.splice(index, 1);
          reject(signal.reason);
        };
        queue.push(ready);
        signal.addEventListener("abort", cancel, { once: true });
      });
    } else active++;
    return () => {
      active--;
      queue.shift()?.();
    };
  };
  return async function fetchCareer(
    path: string,
    athleteId: string,
    signal: AbortSignal,
    bio?: Promise<unknown>,
  ): Promise<AthleteCareerCategory[]> {
    signal.throwIfAborted();
    if (!validPath.test(path) || !/^\d{1,15}$/.test(athleteId)) return [];
    // Cricket profiles and scorecards are public, but this common career endpoint returns 500.
    if (path.startsWith("cricket/")) return [];
    const key = `${path}:${athleteId}`,
      hit = cache.get(key);
    if (hit && Date.now() - hit.at < (hit.data.length ? 3_600_000 : 60_000)) return hit.data;
    const deadline = AbortSignal.any([signal, AbortSignal.timeout(9000)]);
    let raw: unknown;
    if (path.startsWith("mma/") && bio) raw = await abortable(bio, deadline);
    else {
      const release = await acquire(deadline);
      try {
        deadline.throwIfAborted();
        const url = path.startsWith("tennis/")
          ? `https://sports.core.api.espn.com/v2/sports/tennis/leagues/${path.split("/")[1]}/athletes/${athleteId}/statistics`
          : `${BASE}/${path}/athletes/${athleteId}${path.startsWith("mma/") ? "" : "/stats"}`;
        raw = await abortable(request(url, deadline), deadline);
      } finally {
        release();
      }
    }
    deadline.throwIfAborted();
    const data = path.startsWith("mma/")
      ? parseMmaAthleteCareer(raw, athleteId)
      : path.startsWith("tennis/")
        ? parseCoreAthleteCareer(raw)
        : parseWebAthleteCareer(raw);
    if (cache.size >= 30) cache.delete(cache.keys().next().value!);
    cache.set(key, { at: Date.now(), data });
    return data;
  };
}

export const fetchAthleteCareer = createAthleteCareerClient(async (url, signal) => {
  const { safeFetch } = await import("../safe-fetch");
  const response = await safeFetch(url, { signal });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error("Athlete statistics unavailable");
  return response.json();
});
