// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import { readFileSync } from "node:fs";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import test from "node:test";

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const library = read("src/views/manga/manga-library.tsx");
const row = read("src/views/manga/manga-poster-row.tsx");
const manga = read("src/views/manga.tsx");

test("manga library drops the spotlight hero, its rail, and the section ring", () => {
  assert.doesNotMatch(library, /MangaPosterRow/, "spotlight rail must be gone");
  assert.doesNotMatch(library, /Latest addition/, "spotlight hero copy must be gone");
  assert.doesNotMatch(library, /spotlight/, "spotlight destructure must be gone");
  assert.doesNotMatch(library, /ring-1 ring-edge-soft/, "section ring must be gone");
});

test("manga library anchors favorites and lists sections", () => {
  assert.match(library, /id="manga-favorites"/, "favorites section anchor missing");
  assert.match(library, /id="manga-lists"/, "lists section anchor missing");
});

test("manga library renders the poster grid with swap animation and jump highlight", () => {
  assert.match(library, /FavCell/, "lightweight grid cell missing");
  assert.match(library, /VirtualGrid/, "favorites grid must be virtualized");
  assert.match(library, /animate-media-swap/, "tray swap animation missing");
  assert.match(library, /hset-jumped/, "jump highlight missing");
  assert.match(library, /scrollRef/, "scroll ref wiring missing");
});

test("manga poster row exports the memo button with an optional ring", () => {
  assert.match(row, /export const MemoPosterButton/, "MemoPosterButton must be exported");
  assert.match(row, /ring\?: boolean/, "ring prop must be optional");
});

test("manga view wires the library scroll ref into the screen", () => {
  assert.match(manga, /libraryScrollRef/, "library scroll ref missing");
  assert.match(manga, /scrollRef=\{libraryScrollRef\}/, "scrollRef must be passed to MangaLibrary");
});

test("proxied covers request server-side thumbnails", () => {
  const proxy = read("src/lib/remote-image-proxy.ts");
  assert.match(proxy, /thumbWidthPx/, "proxy must request thumb_width_px");
  assert.match(proxy, /forceProxy/, "proxy must support forced thumbnailing");
  assert.match(proxy, /posterQuality/, "proxy must respect the poster quality setting");
});