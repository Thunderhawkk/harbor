import { PluginError, type StreamPluginFormat, type StreamRepoEntry } from "./types";

export type ParsedStreamRepo = {
  name: string;
  homepage?: string;
  format: StreamPluginFormat;
  entries: StreamRepoEntry[];
};

export function splitRepoLinks(text: string): string[] {
  const out: string[] = [];
  for (const part of text.split(/[\s,]+/)) {
    const v = part.trim();
    if (v && !out.includes(v)) out.push(v);
  }
  return out;
}

function rewriteGithub(u: URL): URL {
  if (u.hostname.toLowerCase() !== "github.com") return u;
  const seg = u.pathname.split("/").filter(Boolean);
  if (seg.length < 2) return u;
  const [user, repo] = seg;
  const repoName = repo.replace(/\.git$/, "");
  const raw = new URL("https://raw.githubusercontent.com/");
  if (seg.length >= 4 && (seg[2] === "tree" || seg[2] === "blob")) {
    raw.pathname = `/${user}/${repoName}/${seg[3]}/${seg.slice(4).join("/")}`;
  } else {
    raw.pathname = `/${user}/${repoName}/HEAD/${seg.slice(2).join("/")}`;
  }
  raw.search = u.search;
  return raw;
}

export function normalizeRepoUrl(raw: string): string {
  let text = raw.trim();
  if (!text) throw new PluginError("only-https");
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) text = "https://" + text;
  let u: URL;
  try {
    u = new URL(text);
  } catch {
    throw new PluginError("only-https");
  }
  if (u.protocol !== "https:") throw new PluginError("only-https");
  u = rewriteGithub(u);
  u.hash = "";
  if (!/\.json$/i.test(u.pathname)) {
    u.pathname = u.pathname.replace(/\/+$/, "") + "/manifest.json";
  }
  return u.href;
}

export function repoBaseUrl(manifestUrl: string): string {
  return manifestUrl.replace(/[^/]*$/, "");
}

export function repoDisplayName(url: string): string {
  try {
    const u = new URL(url);
    const seg = u.pathname.split("/").filter(Boolean);
    const host = u.hostname.toLowerCase();
    if ((host.endsWith("githubusercontent.com") || host === "github.com" || host.endsWith("gitlab.com")) && seg.length >= 2) {
      return `${seg[0]}/${seg[1].replace(/\.git$/, "")}`;
    }
    return host.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function repoTitle(name: string | null | undefined, url: string): string {
  const n = (name ?? "").trim();
  return n && n !== "Repository" ? n : repoDisplayName(url);
}

export function repoKey(url: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < url.length; i++) {
    h ^= url.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

export function pluginIdFor(repoUrl: string, entryId: string): string {
  return `plugin:${repoKey(repoUrl)}.${entryId}`;
}

function str(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v.trim() : fallback;
}

function strList(v: unknown): string[] {
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === "string" && !!x.trim());
  if (typeof v === "string" && v.trim()) return [v.trim()];
  return [];
}

function normalizeType(t: string): string | null {
  const v = t.toLowerCase();
  if (v === "movie" || v === "movies" || v === "film") return "movie";
  if (v === "tv" || v === "series" || v === "show" || v === "shows" || v === "other") return "series";
  return null;
}

function typesOf(v: unknown): string[] {
  const out = new Set<string>();
  for (const t of strList(v)) {
    const n = normalizeType(t);
    if (n) out.add(n);
  }
  return out.size ? [...out] : ["movie", "series"];
}

function entryUrl(file: string, manifestUrl: string): string | null {
  try {
    return new URL(file, manifestUrl).href;
  } catch {
    return null;
  }
}

function harborEntry(v: unknown, manifestUrl: string): StreamRepoEntry | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const id = str(o.id);
  const name = str(o.name);
  const file = str(o.entry);
  const entry = file ? entryUrl(file, manifestUrl) : null;
  if (!id || !name || !entry) return null;
  const idPrefixes = strList(o.idPrefixes);
  return {
    id,
    name,
    version: str(o.version, "0") || "0",
    entry,
    sha256: /^[0-9a-f]{64}$/i.test(str(o.sha256)) ? str(o.sha256).toLowerCase() : undefined,
    icon: str(o.icon) || undefined,
    description: str(o.description) || undefined,
    author: str(o.author) || undefined,
    lang: strList(o.lang),
    types: typesOf(o.types),
    idPrefixes: idPrefixes.length ? idPrefixes : ["tt", "tmdb:"],
    hosts: strList(o.hosts).map((h) => h.toLowerCase()),
    settings: o.settings === true,
    nsfw: o.nsfw === true,
    enabled: o.enabled !== false,
    platforms: strList(o.platforms).length ? strList(o.platforms) : undefined,
    minHarbor: str(o.minHarbor) || undefined,
    timeoutMs: typeof o.timeoutMs === "number" && o.timeoutMs > 0 ? Math.min(o.timeoutMs, 60_000) : undefined,
    format: "harbor",
  };
}

function providerNote(o: Record<string, unknown>): string | undefined {
  const bits: string[] = [];
  const formats = strList(o.formats).length ? strList(o.formats) : strList(o.supportedFormats);
  if (formats.length) bits.push(formats.join(", "));
  if (o.limited === true) bits.push("limited");
  const notes = str(o.notes);
  if (notes) bits.push(notes);
  return bits.length ? bits.join(" · ") : undefined;
}

function providerEntry(v: unknown, manifestUrl: string): StreamRepoEntry | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const id = str(o.id) || str(o.filename).replace(/\.[a-z0-9]+$/i, "");
  const name = str(o.name) || id;
  const file = str(o.filename);
  const entry = file ? entryUrl(file, manifestUrl) : null;
  if (!id || !entry) return null;
  return {
    id,
    name,
    version: str(o.version, "0") || "0",
    entry,
    icon: str(o.logo) || str(o.icon) || undefined,
    description: str(o.description) || undefined,
    author: str(o.author) || undefined,
    lang: strList(o.contentLanguage),
    types: typesOf(o.supportedTypes),
    idPrefixes: ["tt", "tmdb:"],
    hosts: [],
    settings: o.hasSettings === true,
    nsfw: o.nsfw === true || o.adult === true,
    enabled: o.enabled !== false,
    platforms: strList(o.supportedPlatforms).length ? strList(o.supportedPlatforms) : undefined,
    format: "provider-script",
    note: providerNote(o),
  };
}

function looksLikeMangaRepo(json: Record<string, unknown>, parsed: unknown): boolean {
  if (str(json.type) === "manga" || str(json.type) === "ebook") return true;
  const arr = Array.isArray(parsed)
    ? parsed
    : Array.isArray(json.sources)
      ? json.sources
      : Array.isArray(json.mangayomiSources)
        ? json.mangayomiSources
        : null;
  if (!arr) return false;
  return arr.some(
    (e) =>
      e &&
      typeof e === "object" &&
      ("sourceCodeUrl" in e || "pkgPath" in e || ("apk" in e && "pkg" in e) || "contentRating" in e),
  );
}

export function parseStreamRepoManifest(parsed: unknown, manifestUrl: string): ParsedStreamRepo {
  const json = (parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {}) as Record<
    string,
    unknown
  >;
  const scrapers = Array.isArray(json.scrapers)
    ? json.scrapers
    : Array.isArray(parsed) && parsed.some((e) => e && typeof e === "object" && "filename" in e)
      ? parsed
      : null;
  if (scrapers) {
    const entries = scrapers.map((s) => providerEntry(s, manifestUrl)).filter((e): e is StreamRepoEntry => !!e);
    return {
      name: repoTitle(str(json.name), manifestUrl),
      homepage: str(json.homepage) || undefined,
      format: "provider-script",
      entries,
    };
  }
  if (Array.isArray(json.plugins)) {
    const type = str(json.type);
    if (type && type !== "stream") throw new PluginError(type === "ebook" ? "ebook-repo" : "manga-repo");
    const entries = json.plugins.map((p) => harborEntry(p, manifestUrl)).filter((e): e is StreamRepoEntry => !!e);
    return {
      name: repoTitle(str(json.name), manifestUrl),
      homepage: str(json.homepage) || undefined,
      format: "harbor",
      entries,
    };
  }
  if (looksLikeMangaRepo(json, parsed)) throw new PluginError("manga-repo");
  throw new PluginError("not-a-repo");
}

export function sameEntryVersion(a: string, b: string): boolean {
  return a.trim() === b.trim();
}
