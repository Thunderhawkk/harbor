import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import test from "node:test";
import ts from "typescript";

function harness(remoteItem: unknown) {
  const data = new Map<string, string>();
  data.set(
    "harbor.profiles.v1",
    JSON.stringify({ profiles: [{ id: "a", isPrimary: true }], activeId: "a" }),
  );
  // Shared CW mode keeps the cloud lookup enabled; a private profile skips it.
  data.set("harbor.settings.shared", JSON.stringify({ cwPerProfile: false }));
  const storage = {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => data.set(k, v),
    removeItem: (k: string) => data.delete(k),
  };
  const window = { addEventListener: () => {} };
  let remoteReads = 0;
  const cache = new Map<string, any>();
  const load = (path: string): any => {
    const full = resolve(path);
    if (cache.has(full)) return cache.get(full);
    const exports = {} as any;
    cache.set(full, exports);
    const compiled = ts.transpileModule(readFileSync(full, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    new Function("require", "exports", "localStorage", "window", compiled)(
      (name: string) => {
        if (name === "react") return { useSyncExternalStore: () => 0 };
        if (name.endsWith("/stremio"))
          return {
            episodeFromVideoId: (id: string) => {
              const p = id?.split(":");
              return p?.length === 3 ? { season: +p[1], episode: +p[2] } : null;
            },
            libraryGetOne: async () => {
              remoteReads++;
              return remoteItem;
            },
          };
        return load(
          name.startsWith("@/") ? `src/${name.slice(2)}.ts` : resolve(dirname(full), `${name}.ts`),
        );
      },
      exports,
      storage,
      window,
    );
    return exports;
  };
  return {
    data,
    load,
    get remoteReads() {
      return remoteReads;
    },
  };
}

const now = Date.now();
const iso = (offset = 0) => new Date(now + offset).toISOString();
// The cloud pause is an hour old so the freshly written local entry is newer.
const remoteItem = (state: Record<string, unknown>) => ({
  _id: "tt100",
  type: "series",
  name: "Fixture",
  removed: false,
  temp: false,
  _ctime: iso(-3600_000),
  _mtime: iso(-3600_000),
  state: { season: 1, episode: 1, video_id: "tt100:1:1", duration: 1_800_000, ...state },
});
const identity = { metaId: "tt100", authKey: "fixture", imdbId: "tt100", imdbVerified: true };
const args = { ...identity, season: 1, episode: 1, openingVid: "tt100:1:1" };

test("a stale cloud watched flag does not restart an episode with newer mid-episode progress", async () => {
  const h = harness(remoteItem({ timeOffset: 300_000, flaggedWatched: 1 }));
  h.load("src/lib/resume.ts").saveResumeMs("tt100", 600_000, 1, 1, 1);
  const out = await h.load("src/lib/player/resume-start.ts").resolveStartMs(args);
  assert.equal(out.finished, false, "the card's mid-episode progress must win over the flag");
  assert.equal(out.ms, 600_000);
  assert.equal(out.fromRemote, false);
});

test("a cloud watched flag ahead of a mid-episode local entry still reports not finished", async () => {
  const h = harness(remoteItem({ timeOffset: 900_000, flaggedWatched: 1 }));
  h.load("src/lib/resume.ts").saveResumeMs("tt100", 600_000, 1, 1, 1);
  const out = await h.load("src/lib/player/resume-start.ts").resolveStartMs(args);
  assert.equal(out.finished, false);
  assert.equal(out.ms, 900_000);
});

test("a finished episode without local progress still restarts from the top", async () => {
  const h = harness(remoteItem({ timeOffset: 1_500_000, flaggedWatched: 1 }));
  const out = await h.load("src/lib/player/resume-start.ts").resolveStartMs(args);
  assert.equal(out.finished, true);
});

test("local progress near the end keeps the existing restart behaviour", async () => {
  const h = harness(remoteItem({ timeOffset: 300_000, flaggedWatched: 1 }));
  h.load("src/lib/resume.ts").saveResumeMs("tt100", 1_620_000, 1, 1, 1);
  const out = await h.load("src/lib/player/resume-start.ts").resolveStartMs(args);
  assert.equal(out.finished, true);
});
