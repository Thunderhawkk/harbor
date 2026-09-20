import test from "node:test";
import assert from "node:assert/strict";
import {
  createAthleteCareerClient,
  parseCoreAthleteCareer,
  parseMmaAthleteCareer,
  parseWebAthleteCareer,
} from "../src/lib/sports/athlete-career.ts";

const logo = "https://a.espncdn.com/i/teamlogos/nfl/500/dal.png";
const webStats = () => ({
  teams: { "dallas-cowboys": { id: "6", displayName: "Dallas Cowboys", logos: [{ href: logo }] } },
  categories: [
    {
      name: "passing",
      displayName: "Passing",
      labels: ["GP", "YDS", "CMP%"],
      descriptions: ["Games Played", "Passing Yards", "Completion Percentage"],
      totals: ["139", "35,989", "66.9"],
      statistics: [
        {
          teamId: "6",
          teamSlug: "dallas-cowboys",
          season: { year: 2025 },
          stats: ["17", "4,552", "67.3"],
        },
      ],
    },
  ],
});
const mma = () => ({
  athlete: { id: "5120301", statsSummary: { statistics: [{ displayValue: "17-2-0" }] } },
  events: ["latest", "first", "latest", "future"],
  eventsMap: {
    latest: {
      uid: "latest",
      name: "UFC 328: Chimaev vs. Strickland",
      gameDate: "2026-05-09T21:00:00.000+00:00",
      gameResult: "W",
      opponent: { id: "4917772", displayName: "Tatsuro Taira" },
      status: { displayClock: "1:32", period: 5, result: { displayName: "KO/TKO" } },
    },
    first: {
      uid: "first",
      name: "Fury Fighting Championship 52",
      gameDate: "2021-10-18T00:00:00.000+00:00",
      gameResult: "W",
      opponent: { displayName: "Tony Esquivel" },
      status: { displayClock: "2:14", period: 2, result: { displayName: "TKO (Knees)" } },
    },
    future: {
      uid: "future",
      name: "Upcoming fight",
      gameDate: "2026-09-19T21:00:00Z",
      opponent: { displayName: "Alexandre Pantoja" },
    },
  },
});
const tennis = () => ({
  splits: {
    type: "total",
    categories: [
      {
        name: "general",
        displayName: "General",
        stats: [
          {
            name: "singlesWon",
            displayName: "Singles Won",
            abbreviation: "SW",
            value: 22,
            displayValue: "22",
          },
          {
            name: "singlesLost",
            displayName: "Singles Lost",
            abbreviation: "SL",
            value: 32,
            displayValue: "32",
          },
          {
            name: "singlesTitles",
            displayName: "Singles Titles",
            abbreviation: "ST",
            value: 0,
            displayValue: "0",
          },
        ],
      },
    ],
  },
});

test("web career resolves slug and ID team maps with source logos and preserves actual totals", () => {
  const data = webStats(),
    category = parseWebAthleteCareer(data)[0];
  assert.equal(category.rows[0].team, "Dallas Cowboys");
  assert.equal(category.rows[0].teamLogo, logo);
  assert.deepEqual(category.totals, ["139", "35,989", "66.9"]);
  assert.equal(category.rows[0].season, "2025");
  data.categories[0].statistics[0].teamSlug = "";
  assert.equal(parseWebAthleteCareer(data)[0].rows[0].teamLogo, logo);
  assert.deepEqual(category.rows[0].values, ["17", "4,552", "67.3"]);
});

test("missing team metadata preserves readable source slug; unsafe images and malformed cells are ignored", () => {
  const category = parseWebAthleteCareer({
    teams: { example: { displayName: "Example", logo: "javascript:alert(1)" } },
    categories: [
      {
        displayName: "Scoring",
        labels: ["PTS", "AVG"],
        statistics: [
          {
            season: { displayName: "2025-26" },
            teamSlug: "other-team",
            stats: [0, { invalid: true }],
          },
          { teamSlug: "example", stats: [15] },
        ],
      },
    ],
  })[0];
  assert.equal(category.rows[0].team, "other team");
  assert.deepEqual(category.rows[0].values, ["0", "—"]);
  assert.equal(category.rows[1].teamLogo, undefined);
  assert.deepEqual(category.totals, []);
  assert.deepEqual(parseWebAthleteCareer(null), []);
});

test("MMA uses completed career events, deduplicates and orders for newest-first UI without inventing totals", () => {
  const [category] = parseMmaAthleteCareer(mma(), "5120301");
  assert.equal(category.rowLabel, "Date");
  assert.equal(category.teamLabel, "Opponent");
  assert.equal(category.rows.length, 2);
  assert.equal(category.rows[0].team, "Tony Esquivel");
  assert.equal(category.rows[1].season, "2026-05-09");
  assert.deepEqual(category.rows[1].values, [
    "W",
    "KO/TKO",
    "5",
    "1:32",
    "UFC 328: Chimaev vs. Strickland",
  ]);
  assert.deepEqual(category.totals, []);
  assert.equal(category.rows[1].teamLogo, undefined);
  assert.deepEqual(parseMmaAthleteCareer(mma(), "2560746"), []);
});

test("tennis core parser exposes only verified total splits and preserves zero, with no implied season history", () => {
  const data = tennis(),
    category = parseCoreAthleteCareer(data)[0];
  assert.deepEqual(category.labels, ["SW", "SL", "ST"]);
  assert.deepEqual(category.totals, ["22", "32", "0"]);
  assert.deepEqual(category.rows, []);
  data.splits.type = "season";
  assert.deepEqual(parseCoreAthleteCareer(data), []);
});

test("MMA reuses the already-running common profile and caches the parsed result", async () => {
  let calls = 0;
  const client = createAthleteCareerClient(async () => {
    calls++;
    return null;
  });
  const first = await client(
    "mma/ufc",
    "5120301",
    new AbortController().signal,
    Promise.resolve(mma()),
  );
  const second = await client("mma/ufc", "5120301", new AbortController().signal);
  assert.equal(calls, 0);
  assert.equal(first, second);
  assert.equal(first[0].rows.length, 2);
});

test("tennis requests its verified core totals; unsupported responses are empty while transient errors stay retryable", async () => {
  let calls = 0;
  const urls: string[] = [];
  const client = createAthleteCareerClient(async (url) => {
    urls.push(url);
    calls++;
    if (calls === 1) throw new Error("503");
    return tennis();
  });
  await assert.rejects(client("tennis/atp", "11685", new AbortController().signal), /503/);
  const data = await client("tennis/atp", "11685", new AbortController().signal);
  assert.equal(data[0].totals[0], "22");
  assert.equal(calls, 2);
  assert.ok(
    urls.every(
      (url) =>
        url ===
        "https://sports.core.api.espn.com/v2/sports/tennis/leagues/atp/athletes/11685/statistics",
    ),
  );
  const unsupported = createAthleteCareerClient(async () => null);
  assert.deepEqual(await unsupported("rugby/164205", "123", new AbortController().signal), []);
});

test("requests are capped at three; cancelled queued profiles never start a fetch", async () => {
  let calls = 0,
    active = 0,
    peak = 0;
  const resolvers: (() => void)[] = [];
  const client = createAthleteCareerClient(async () => {
    calls++;
    active++;
    peak = Math.max(peak, active);
    await new Promise<void>((resolve) => resolvers.push(resolve));
    active--;
    return webStats();
  });
  const controllers = Array.from({ length: 5 }, () => new AbortController());
  const promises = controllers.map((controller, i) =>
    client("football/nfl", String(i + 1), controller.signal),
  );
  const settled = Promise.allSettled(promises);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(calls, 3);
  controllers[3].abort();
  resolvers.splice(0).forEach((resolve) => resolve());
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(calls, 4);
  resolvers.splice(0).forEach((resolve) => resolve());
  const outcomes = await settled;
  assert.equal(outcomes[3].status, "rejected");
  assert.equal(outcomes.filter((result) => result.status === "fulfilled").length, 4);
  assert.equal(peak, 3);
});

test("malformed paths and cancelled consumers never trigger requests", async () => {
  let calls = 0;
  const client = createAthleteCareerClient(async () => {
    calls++;
    return null;
  });
  const c = new AbortController();
  assert.deepEqual(await client("tennis/../../private", "12", c.signal), []);
  assert.deepEqual(await client("football/nfl", "../12", c.signal), []);
  c.abort();
  await assert.rejects(client("football/nfl", "12", c.signal), { name: "AbortError" });
  assert.equal(calls, 0);
});
