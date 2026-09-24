import { invoke } from "@tauri-apps/api/core";

/**
 * A display as reported by the Rust `list_monitors` command. `id` is the
 * stable-ish persistence key; the rest is for the picker label and for the Rust
 * side to re-resolve the monitor even if it moved or was replugged.
 */
export type MonitorInfo = {
  id: string;
  deviceName: string;
  deviceId: string;
  name: string;
  isPrimary: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
  scaleFactor: number;
};

/**
 * A per-mode display choice. `auto` follows Harbor (current behaviour); `explicit`
 * targets the stored monitor, falling back to auto when it is no longer
 * connected.
 */
export type DisplaySelection = { mode: "auto" } | { mode: "explicit"; monitor: MonitorInfo };

export const AUTO_DISPLAY: DisplaySelection = { mode: "auto" };

export async function listMonitors(): Promise<MonitorInfo[]> {
  try {
    return await invoke<MonitorInfo[]>("list_monitors");
  } catch {
    return [];
  }
}

/**
 * Move Harbor's main window onto a chosen monitor (used when Open in Big Picture
 * should start on a specific screen). Resolves to false when the monitor is gone.
 */
export async function moveMainToMonitor(monitor: MonitorInfo): Promise<boolean> {
  try {
    return await invoke<boolean>("move_main_to_monitor", { monitor });
  } catch {
    return false;
  }
}

/** "3840 × 2160" */
export function monitorResolution(m: MonitorInfo): string {
  return `${m.width} × ${m.height}`;
}
