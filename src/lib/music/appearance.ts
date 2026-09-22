import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState, useSyncExternalStore } from "react";
import { readMusicPreference, writeMusicPreference } from "./preferences";

const KEY = "harbor.music.appearance.v1";
type Appearance = {
  artworkColors: boolean;
  levels: boolean;
  dockVisualizer: boolean;
  immersive: boolean;
};
function read(): Appearance {
  try {
    const value = JSON.parse(readMusicPreference(KEY) ?? "{}");
    return {
      artworkColors: value.artworkColors !== false,
      levels: value.levels !== false,
      dockVisualizer: value.dockVisualizer === true,
      immersive: value.immersive === true,
    };
  } catch {
    return { artworkColors: true, levels: true, dockVisualizer: false, immersive: false };
  }
}
let appearance = read();
const listeners = new Set<() => void>();
export function setMusicAppearance(patch: Partial<Appearance>) {
  appearance = { ...appearance, ...patch };
  writeMusicPreference(KEY, JSON.stringify(appearance));
  listeners.forEach((listener) => listener());
}
export function useMusicAppearance() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    () => appearance,
    () => appearance,
  );
}

export type MusicArtworkColor = { color: string; ink: "#111111" | "#ffffff" };
/** A dominant color from actual artwork pixels, with a readable control foreground. */
export function musicArtworkColor(pixels: ArrayLike<number>): MusicArtworkColor | null {
  const buckets = new Map<string, { rgb: number[]; weight: number; count: number }>();
  for (let i = 0; i + 3 < pixels.length; i += 4) {
    if (pixels[i + 3] < 128) continue;
    const rgb = [pixels[i], pixels[i + 1], pixels[i + 2]];
    const peak = Math.max(...rgb),
      low = Math.min(...rgb);
    if (peak < 24 || low > 235) continue;
    const key = rgb.map((value) => Math.floor(value / 32)).join(":");
    const bucket = buckets.get(key) ?? { rgb: [0, 0, 0], weight: 0, count: 0 };
    rgb.forEach((value, channel) => {
      bucket.rgb[channel] += value;
    });
    bucket.count += 1;
    bucket.weight += 0.2 + (peak - low) / 255;
    buckets.set(key, bucket);
  }
  const best = [...buckets.values()].sort((a, b) => b.weight - a.weight)[0];
  if (!best) return null;
  const rgb = best.rgb.map((value) => Math.round(value / best.count));
  const linear = rgb.map((value) => {
    const s = value / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  const luminance = linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
  return { color: `rgb(${rgb.join(" ")})`, ink: luminance > 0.192 ? "#111111" : "#ffffff" };
}

const colors = new Map<string, MusicArtworkColor | null>();
const pending = new Map<string, Promise<MusicArtworkColor | null>>();
const MAX_BYTES = 4 * 1024 * 1024;
export async function readMusicArtworkBlob(
  response: Response,
  maximumBytes = MAX_BYTES,
): Promise<Blob | null> {
  if (
    !response.ok ||
    !response.headers.get("content-type")?.startsWith("image/") ||
    Number(response.headers.get("content-length") ?? 0) > maximumBytes
  ) {
    await response.body?.cancel();
    return null;
  }
  if (!response.body) return null;
  const reader = response.body.getReader();
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) return new Blob(chunks, { type: response.headers.get("content-type")! });
      size += value.byteLength;
      if (size > maximumBytes) {
        await reader.cancel();
        return null;
      }
      chunks.push(new Uint8Array(value));
    }
  } finally {
    reader.releaseLock();
  }
}

async function artworkBytes(src: string): Promise<Blob | null> {
  try {
    const response = await fetch(src, {
      cache: "force-cache",
      credentials: "omit",
      signal: AbortSignal.timeout(6000),
    });
    // A readable HTTP response needs no second download through native fetch.
    return await readMusicArtworkBlob(response);
  } catch {
    /* Hosts without CORS can use the existing native image fetch. */
  }
  if (!("__TAURI_INTERNALS__" in window) || !/^https?:\/\//i.test(src)) return null;
  try {
    const response = await invoke<{ ok: boolean; body: string; contentType?: string }>(
      "harbor_fetch",
      {
        args: {
          url: src,
          method: "GET",
          responseType: "base64",
          timeoutMs: 6000,
          maxResponseBytes: MAX_BYTES,
        },
      },
    );
    if (!response.ok || response.body.length > Math.ceil(MAX_BYTES / 3) * 4) return null;
    const bytes = Uint8Array.from(atob(response.body), (char) => char.charCodeAt(0));
    if (bytes.byteLength > MAX_BYTES) return null;
    return new Blob([bytes], { type: response.contentType ?? "image/jpeg" });
  } catch {
    return null;
  }
}
async function extract(src: string): Promise<MusicArtworkColor | null> {
  try {
    const blob = await artworkBytes(src);
    if (!blob) return null;
    const bitmap = await createImageBitmap(blob, {
      resizeWidth: 24,
      resizeHeight: 24,
      resizeQuality: "high",
    });
    try {
      const canvas = document.createElement("canvas");
      canvas.width = 24;
      canvas.height = 24;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) return null;
      context.drawImage(bitmap, 0, 0);
      return musicArtworkColor(context.getImageData(0, 0, 24, 24).data);
    } finally {
      bitmap.close();
    }
  } catch {
    return null;
  }
}
export function useMusicArtworkColor(src: string | undefined, enabled: boolean) {
  const [result, setResult] = useState<{ src: string; value: MusicArtworkColor | null } | null>(
    null,
  );
  useEffect(() => {
    if (!enabled || !src) return;
    let alive = true;
    if (colors.has(src)) {
      setResult({ src, value: colors.get(src)! });
      return;
    }
    const task =
      pending.get(src) ??
      extract(src).then((value) => {
        // A transient fetch/decode failure must be retryable when the user re-enables colors.
        if (value) colors.set(src, value);
        pending.delete(src);
        while (colors.size > 80) colors.delete(colors.keys().next().value!);
        return value;
      });
    pending.set(src, task);
    void task.then((value) => {
      if (alive) setResult({ src, value });
    });
    return () => {
      alive = false;
    };
  }, [src, enabled]);
  return enabled && result && result.src === src ? result.value : null;
}
