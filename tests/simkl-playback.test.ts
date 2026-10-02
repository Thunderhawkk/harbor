// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import { readFileSync } from "node:fs";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import test from "node:test";
import ts from "typescript";

function playback(sessions: unknown[], anizip: Record<string, unknown> = {}) {
  const writes: unknown[][] = [];
  const source = readFileSync(new URL("../src/lib/simkl/playback.ts", import.meta.url), "utf8");
  const mocks: Record<string, unknown> = {
    "./session": { getSession: () => ({}) },
    "./client": { simklRequest: async () => sessions },
    "@/lib/cw-dismiss": { isCwDismissed: () => false },
    "@/lib/resume": {
      readResumeEntry: () => undefined,
      saveResumeMs: (...args: unknown[]) => writes.push(args),
    },
    "@/lib/providers/anizip": {
      aniZipByMal: async () => anizip.mal ?? null,
      aniZipByKitsu: async () => anizip.kitsu ?? null,
      aniZipByAnilist: async () => anizip.anilist ?? null,
      aniZipByAnidb: async () => anizip.anidb ?? null,
    },
  };
  const module = { exports: {} };
  const output = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  new Function("require", "module", "exports", output)(
    (name: string) => {
      assert.ok(Object.hasOwn(mocks, name), `Unexpected dependency: ${name}`);
      return mocks[name];
    },
    module,
    module.exports,
  );
  return { api: module.exports as typeof import("../src/lib/simkl/playback"), writes };
}

test("Simkl paused episodes retain timestamp, episode identity and resume progress", async () => {
  // Simkl's response example uses episode.episode; its item guide uses number.
  const pausedAt = "2026-09-29T10:30:00.000Z";
  const h = playback([
    {
      progress: 45.5,
      paused_at: pausedAt,
      show: { title: "Fixture show", ids: { imdb: "tt1234567" } },
      episode: { season: 1, episode: 5 },
    },
    {
      progress: 20,
      paused_at: pausedAt,
      show: { title: "Fixture show", ids: { imdb: "tt1234567" } },
      episode: { season: 1, number: 6 },
    },
  ]);
  const items = await h.api.fetchSimklPlaybackItems();
  assert.equal(items.length, 2, "distinct episodes must not collapse into one session");
  assert.deepEqual(items.map((item) => item.state?.video_id), ["tt1234567:1:5", "tt1234567:1:6"]);
  assert.equal(items[0].state?.lastWatched, pausedAt);
  assert.equal(items[0]._mtime, pausedAt);
  assert.equal(items[0].state?.timeOffset, 1_201_200);
  assert.deepEqual(h.writes[0], ["tt1234567", 1_201_200, 1, 5, undefined, 0.455, "simkl"]);
});

test("Simkl prefers paused_at while retaining legacy watched_at compatibility", async () => {
  const pausedAt = "2026-09-29T10:30:00.000Z";
  const watchedAt = "2026-09-28T10:30:00.000Z";
  const h = playback([
    { progress: 25, paused_at: pausedAt, watched_at: watchedAt, movie: { ids: { imdb: "tt1234567" } } },
    { progress: 30, watched_at: watchedAt, movie: { ids: { imdb: "tt2345678" } } },
  ]);
  const items = await h.api.fetchSimklPlaybackItems();
  assert.deepEqual(items.map((item) => item.state?.lastWatched), [pausedAt, watchedAt]);
});

test("Simkl still excludes unstarted and finished sessions", async () => {
  const h = playback([0, 45, 99, 100].map((progress, index) => ({
    progress,
    paused_at: "2026-09-29T10:30:00.000Z",
    movie: { ids: { imdb: `tt123456${index}` } },
  })));
  const items = await h.api.fetchSimklPlaybackItems();
  assert.deepEqual(items.map((item) => item._id), ["tt1234561"]);
  assert.equal(h.writes.length, 1);
});

test("Simkl remaps an anime cour's entry-relative episode to the provider season", async () => {
  // Mashle-style split cour: the anime entry is "2nd Season" numbered from 1,
  // while its IMDb id names the umbrella series.
  const h = playback(
    [
      {
        progress: 45.5,
        paused_at: "2026-09-29T10:30:00.000Z",
        anime: { title: "Mashle 2nd Season", ids: { imdb: "tt1234567", mal: 51715 } },
        episode: { season: 1, number: 6 },
      },
    ],
    { mal: { episodes: { 6: { seasonNumber: 2, episodeNumber: 6 } } } },
  );
  const items = await h.api.fetchSimklPlaybackItems();
  assert.equal(items.length, 1);
  assert.equal(items[0]._id, "tt1234567");
  assert.equal(items[0].isAnime, true);
  assert.equal(items[0].state?.season, 2);
  assert.equal(items[0].state?.episode, 6);
  assert.deepEqual(items[0].state?.video_id, "tt1234567:2:6");
  assert.deepEqual(h.writes[0], ["tt1234567", 1_201_200, 2, 6, undefined, 0.455, "simkl"]);
});

test("Simkl keeps raw coords when the anime entry cannot be resolved to a cour", async () => {
  const h = playback([
    {
      progress: 30,
      paused_at: "2026-09-29T10:30:00.000Z",
      anime: { title: "Fixture anime", ids: { imdb: "tt1234567", mal: 51715 } },
      episode: { season: 1, number: 6 },
    },
  ]);
  const items = await h.api.fetchSimklPlaybackItems();
  assert.deepEqual(items[0].state?.video_id, "tt1234567:1:6");
});

test("Simkl keeps the anime-native id and entry-relative coords for a mal-only node", async () => {
  const h = playback([
    {
      progress: 30,
      paused_at: "2026-09-29T10:30:00.000Z",
      anime: { title: "Fixture anime", ids: { mal: 51715 } },
      episode: { season: 1, number: 6 },
    },
  ]);
  const items = await h.api.fetchSimklPlaybackItems();
  assert.equal(items[0]._id, "mal:51715");
  assert.equal(items[0].isAnime, true);
  assert.deepEqual(items[0].state?.video_id, "mal:51715:1:6");
});
