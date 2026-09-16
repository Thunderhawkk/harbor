import type { GamepadInfo, GpAxis, GpButton } from "./protocol";

const STANDARD_BUTTONS: (GpButton | null)[] = [
  "south",
  "east",
  "west",
  "north",
  "lb",
  "rb",
  "lt",
  "rt",
  "back",
  "start",
  "lstick",
  "rstick",
  "dup",
  "ddown",
  "dleft",
  "dright",
  "guide",
];

const STANDARD_AXES: (GpAxis | null)[] = ["lx", "ly", "rx", "ry"];

const PRESS_THRESHOLD = 0.5;
const WEB_ID_BASE = 1000;

function isWindows(): boolean {
  return typeof navigator !== "undefined" && /Windows/i.test(navigator.userAgent);
}

const MICROSOFT_VENDOR = "045e";

function handledNatively(pad: Gamepad): boolean {
  const id = pad.id.toLowerCase();
  if (id.includes("xinput")) return true;
  return id.includes(MICROSOFT_VENDOR);
}

const AUDIO_DEVICE = /headset|headphone|audio|cloud|\bmic\b/i;
const NON_GAMEPAD_VENDORS = ["0951", "03f0"];

/**
 * Normalize a gamepad name for cross-backend comparison. The native Rust
 * backend (gilrs) reports short names like "8BitDo Ultimate 2C" while
 * Chromium reports "8BitDo Ultimate 2C (STANDARD GAMEPAD Vendor: 2dc8
 * Product: 3106)" for the same physical device.
 */
export function normalizeGamepadName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\(.*?\)/g, " ")
    .replace(/vendor:\s*[0-9a-f]{4}/g, " ")
    .replace(/product:\s*[0-9a-f]{4}/g, " ")
    .replace(/standard\s*gamepad/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

const MIN_SUBSTRING_MATCH = 4;

/**
 * True when a web-enumerated pad is the same physical device as one the
 * native backend already reports. Prevents the double-input / double-listing
 * seen with third-party XInput pads (e.g. 8BitDo over a 2.4 GHz dongle),
 * whose Chromium id carries their own VID instead of an "xinput"/Microsoft
 * marker that handledNatively() would catch.
 */
export function isNativeDuplicate(
  webName: string,
  nativeNames: readonly string[],
): boolean {
  const web = normalizeGamepadName(webName);
  if (!web) return false;
  return nativeNames.some((candidate) => {
    const native = normalizeGamepadName(candidate);
    if (!native) return false;
    if (native === web) return true;
    const shorter = native.length <= web.length ? native : web;
    if (shorter.length < MIN_SUBSTRING_MATCH) return false;
    return native.includes(web) || web.includes(native);
  });
}

/**
 * True when a standard-mapping web pad is redundant because the native
 * backend already owns at least one device. gilrs covers every standard pad
 * on Windows regardless of vendor or OS language, so names never need to
 * match here. Falls back to false when native found nothing (web stays the
 * sole input path) and never applies to non-standard DInput pads, which the
 * web source must keep serving.
 */
export function isRedundantStandardPad(mapping: string, hasNativePads: boolean): boolean {
  return hasNativePads && mapping === "standard";
}

export type GamepadShape = {
  id: string;
  mapping: string;
  buttons: readonly unknown[];
  axes: readonly number[];
};

export function isLikelyGamepad(pad: GamepadShape): boolean {
  const id = pad.id.toLowerCase();
  if (AUDIO_DEVICE.test(id)) return false;
  if (NON_GAMEPAD_VENDORS.some((vendor) => id.includes(`vendor: ${vendor}`))) return false;
  if (pad.mapping === "standard") return true;
  return pad.buttons.length >= 8 && pad.axes.length >= 2;
}

export type WebGamepadHandlers = {
  onButton: (button: GpButton, pressed: boolean) => void;
  onAxis: (axis: GpAxis, value: number) => void;
  onPads: (pads: GamepadInfo[]) => void;
  /** Gate input dispatch (e.g. on window focus loss). Defaults to always allowed. */
  inputAllowed?: () => boolean;
  /** Names already reported by the native backend; matching web pads are skipped. */
  isNativeDuplicate?: (padName: string) => boolean;
  /** Whether the native backend owns any device; standard web pads are skipped when true. */
  hasNativePads?: () => boolean;
};

export function startWebGamepadSource(h: WebGamepadHandlers): () => void {
  if (!isWindows()) return () => {};
  if (typeof navigator === "undefined" || typeof navigator.getGamepads !== "function") {
    return () => {};
  }

  const pressed = new Map<string, boolean>();
  const axisValue = new Map<string, number>();
  const inputAllowed = h.inputAllowed ?? (() => true);
  const isNativeDuplicateOf = h.isNativeDuplicate ?? (() => false);
  const hasNativePads = h.hasNativePads ?? (() => false);
  let padSignature = "";
  let raf = 0;
  let stopped = false;
  let polling = false;

  const readPads = (): (Gamepad | null)[] => {
    try {
      return navigator.getGamepads();
    } catch {
      return [];
    }
  };

  const poll = () => {
    if (stopped) return;
    const list = readPads();

    const active: GamepadInfo[] = [];
    for (const pad of list) {
      if (
        !pad ||
        !pad.connected ||
        handledNatively(pad) ||
        !isLikelyGamepad(pad) ||
        isNativeDuplicateOf(pad.id) ||
        isRedundantStandardPad(pad.mapping, hasNativePads())
      )
        continue;
      active.push({ id: WEB_ID_BASE + pad.index, name: pad.id });

      pad.buttons.forEach((btn, i) => {
        const name = STANDARD_BUTTONS[i];
        if (!name) return;
        const key = `${pad.index}:${name}`;
        const down = btn.pressed || btn.value >= PRESS_THRESHOLD;
        if (pressed.get(key) === down) return;
        pressed.set(key, down);
        if (inputAllowed()) h.onButton(name, down);
      });

      pad.axes.forEach((value, i) => {
        const name = STANDARD_AXES[i];
        if (!name) return;
        const key = `${pad.index}:${name}`;
        if (axisValue.get(key) === value) return;
        axisValue.set(key, value);
        if (inputAllowed()) h.onAxis(name, value);
      });
    }

    const signature = active.map((p) => `${p.id}:${p.name}`).join("|");
    if (signature !== padSignature) {
      padSignature = signature;
      h.onPads(active);
    }
    polling = active.length > 0;
    if (polling) raf = requestAnimationFrame(poll);
  };

  const start = () => {
    if (stopped || polling) return;
    polling = true;
    raf = requestAnimationFrame(poll);
  };

  window.addEventListener("gamepadconnected", start);
  start();
  return () => {
    stopped = true;
    polling = false;
    cancelAnimationFrame(raf);
    window.removeEventListener("gamepadconnected", start);
  };
}
