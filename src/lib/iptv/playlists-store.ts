import { useSyncExternalStore } from "react";

export type StoredPlaylist = {
  id: string;
  name: string;
  url: string;
  epgUrl?: string;
  kind?: "m3u" | "xtream" | "epg";
  xtream?: { server: string; username: string; password: string };
};

const STORAGE_KEY = "harbor.iptv.playlists.v1";

let migrated = false;
let cache: StoredPlaylist[] = [];
let cacheJson = "[]";
const subs = new Set<() => void>();

function notify(): void {
  for (const fn of subs) fn();
}

function ensureMigrated(): void {
  if (!migrated) migrateLegacyPlaylists();
}

/**
 * Moves playlists out of the settings blob (harbor.settings.*) into their own
 * key. Runs once per session; also strips the legacy field from every settings
 * blob that still carries it so playlists stop exporting under Settings.
 */
export function migrateLegacyPlaylists(): void {
  if (migrated) return;
  migrated = true;
  try {
    if (localStorage.getItem(STORAGE_KEY) != null) return;
  } catch {
    return;
  }
  const candidates: string[] = [];
  const seen = new Set<string>();
  for (const key of ["harbor.settings.shared", "harbor.settings"]) {
    if (!seen.has(key)) {
      seen.add(key);
      candidates.push(key);
    }
  }
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith("harbor.settings.") && !seen.has(key)) {
        seen.add(key);
        candidates.push(key);
      }
    }
  } catch {
    /* localStorage enumeration is best-effort */
  }
  let written = false;
  for (const key of candidates) {
    let blob: unknown;
    try {
      blob = JSON.parse(localStorage.getItem(key) ?? "null");
    } catch {
      continue;
    }
    if (!blob || typeof blob !== "object") continue;
    const obj = blob as Record<string, unknown>;
    if (!("iptvPlaylists" in obj)) continue;
    if (!written && Array.isArray(obj.iptvPlaylists)) {
      try {
        const lists = obj.iptvPlaylists as StoredPlaylist[];
        const json = JSON.stringify(lists);
        localStorage.setItem(STORAGE_KEY, json);
        cache = lists;
        cacheJson = json;
        written = true;
      } catch {
        /* quota errors leave the legacy blob in place */
      }
    }
    // Strip the legacy field so the playlists no longer export under Settings.
    try {
      delete obj.iptvPlaylists;
      localStorage.setItem(key, JSON.stringify(obj));
    } catch {
      /* best-effort */
    }
  }
}

export function readPlaylists(): StoredPlaylist[] {
  ensureMigrated();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw == null) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const lists = parsed as StoredPlaylist[];
    if (raw !== cacheJson) {
      cache = lists;
      cacheJson = raw;
    }
    return lists;
  } catch {
    return [];
  }
}

export function writePlaylists(playlists: StoredPlaylist[]): void {
  cache = playlists;
  cacheJson = JSON.stringify(playlists);
  try {
    localStorage.setItem(STORAGE_KEY, cacheJson);
  } catch {
    /* quota errors must not break the in-memory store */
  }
  notify();
}

export function subscribePlaylists(cb: () => void): () => void {
  subs.add(cb);
  return () => subs.delete(cb);
}

// Hydrate the module cache at import time so usePlaylists() consumers render the
// stored playlists without depending on a one-time migration flag being tripped.
readPlaylists();

export function usePlaylists(): StoredPlaylist[] {
  return useSyncExternalStore(subscribePlaylists, () => cache, () => cache);
}
