import { safeFetch } from "@/lib/safe-fetch";
import { assertSafeUrl } from "@/lib/manga/plugins/host-http";
import { normalizeRepoUrl, parseStreamRepoManifest, pluginIdFor, type ParsedStreamRepo } from "./manifest";
import { uninstallStreamPlugin } from "./install";
import { installedStreamPluginsSync, saveStreamPlugin, deleteStreamRepoRecord, loadStreamRepoRecords, saveStreamRepoRecord } from "./store";
import { PluginError, type StreamRepoRecord } from "./types";

const FETCH_TIMEOUT = 20_000;

let repos: StreamRepoRecord[] = [];
const listeners = new Set<() => void>();

function notify(): void {
  for (const l of listeners) l();
}

export function subscribeStreamRepos(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function streamReposSync(): StreamRepoRecord[] {
  return repos;
}

export function streamRepoByUrl(url: string): StreamRepoRecord | undefined {
  return repos.find((r) => r.url === url);
}

export async function loadStreamRepos(): Promise<StreamRepoRecord[]> {
  repos = await loadStreamRepoRecords();
  notify();
  return repos;
}

export async function fetchStreamRepoManifest(url: string): Promise<ParsedStreamRepo> {
  const target = assertSafeUrl(url);
  let res: Response;
  try {
    res = await safeFetch(target, { signal: AbortSignal.timeout(FETCH_TIMEOUT) });
  } catch {
    throw new PluginError("no-answer");
  }
  if (!res.ok) throw new PluginError("no-answer", `HTTP ${res.status}`);
  let parsed: unknown;
  try {
    parsed = JSON.parse(await res.text());
  } catch {
    throw new PluginError("not-a-repo");
  }
  return parseStreamRepoManifest(parsed, target);
}

async function syncInstalled(record: StreamRepoRecord): Promise<void> {
  const listed = new Map(record.entries.map((e) => [pluginIdFor(record.url, e.id), e]));
  for (const plugin of installedStreamPluginsSync()) {
    if (plugin.repoUrl !== record.url) continue;
    const entry = listed.get(plugin.id);
    const next = {
      ...plugin,
      repoName: record.name,
      listed: !!entry,
      repoDisabled: entry ? !entry.enabled : plugin.repoDisabled,
      updateVersion: entry && entry.version !== plugin.version ? entry.version : null,
    };
    if (
      next.listed !== plugin.listed ||
      next.repoDisabled !== plugin.repoDisabled ||
      next.updateVersion !== plugin.updateVersion ||
      next.repoName !== plugin.repoName
    ) {
      await saveStreamPlugin(next);
    }
  }
}

async function upsert(url: string, parsed: ParsedStreamRepo): Promise<StreamRepoRecord> {
  const record: StreamRepoRecord = {
    url,
    name: parsed.name,
    homepage: parsed.homepage,
    format: parsed.format,
    entries: parsed.entries,
    checkedAt: Date.now(),
    error: null,
  };
  await saveStreamRepoRecord(record);
  repos = [...repos.filter((r) => r.url !== url), record];
  await syncInstalled(record);
  notify();
  return record;
}

export async function addStreamRepo(rawUrl: string): Promise<StreamRepoRecord> {
  const url = normalizeRepoUrl(rawUrl);
  if (repos.some((r) => r.url === url)) throw new PluginError("already-added");
  const parsed = await fetchStreamRepoManifest(url);
  return upsert(url, parsed);
}

export async function refreshStreamRepo(url: string): Promise<StreamRepoRecord> {
  const current = streamRepoByUrl(url);
  try {
    const parsed = await fetchStreamRepoManifest(url);
    return await upsert(url, parsed);
  } catch (e) {
    if (!current) throw e;
    const failed: StreamRepoRecord = {
      ...current,
      checkedAt: Date.now(),
      error: e instanceof PluginError ? e.code : "no-answer",
    };
    await saveStreamRepoRecord(failed);
    repos = repos.map((r) => (r.url === url ? failed : r));
    notify();
    return failed;
  }
}

export async function removeStreamRepo(url: string): Promise<void> {
  for (const p of installedStreamPluginsSync().filter((x) => x.repoUrl === url)) {
    await uninstallStreamPlugin(p.id);
  }
  await deleteStreamRepoRecord(url);
  repos = repos.filter((r) => r.url !== url);
  notify();
}

export function normalizeStreamRepoUrl(raw: string): string {
  return normalizeRepoUrl(raw);
}
