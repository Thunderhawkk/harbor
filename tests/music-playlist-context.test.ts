import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  getMusicPlaybackOrigin,
  musicTitleTarget,
  recordMusicPlaylistPlayback,
  setMusicPlaybackOrigin,
} from "../src/lib/music/playback-origin.ts";

const src = (path: string) =>
  readFileSync(fileURLToPath(new URL(`../src/${path}`, import.meta.url)), "utf8");
const dock = src("components/music/music-dock.tsx");
const libraryParts = src("components/music/music-library-parts.tsx");

test("a playlist origin sends the dock title back to that playlist", () => {
  assert.deepEqual(musicTitleTarget({ kind: "playlist", id: "pl-42", name: "Late night" }), {
    kind: "playlist",
    playlistId: "pl-42",
  });
});

test("no origin sends the dock title to the album", () => {
  assert.deepEqual(musicTitleTarget(null), { kind: "album" });
});

test("an origin with no usable id falls back to the album rather than opening nothing", () => {
  assert.deepEqual(musicTitleTarget({ kind: "playlist", id: "", name: "Broken" }), {
    kind: "album",
  });
});

test("origin is recorded when playback starts inside a playlist", () => {
  setMusicPlaybackOrigin(null);
  recordMusicPlaylistPlayback({ id: "pl-7", name: "Drive" });
  assert.deepEqual(getMusicPlaybackOrigin(), { kind: "playlist", id: "pl-7", name: "Drive" });
  assert.deepEqual(musicTitleTarget(getMusicPlaybackOrigin()), {
    kind: "playlist",
    playlistId: "pl-7",
  });
});

test("origin is cleared when playback starts from something that is not a playlist", () => {
  setMusicPlaybackOrigin({ kind: "playlist", id: "pl-7", name: "Drive" });
  recordMusicPlaylistPlayback(null);
  assert.equal(getMusicPlaybackOrigin(), null);
  assert.deepEqual(musicTitleTarget(getMusicPlaybackOrigin()), { kind: "album" });
  setMusicPlaybackOrigin({ kind: "playlist", id: "pl-7", name: "Drive" });
  recordMusicPlaylistPlayback(undefined);
  assert.equal(getMusicPlaybackOrigin(), null);
});

test("the dock title decides through the shared helper, not its own inline branch", () => {
  assert.ok(
    dock.includes("musicTitleTarget(getMusicPlaybackOrigin())"),
    "music-dock.tsx must route the title click through musicTitleTarget",
  );
  assert.ok(
    dock.includes("requestMusicPlaylist(target.playlistId, display.id)"),
    "playlist targets must still open the playlist at the track",
  );
});

test("the dock never hands an unresolved artist ref to the explore request", () => {
  const offenders = dock
    .split("\n")
    .map((line, index) => ({ line: line.trim(), index }))
    .filter((entry) => entry.line.includes("primaryArtist"));
  assert.deepEqual(
    offenders.map((entry) => `${entry.index + 1}: ${entry.line}`),
    [],
    "dock artist navigation must fall through to goToArtist/resolveArtist, not shortcut past the authority",
  );
});

test("every library playback path records or clears the origin", () => {
  assert.ok(
    !libraryParts.includes("setMusicPlaybackOrigin"),
    "library parts must go through recordMusicPlaylistPlayback",
  );
  assert.ok(
    !libraryParts.includes("?? openSourcePicker"),
    "no library play path may start playback with a stale origin",
  );
  assert.equal((libraryParts.match(/recordMusicPlaylistPlayback\(/g) ?? []).length, 3);
});
