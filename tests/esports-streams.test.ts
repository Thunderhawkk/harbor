import test from "node:test";
import assert from "node:assert/strict";
import {
  esportsChatPopoutUrl,
  esportsEmbedUrl,
  esportsExternalUrl,
  officialBroadcastSource,
} from "../src/lib/sports/esports-streams.ts";

test("Kick chat popout stays tied to the selected validated channel", () => {
  const stream = { title: "Fiesta", url: "https://kick.com/fiesta_cs", platform: "kick" as const };
  assert.equal(esportsChatPopoutUrl(stream), "https://kick.com/popout/fiesta_cs/chat");
  assert.equal(
    esportsChatPopoutUrl({ ...stream, url: "https://kick.com.evil.test/fiesta_cs" }),
    null,
  );
  assert.equal(esportsChatPopoutUrl({ ...stream, url: "https://kick.com/fiesta_cs/other" }), null);
});

test("match-listed Kick channels embed without redirecting to a generic Twitch channel", () => {
  const stream = {
    title: "fiesta_cs",
    url: "https://kick.com/fiesta_cs",
    platform: "kick" as const,
  };
  assert.equal(
    esportsEmbedUrl(stream, "localhost"),
    "https://player.kick.com/fiesta_cs?autoplay=false",
  );
  assert.equal(officialBroadcastSource(stream)?.isLive, true);
  assert.equal(
    esportsEmbedUrl({ ...stream, url: "https://kick.com.evil.test/fiesta_cs" }, "localhost"),
    null,
  );
});

test("official broadcasts enter the persistent live dock with provider identity", () => {
  const stream = { title: "ESL", url: "https://www.twitch.tv/eslcs", platform: "twitch" as const };
  const source = officialBroadcastSource(stream)!;
  assert.equal(source.sportsDocked, true);
  assert.equal(source.isLive, true);
  assert.ok(source.meta.id.startsWith("iptv:"));
  assert.deepEqual(source.officialBroadcast, stream);
  assert.equal(officialBroadcastSource({ ...stream, url: "javascript:alert(1)" }), null);
});

test("official Twitch embeds use current host and never autoplay", () => {
  const value = new URL(
    esportsEmbedUrl(
      { title: "Riot", url: "https://www.twitch.tv/riotgames", platform: "twitch" },
      "127.0.0.1",
    )!,
  );
  assert.equal(value.hostname, "player.twitch.tv");
  assert.equal(value.searchParams.get("parent"), "127.0.0.1");
  assert.equal(value.searchParams.get("channel"), "riotgames");
  assert.equal(value.searchParams.get("autoplay"), "false");
});
test("YouTube videos embed, channel directories remain direct links", () => {
  const url = esportsEmbedUrl(
    { title: "Video", url: "https://www.youtube.com/watch?v=abcdefghijk", platform: "youtube" },
    "localhost",
  );
  assert(url?.startsWith("https://www.youtube-nocookie.com/embed/abcdefghijk"));
  assert.equal(
    esportsEmbedUrl(
      { title: "Channel", url: "https://www.youtube.com/@valorantesports", platform: "youtube" },
      "localhost",
    ),
    null,
  );
  assert.equal(
    esportsEmbedUrl(
      { title: "VOD", url: "https://www.twitch.tv/videos/123", platform: "twitch" },
      "localhost",
    ),
    null,
  );
});
test("untrusted stream URLs cannot become embedded content", () => {
  for (const url of [
    "javascript:alert(1)",
    "https://twitch.tv.evil.test/riotgames",
    "http://twitch.tv/riotgames",
    "https://www.twitch.tv/riotgames/other",
  ])
    assert.equal(esportsEmbedUrl({ title: "Unsafe", url, platform: "twitch" }, "localhost"), null);
  assert.equal(esportsExternalUrl("https://name:password@example.com"), null);
  assert.equal(esportsExternalUrl("file:///tmp/test"), null);
});
