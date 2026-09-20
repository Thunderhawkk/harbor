import assert from "node:assert/strict";
import test from "node:test";
import {
  LISTEN_ROOM_LENGTH,
  generateListenRoomCode,
  isListenRoomCode,
  isWatchRoomCode,
  listenRoomIsComplete,
  normalizeListenRoomCode,
} from "../src/lib/listen-together/room";
import {
  listenStateFromTrack,
  listenStateMatchesTrack,
  listenTrackFromState,
  packListenMediaId,
  packListenTitle,
  unpackListenMediaId,
  unpackListenTitle,
} from "../src/lib/listen-together/track-state";
import {
  LISTEN_DRIFT_SECONDS,
  listenActionFor,
  listenShouldPublish,
} from "../src/lib/listen-together/session";
import { ROOM_CODE_LENGTH, generateRoomCode } from "../src/lib/together/protocol";

test("a listen code can never be mistaken for a watch code, or the reverse", () => {
  for (let i = 0; i < 200; i += 1) {
    const listen = generateListenRoomCode();
    const watch = generateRoomCode();
    assert.equal(isListenRoomCode(listen), true, listen);
    assert.equal(isWatchRoomCode(listen), false, listen);
    assert.equal(isListenRoomCode(watch), false, watch);
    assert.equal(isWatchRoomCode(watch), true, watch);
    assert.notEqual(listen, watch);
  }
});

test("listen codes stay inside what the relay will route", () => {
  // worker.js: ALLOWED_PATH = /^\/r\/([A-Z0-9]{4,8})$/
  const code = generateListenRoomCode();
  assert.equal(code.length, LISTEN_ROOM_LENGTH);
  assert.ok(code.length >= 4 && code.length <= 8);
  assert.match(code, /^[A-Z0-9]+$/);
  assert.ok(LISTEN_ROOM_LENGTH > ROOM_CODE_LENGTH);
});

test("typing a code by hand lands on the same room however it is written", () => {
  assert.equal(normalizeListenRoomCode("lt k4m2 x9"), "LTK4M2X9");
  assert.equal(normalizeListenRoomCode("LTK4M2X9"), "LTK4M2X9");
  assert.equal(normalizeListenRoomCode("k4m2x9"), "LTK4M2X9");
  assert.equal(normalizeListenRoomCode("LTK4M2X9EXTRA"), "LTK4M2X9");
  assert.equal(listenRoomIsComplete("k4m2x9"), true);
  assert.equal(listenRoomIsComplete("k4m2"), false);
});

test("a track identity survives the round trip through one relay field", () => {
  for (const track of [
    { id: "4x7abc", connectorId: "spotify" },
    { id: "id with spaces", connectorId: "youtube_music" },
    { id: "local/path/to file.flac", connectorId: null },
    { id: "colon:in:id", connectorId: "deezer" },
  ]) {
    const packed = packListenMediaId(track);
    assert.deepEqual(unpackListenMediaId(packed), { id: track.id, connectorId: track.connectorId });
  }
});

test("titles and artists with separators in them survive intact", () => {
  for (const [title, artist] of [
    ["You the One", "YoungBoy Never Broke Again"],
    ["Song / With / Slashes", "A, B & C"],
    ['quote" and \\ backslash', "artist"],
    ["", ""],
  ]) {
    const packed = packListenTitle(title, artist);
    assert.deepEqual(unpackListenTitle(packed), { title, artist });
  }
});

test("a plain string title still shows rather than vanishing", () => {
  assert.deepEqual(unpackListenTitle("Just A Title"), { title: "Just A Title", artist: "" });
  assert.deepEqual(unpackListenTitle(null), { title: "", artist: "" });
});

test("a published state carries what the relay validates and no episode", () => {
  const track = {
    id: "t1",
    connectorId: "spotify",
    title: "You the One",
    artist: "YB",
    artwork: "art.jpg",
  };
  const state = listenStateFromTrack(
    track as never,
    42.5,
    true,
    "client-a",
    "client-a",
    1_700_000_000_000,
  );
  assert.equal(state.episode, null);
  assert.equal(state.playing, true);
  assert.equal(state.positionSeconds, 42.5);
  assert.equal(state.posterUrl, "art.jpg");
  assert.equal(state.updatedBy, "client-a");
  assert.equal(typeof state.mediaId, "string");
  assert.equal(typeof state.mediaTitle, "string");
  assert.equal(typeof state.updatedAt, "number");
});

test("a nonsense position never reaches the relay, which would reject the whole state", () => {
  const track = { id: "t1", connectorId: null, title: "x", artist: "y", artwork: null };
  for (const bad of [Number.NaN, -5, Number.POSITIVE_INFINITY]) {
    const state = listenStateFromTrack(track as never, bad, false, "c", null, 1);
    assert.ok(Number.isFinite(state.positionSeconds) && state.positionSeconds >= 0, String(bad));
  }
});

test("the room tells you which track is playing, and which is not", () => {
  const track = { id: "t1", connectorId: "spotify", title: "A", artist: "B", artwork: null };
  const state = listenStateFromTrack(track as never, 1, true, "c", null, 1);
  assert.deepEqual(listenTrackFromState(state), {
    id: "t1",
    connectorId: "spotify",
    title: "A",
    artist: "B",
    artwork: null,
  });
  assert.equal(listenStateMatchesTrack(state, track), true);
  assert.equal(listenStateMatchesTrack(state, { id: "t1", connectorId: "deezer" }), false);
  assert.equal(listenStateMatchesTrack(state, { id: "t2", connectorId: "spotify" }), false);
  assert.equal(listenStateMatchesTrack(null, track), false);
  assert.equal(listenStateMatchesTrack(state, null), false);
});

const HOST_TRACK = { id: "t1", connectorId: "spotify", title: "A", artist: "B", artwork: null };

function hostState(overrides: Partial<ReturnType<typeof listenStateFromTrack>> = {}) {
  return {
    ...listenStateFromTrack(HOST_TRACK as never, 30, true, "host", "host", 1),
    ...overrides,
  };
}

test("a guest on a different track is told to load the host's one", () => {
  const action = listenActionFor(hostState(), {
    track: { id: "other", connectorId: "spotify" },
    positionSeconds: 0,
    playing: false,
  });
  assert.equal(action.kind, "load");
  if (action.kind === "load") {
    assert.equal(action.track.id, "t1");
    assert.equal(action.positionSeconds, 30);
    assert.equal(action.playing, true);
  }
});

test("a guest with nothing playing is told to load", () => {
  assert.equal(
    listenActionFor(hostState(), { track: null, positionSeconds: 0, playing: false }).kind,
    "load",
  );
});

test("small drift is left alone so nobody is nudged every tick", () => {
  const local = {
    track: HOST_TRACK,
    positionSeconds: 30 + LISTEN_DRIFT_SECONDS - 0.1,
    playing: true,
  };
  assert.equal(listenActionFor(hostState(), local).kind, "none");
});

test("real drift is corrected", () => {
  const local = {
    track: HOST_TRACK,
    positionSeconds: 30 + LISTEN_DRIFT_SECONDS + 5,
    playing: true,
  };
  const action = listenActionFor(hostState(), local);
  assert.equal(action.kind, "seek");
  if (action.kind === "seek") assert.equal(action.positionSeconds, 30);
});

test("play and pause follow the host once the track and position already agree", () => {
  assert.equal(
    listenActionFor(hostState(), { track: HOST_TRACK, positionSeconds: 30, playing: false }).kind,
    "play",
  );
  assert.equal(
    listenActionFor(hostState({ playing: false }), {
      track: HOST_TRACK,
      positionSeconds: 30,
      playing: true,
    }).kind,
    "pause",
  );
  assert.equal(
    listenActionFor(hostState(), { track: HOST_TRACK, positionSeconds: 30, playing: true }).kind,
    "none",
  );
});

test("no room state means the local player is left entirely alone", () => {
  assert.equal(
    listenActionFor(null, { track: HOST_TRACK, positionSeconds: 5, playing: true }).kind,
    "none",
  );
});

test("a host publishes on real changes and stays quiet while a song simply plays", () => {
  const first = hostState();
  assert.equal(listenShouldPublish(null, first), true);
  assert.equal(listenShouldPublish(first, { ...first, positionSeconds: 31 }), false);
  assert.equal(
    listenShouldPublish(first, { ...first, positionSeconds: 30 + LISTEN_DRIFT_SECONDS + 1 }),
    true,
  );
  assert.equal(listenShouldPublish(first, { ...first, playing: false }), true);
  const other = listenStateFromTrack(
    { ...HOST_TRACK, id: "t2" } as never,
    30,
    true,
    "host",
    "host",
    2,
  );
  assert.equal(listenShouldPublish(first, other), true);
});
