import type { TraktEpisodeRef } from "./ids";
import type { TraktTarget } from "./types";

const KEY = "harbor.trakt.pendingstops.v1";
const MAX = 50;
const WATCHED_PCT = 70;

export type PendingStop = {
  metaId: string;
  episode?: TraktEpisodeRef;
  progress: number;
  at: number;
};

export type ScrobbleStopOutcome = "recorded" | "already-recorded" | "failed";

export type FlushDeps = {
  hasSession: () => boolean;
  resolveTarget: (metaId: string, episode?: TraktEpisodeRef) => TraktTarget | null;
  stopScrobble: (target: TraktTarget, progress: number) => Promise<ScrobbleStopOutcome>;
  markWatched: (target: TraktTarget) => Promise<boolean>;
};

function keyOf(p: Pick<PendingStop, "metaId" | "episode">): string {
  const e = p.episode;
  return `${p.metaId}|${e?.season ?? ""}|${e?.episode ?? ""}`;
}

function load(): PendingStop[] {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as PendingStop[]) : [];
    return Array.isArray(parsed) ? parsed.filter((p) => p && typeof p.metaId === "string") : [];
  } catch {
    return [];
  }
}

function save(list: PendingStop[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(-MAX)));
  } catch {
    /* ignore */
  }
}

export function listPendingStops(): PendingStop[] {
  return load();
}

export function recordPendingStop(
  metaId: string,
  episode: TraktEpisodeRef | undefined,
  progress: number,
): void {
  if (!metaId || progress < WATCHED_PCT) return;
  const next: PendingStop = {
    metaId,
    episode,
    progress: Math.max(0, Math.min(100, progress)),
    at: Date.now(),
  };
  const rest = load().filter((p) => keyOf(p) !== keyOf(next));
  save([next, ...rest]);
}

function clearPending(key: string): void {
  save(load().filter((p) => keyOf(p) !== key));
}

let flushDeps: FlushDeps | null = null;

export async function flushPendingStops(
  deps?: FlushDeps,
): Promise<{ flushed: number; remaining: number }> {
  const d = deps ?? flushDeps;
  if (!d || !d.hasSession()) return { flushed: 0, remaining: load().length };
  let flushed = 0;
  for (const p of load()) {
    const key = keyOf(p);
    const target = d.resolveTarget(p.metaId, p.episode);
    if (!target) {
      clearPending(key);
      continue;
    }
    let confirmed = false;
    try {
      const outcome = await d.stopScrobble(target, p.progress >= WATCHED_PCT ? 100 : p.progress);
      confirmed = outcome === "recorded" || outcome === "already-recorded";
      if (!confirmed && p.progress >= WATCHED_PCT) confirmed = await d.markWatched(target);
    } catch {
      confirmed = false;
    }
    if (confirmed) {
      flushed += 1;
      clearPending(key);
    }
  }
  return { flushed, remaining: load().length };
}

let onlineArmed = false;

export function armOnlineFlush(deps: FlushDeps): () => void {
  flushDeps = deps;
  if (typeof window === "undefined") return () => {};
  const onOnline = () => {
    void flushPendingStops().catch(() => {});
  };
  if (!onlineArmed) {
    onlineArmed = true;
    window.addEventListener("online", onOnline);
    return () => {
      onlineArmed = false;
      window.removeEventListener("online", onOnline);
    };
  }
  window.addEventListener("online", onOnline);
  return () => window.removeEventListener("online", onOnline);
}
