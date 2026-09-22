import assert from "node:assert/strict";
import test from "node:test";
import { nowPlayingMatches, parseNowPlayingKey } from "../src/lib/music/now-playing-key";

test("the key carries identity and phase and nothing that ticks", () => {
  assert.deepEqual(parseNowPlayingKey("spotify t1 playing"), {
    id: "t1",
    connectorId: "spotify",
    phase: "playing",
  });
  assert.deepEqual(parseNowPlayingKey(" t1 paused"), {
    id: "t1",
    connectorId: null,
    phase: "paused",
  });
  assert.deepEqual(parseNowPlayingKey("  idle"), { id: null, connectorId: null, phase: "idle" });
});

test("a row only lights up for the track actually playing", () => {
  const now = parseNowPlayingKey("spotify t1 playing");
  assert.equal(nowPlayingMatches(now, { id: "t1", connectorId: "spotify" }), true);
  assert.equal(nowPlayingMatches(now, { id: "t1", connectorId: "deezer" }), false);
  assert.equal(nowPlayingMatches(now, { id: "t2", connectorId: "spotify" }), false);
  assert.equal(nowPlayingMatches(now, null), false);
});

test("a local track with no connector still matches itself", () => {
  const now = parseNowPlayingKey(" local-file.flac playing");
  assert.equal(nowPlayingMatches(now, { id: "local-file.flac" }), true);
  assert.equal(nowPlayingMatches(now, { id: "local-file.flac", connectorId: null }), true);
});

test("nothing playing lights nothing", () => {
  const now = parseNowPlayingKey("  idle");
  assert.equal(nowPlayingMatches(now, { id: "t1", connectorId: "spotify" }), false);
});
