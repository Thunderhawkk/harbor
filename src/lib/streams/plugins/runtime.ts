import { PluginWorker } from "@/lib/manga/plugins/worker-host";
import { dwarn } from "@/lib/debug";
import { PRELUDE_VERSION } from "./provider-compat/prelude";
import { settingsFingerprint, workerPluginFor } from "./source";
import { saveStreamPlugin, streamPluginById } from "./store";
import type {
  InstalledStreamPlugin,
  PluginCheckResult,
  PluginHealth,
  PluginLogLine,
  StreamPluginRequest,
  StreamPluginSettingsField,
} from "./types";

const IDLE_MS = 5 * 60_000;
const MAX_IDLE_WORKERS = 4;
const GLOBAL_CONCURRENCY = 12;
const LOG_MAX = 200;
const AUTO_PAUSE_FAILURES = 3;
const READY_TIMEOUT = 10_000;
const MAX_BYTES = 8 * 1024 * 1024;

type Slot = { worker: PluginWorker; key: string; lastUsed: number; requests: number };

const slots = new Map<string, Slot>();
const health = new Map<string, PluginHealth>();
const logs = new Map<string, PluginLogLine[]>();
const listeners = new Set<() => void>();
let sweepTimer: ReturnType<typeof setInterval> | null = null;
let inflight = 0;
const queue: Array<() => void> = [];

function notify(): void {
  for (const l of listeners) l();
}

export function subscribeStreamRuntime(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function pluginHealth(id: string): PluginHealth | null {
  return health.get(id) ?? null;
}

export function pluginLog(id: string): PluginLogLine[] {
  return logs.get(id) ?? [];
}

function pushLog(id: string, level: string, text: string): void {
  const list = logs.get(id) ?? [];
  list.push({ at: Date.now(), level, text: text.slice(0, 600) });
  while (list.length > LOG_MAX) list.shift();
  logs.set(id, list);
  notify();
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase() || null;
  } catch {
    return null;
  }
}

function learnHost(id: string, url: string): void {
  const host = hostOf(url);
  if (!host) return;
  const h = health.get(id) ?? emptyHealth();
  if (!h.seenHosts.includes(host)) {
    h.seenHosts = [...h.seenHosts, host].slice(-40);
    health.set(id, h);
  }
}

function emptyHealth(): PluginHealth {
  return { lastAt: null, lastMs: null, lastCount: null, lastError: null, lastTitle: null, seenHosts: [] };
}

function workerKey(plugin: InstalledStreamPlugin): string {
  return `${plugin.id}@${plugin.hash}@${PRELUDE_VERSION}@${settingsFingerprint(plugin)}`;
}

function spawn(plugin: InstalledStreamPlugin): Slot {
  const worker = new PluginWorker(workerPluginFor(plugin), {
    onLog: (level, args) => pushLog(plugin.id, level, args.map((a) => String(a)).join(" ")),
    onHttpRequest: (url) => {
      learnHost(plugin.id, url);
      const s = slots.get(plugin.id);
      if (s) s.requests += 1;
    },
    httpPolicy: { sameSiteHeaders: true, publicOnly: true, maxBytes: MAX_BYTES },
    readyTimeoutMs: READY_TIMEOUT,
  });
  const slot: Slot = { worker, key: workerKey(plugin), lastUsed: Date.now(), requests: 0 };
  slots.set(plugin.id, slot);
  startSweep();
  return slot;
}

export function streamWorkerFor(plugin: InstalledStreamPlugin): PluginWorker {
  const key = workerKey(plugin);
  const existing = slots.get(plugin.id);
  if (existing && existing.key === key) {
    existing.lastUsed = Date.now();
    return existing.worker;
  }
  if (existing) {
    existing.worker.dispose();
    slots.delete(plugin.id);
  }
  return spawn(plugin).worker;
}

export function disposeStreamPlugin(id: string): void {
  const slot = slots.get(id);
  if (!slot) return;
  slot.worker.dispose();
  slots.delete(id);
}

export function disposeAllStreamPlugins(): void {
  for (const slot of slots.values()) slot.worker.dispose();
  slots.clear();
}

function sweep(): void {
  const now = Date.now();
  const idle: Array<[string, Slot]> = [];
  for (const [id, slot] of slots) {
    if (slot.worker.pendingCalls() > 0) continue;
    if (now - slot.lastUsed > IDLE_MS) {
      slot.worker.dispose();
      slots.delete(id);
      continue;
    }
    idle.push([id, slot]);
  }
  idle.sort((a, b) => a[1].lastUsed - b[1].lastUsed);
  while (idle.length > MAX_IDLE_WORKERS) {
    const [id, slot] = idle.shift()!;
    slot.worker.dispose();
    slots.delete(id);
  }
  if (slots.size === 0 && sweepTimer) {
    clearInterval(sweepTimer);
    sweepTimer = null;
  }
}

function startSweep(): void {
  if (sweepTimer) return;
  sweepTimer = setInterval(sweep, 60_000);
}

function acquire(): Promise<void> {
  if (inflight < GLOBAL_CONCURRENCY) {
    inflight += 1;
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    queue.push(() => {
      inflight += 1;
      resolve();
    });
  });
}

function release(): void {
  inflight -= 1;
  const next = queue.shift();
  if (next) next();
}

function isAbort(e: unknown): boolean {
  return e instanceof Error && e.name === "AbortError";
}

function errorText(e: unknown): string {
  if (e instanceof Error) return e.message.replace(/^plugin worker crashed: /, "");
  return String(e);
}

async function recordFailure(plugin: InstalledStreamPlugin, text: string): Promise<void> {
  const fresh = streamPluginById(plugin.id);
  if (!fresh) return;
  const failures = fresh.failures + 1;
  const autoPaused = failures >= AUTO_PAUSE_FAILURES;
  if (autoPaused) disposeStreamPlugin(plugin.id);
  await saveStreamPlugin({ ...fresh, failures, autoPaused: autoPaused || fresh.autoPaused });
  pushLog(plugin.id, "error", text);
}

async function recordSuccess(plugin: InstalledStreamPlugin): Promise<void> {
  const fresh = streamPluginById(plugin.id);
  if (!fresh || fresh.failures === 0) return;
  await saveStreamPlugin({ ...fresh, failures: 0 });
}

export async function runStreamPlugin(
  plugin: InstalledStreamPlugin,
  req: StreamPluginRequest,
  signal: AbortSignal,
  timeoutMs: number,
): Promise<unknown> {
  await acquire();
  const worker = streamWorkerFor(plugin);
  const slot = slots.get(plugin.id);
  const requestsBefore = slot?.requests ?? 0;
  const started = performance.now();
  const h = health.get(plugin.id) ?? emptyHealth();
  try {
    const value = await worker.call("streams", [req], timeoutMs, signal);
    const count = Array.isArray(value) ? value.length : 0;
    h.lastAt = Date.now();
    h.lastMs = Math.round(performance.now() - started);
    h.lastCount = count;
    h.lastError = null;
    h.lastTitle = req.title;
    health.set(plugin.id, h);
    pushLog(
      plugin.id,
      "info",
      `${count} streams for ${req.title} in ${(h.lastMs / 1000).toFixed(1)}s, ${(slot?.requests ?? 0) - requestsBefore} requests`,
    );
    void recordSuccess(plugin);
    return value;
  } catch (e) {
    if (isAbort(e) || signal.aborted) throw e;
    const text = errorText(e);
    h.lastAt = Date.now();
    h.lastMs = Math.round(performance.now() - started);
    h.lastCount = null;
    h.lastError = text;
    h.lastTitle = req.title;
    health.set(plugin.id, h);
    dwarn(`[plugins] ${plugin.name} failed`, e);
    void recordFailure(plugin, text);
    throw e;
  } finally {
    const s = slots.get(plugin.id);
    if (s) s.lastUsed = Date.now();
    release();
    notify();
  }
}

export async function checkStreamPlugin(
  plugin: InstalledStreamPlugin,
  req: StreamPluginRequest,
  timeoutMs = 30_000,
): Promise<PluginCheckResult> {
  const ac = new AbortController();
  const slot = slots.get(plugin.id);
  const requestsBefore = slot?.requests ?? 0;
  const started = performance.now();
  try {
    const value = await runStreamPlugin(plugin, req, ac.signal, timeoutMs);
    return {
      count: Array.isArray(value) ? value.length : 0,
      ms: Math.round(performance.now() - started),
      requests: (slots.get(plugin.id)?.requests ?? 0) - requestsBefore,
      error: null,
    };
  } catch (e) {
    return {
      count: 0,
      ms: Math.round(performance.now() - started),
      requests: (slots.get(plugin.id)?.requests ?? 0) - requestsBefore,
      error: errorText(e),
    };
  }
}

function normalizeField(v: unknown): StreamPluginSettingsField | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const type = typeof o.type === "string" ? o.type : "";
  const label = typeof o.label === "string" ? o.label : "";
  const key = typeof o.key === "string" ? o.key : "";
  const description = typeof o.description === "string" ? o.description : undefined;
  if (type === "header" || type === "info") return label ? { type, label } : null;
  if (!key) return null;
  if (type === "text") {
    return {
      type,
      key,
      label: label || key,
      placeholder: typeof o.placeholder === "string" ? o.placeholder : undefined,
      description,
      isPassword: o.isPassword === true || o.secret === true,
      defaultValue: typeof o.defaultValue === "string" ? o.defaultValue : undefined,
    };
  }
  if (type === "select") {
    const options = Array.isArray(o.options)
      ? o.options
          .map((opt) => {
            if (!opt || typeof opt !== "object") return null;
            const r = opt as Record<string, unknown>;
            const value = r.value == null ? "" : String(r.value);
            const text = typeof r.label === "string" ? r.label : value;
            return value ? { label: text, value } : null;
          })
          .filter((x): x is { label: string; value: string } => !!x)
      : [];
    if (!options.length) return null;
    return {
      type,
      key,
      label: label || key,
      options,
      defaultValue: o.defaultValue == null ? undefined : String(o.defaultValue),
      description,
    };
  }
  if (type === "toggle" || type === "boolean" || type === "checkbox") {
    return {
      type: "toggle",
      key,
      label: label || key,
      defaultValue: o.defaultValue === true,
      description,
    };
  }
  return null;
}

export async function streamPluginSettingsFields(
  plugin: InstalledStreamPlugin,
): Promise<StreamPluginSettingsField[]> {
  const worker = new PluginWorker(workerPluginFor(plugin), {
    readyTimeoutMs: READY_TIMEOUT,
    denyHttp: true,
    onLog: (level, args) => pushLog(plugin.id, level, args.map((a) => String(a)).join(" ")),
  });
  try {
    const meta = await worker.meta();
    if (!(meta.methods ?? []).includes("settings")) return [];
    const raw = await worker.call("settings", [], 10_000);
    const list = Array.isArray(raw) ? raw : raw && typeof raw === "object" && Array.isArray((raw as { fields?: unknown }).fields) ? (raw as { fields: unknown[] }).fields : [];
    return list.map(normalizeField).filter((f): f is StreamPluginSettingsField => !!f);
  } finally {
    worker.dispose();
  }
}
