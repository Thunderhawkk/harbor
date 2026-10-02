import assert from "node:assert/strict";
import test from "node:test";
import {
  playbackParams,
  playbackPersistenceHarness,
} from "./helpers/playback-persistence-harness.ts";

// The bridge snapshot's position only changes when another field does, so during
// steady playback it stays at the position of the last such change — often the
// opening credits. The exit save must use the live clock instead.
const playing = (p: any) => ({
  ...p,
  snap: { ...p.snap, status: "playing", positionSec: 65, durationSec: 1422 },
});

test("the exit save uses the live clock, not the stale bridge snapshot", () => {
  const h = playbackPersistenceHarness();
  const p = playbackParams();
  h.render(p);
  h.render(playing(p));
  h.clock(900);
  h.tick();
  assert.equal(h.writes.at(-1)?.[1], 900_000);
  // The closing render carries the same stale snapshot position, then unmounts.
  h.render(playing(p));
  h.unmount();
  assert.equal(
    h.writes.at(-1)?.[1],
    900_000,
    "the final save must not freeze at the stale snapshot position",
  );
});

test("the exit save picks up clock movement since the last render", () => {
  const h = playbackPersistenceHarness();
  const p = playbackParams();
  h.render(p);
  h.render(playing(p));
  h.clock(1_200);
  // The closing render happens after the last clock tick and carries the stale
  // snapshot position, then the player unmounts without another tick.
  h.render(playing(p));
  h.unmount();
  assert.equal(h.writes.at(-1)?.[1], 1_200_000);
});

test("a later clock position survives a render carrying an older snapshot", () => {
  const h = playbackPersistenceHarness();
  const p = playbackParams();
  h.render(p);
  h.render(playing(p));
  h.clock(600);
  h.render(playing(p));
  h.clock(1_100);
  h.tick();
  assert.equal(h.writes.at(-1)?.[1], 1_100_000);
});
