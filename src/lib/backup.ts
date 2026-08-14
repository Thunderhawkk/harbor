import { downloadText } from "@/lib/download-text";
import { loadBgImage, saveBgImage } from "@/lib/theme-storage";
import { activeProfileId } from "@/lib/active-profile-id";
import { flushSecrets, getAllSecrets, isSecretKey, secretKeyForProfile, setSecret } from "@/lib/secret-store";

declare const __APP_VERSION__: string;

const FORMAT = "harbor-backup";
const VERSION = 1;

export type BackupSectionKey =
  | "theme"
  | "homeLayout"
  | "settings"
  | "addons"
  | "profiles"
  | "sessions"
  | "watchlist"
  | "watchProgress"
  | "searchHistory"
  | "playerLayouts"
  | "feedDiscover"
  | "iptv"
  | "manga"
  | "miscState"
  | "other";

type BackupSection = {
  key: BackupSectionKey;
  /** English source strings; the UI passes them through t() for translation. */
  label: string;
  description: string;
  /** Flags the section in the UI (e.g. it contains login credentials). */
  warning?: boolean;
  patterns: string[];
  /** Optional sub-options the user can toggle within this section. */
  subOptions?: Array<{ key: string; label: string; description: string; warning?: boolean }>;
};

/**
 * How localStorage keys map to user-facing export sections.
 * Order matters: the first section whose pattern prefixes a key wins,
 * so `harbor.discover.libImported` (homeLayout) must be checked before
 * the broader `harbor.discover.` (feedDiscover).
 */
export const BACKUP_SECTIONS: readonly BackupSection[] = [
  {
    key: "theme",
    label: "Theme & backgrounds",
    description: "Your chosen theme, custom themes, uploaded fonts, and the background image.",
    patterns: [
      "harbor.theme",
      "harbor.custom-themes.v1",
      "harbor.theme-uploads.v1",
      "harbor.theme-client-id",
      "harbor.theme-unseen.v1",
    ],
  },
  {
    key: "homeLayout",
    label: "Home layout",
    description: "Home and detail view layout, page rows, pinned catalogs, and scroll memory.",
    patterns: ["harbor.pageRows.", "harbor.pagecollrows.v1", "harbor.pinnedcatalogs.v1", "harbor.discover.libImported", "harbor.detailLayout", "harbor.library.tab", "harbor.scroll.v1"],
  },
  {
    key: "settings",
    label: "Settings",
    description: "App settings and preferences, including parental controls.",
    patterns: ["harbor.settings", "harbor.settingsNew.v1", "harbor.parental"],
  },
  {
    key: "addons",
    label: "Addons",
    description: "Your installed addons, their order, and which ones are disabled.",
    patterns: [
      "harbor.installed-addons",
      "harbor.addons.",
      "harbor.addonOrder",
      "harbor.addonOrderBackups",
      "harbor.sa.v1.",
    ],
  },
  {
    key: "profiles",
    label: "Profiles",
    description: "Your profiles, the active profile, and the profile picker.",
    patterns: ["harbor.profiles.v1", "harbor.profile.lastSelectAt", "harbor.pickerShown"],
  },
  {
    key: "sessions",
    label: "Service sign-ins",
    description: "Your saved Trakt, Simkl, MAL, AniList, and Letterboxd logins.",
    warning: true,
    patterns: [
      "harbor.trakt.session.v1",
      "harbor.simkl.session.v1",
      "harbor.mal.session.v1",
      "harbor.anilist.session.v1",
      "harbor.letterboxd.session.v1",
    ],
  },
  {
    key: "watchlist",
    label: "Watchlist & favorites",
    description: "Your watchlist, local library, custom lists, collections, and favorites.",
    patterns: [
      "harbor.watchlist.",
      "harbor.localwatchlist.",
      "harbor.localcw.",
      "harbor.favorites.",
      "harbor.charfavorites.",
      "harbor.library.local.v1",
      "harbor.customlists",
      "harbor.collections",
    ],
  },
  {
    key: "watchProgress",
    label: "Watch progress & history",
    description: "Resume positions, watched flags, playback history, and manual watch marks.",
    patterns: [
      "harbor.resume",
      "harbor.watchedFlag.v1",
      "harbor.watchedby.v1",
      "harbor.watchevents.v1",
      "harbor.moviewatched.v1",
      "harbor.manualwatched",
      "harbor.manualunwatched",
      "harbor.hiddenepisodes.v1",
      "harbor.lastseason.v1",
      "harbor.playback-history.v1",
    ],
  },
  {
    key: "searchHistory",
    label: "Search history",
    description: "Your recent search queries.",
    patterns: ["harbor.search.recent"],
  },
  {
    key: "playerLayouts",
    label: "Player layouts & prefs",
    description: "Player UI layout, volume, subtitle presets, and player preferences.",
    patterns: ["harbor.player.", "harbor.sub.presets.v1"],
  },
  {
    key: "feedDiscover",
    label: "Feed & Discover",
    description: "Feed preferences and Discover row state.",
    patterns: ["harbor.feed", "harbor.discover."],
  },
  {
    key: "iptv",
    label: "Live TV",
    description: "M3U URLs, favorites, the EPG guide style, and stats.",
    patterns: ["harbor.iptv.", "harbor.guide.style"],
    subOptions: [
      {
        key: "xtreamCredentials",
        label: "Xtream credentials",
        description: "Usernames and passwords for Xtream playlists. When disabled, Xtream playlists are left out entirely.",
        warning: true,
      },
    ],
  },
  {
    key: "manga",
    label: "Manga",
    description: "Manga library, reading progress, favorites, bookmarks, and reader prefs.",
    patterns: ["harbor.manga.", "harbor.mangaread.", "harbor.mangafav.", "harbor.mangabookmarks."],
  },
  {
    key: "miscState",
    label: "Onboarding & interface state",
    description: "Onboarding flags, dismissed tips, reminders, the discovery queue, and watch party name.",
    patterns: [
      "harbor.onboarding",
      "harbor.hero-muted.v1",
      "harbor.hero-known-audio.v1",
      "harbor.surprise.recent.v1",
      "harbor.voyage.v1",
      "harbor.reminders.",
      "harbor.auto-download.v1",
      "harbor.queue.",
      "harbor.custom-hover.v1",
      "harbor.awardpacks.v1",
      "harbor.cw.dismissed",
      "harbor.calendar.filtersOpen",
      "harbor.multiview.",
      "harbor.memoryHud.open",
      "harbor.webhook.lastTick",
      "harbor.relayBannerDismissed",
      "harbor.presence.status",
      "harbor.kids.learn.v1",
      "harbor.curfew.",
      "harbor.avatar-synced.",
      "harbor.libraryNameRepair.v1.",
      "harbor.together.name",
      "harbor.together.followHostExit",
    ],
  },
  {
    key: "other",
    label: "Cached lookups & misc",
    description: "Recomputable caches like IMDb/TMDB ID maps and award data, plus small UI flags.",
    patterns: [],
  },
];

export const ALL_SECTION_KEYS: readonly BackupSectionKey[] = BACKUP_SECTIONS.map((s) => s.key);

export function isSectionKey(value: unknown): value is BackupSectionKey {
  return typeof value === "string" && (ALL_SECTION_KEYS as readonly string[]).includes(value);
}

/** The section a localStorage key belongs to; "other" is the catch-all. */
export function sectionOf(key: string): BackupSectionKey {
  for (const section of BACKUP_SECTIONS) {
    if (section.patterns.some((p) => key.startsWith(p))) return section.key;
  }
  return "other";
}

export function backupSectionLabel(key: BackupSectionKey): string {
  return BACKUP_SECTIONS.find((s) => s.key === key)?.label ?? "Cached lookups & misc";
}

export function backupSectionDescription(key: BackupSectionKey): string {
  return BACKUP_SECTIONS.find((s) => s.key === key)?.description ?? "";
}

export type Backup = {
  format: string;
  version: number;
  app: string;
  exportedAt: string;
  data: Record<string, string>;
  /** Which sections this backup contains. Absent on legacy files (= everything). */
  sections?: BackupSectionKey[];
  /** Included sub-options per section. Absent = everything included. */
  subOptions?: Record<string, string[]>;
  bgImage?: string | null;
};

function isPortable(key: string): boolean {
  if (!key.startsWith("harbor.")) return false;
  if (key === "harbor.auth" || key.startsWith("harbor.auth.")) return false;
  if (key === "harbor.together.clientId") return false;
  return true;
}

export async function buildBackup(
  selected?: BackupSectionKey[],
  subOptions?: Record<string, string[]>,
): Promise<Backup> {
  const sectionSet = selected && selected.length > 0 ? new Set<BackupSectionKey>(selected) : null;
  const data: Record<string, string> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key || !isPortable(key)) continue;
    if (sectionSet && !sectionSet.has(sectionOf(key))) continue;
    const value = localStorage.getItem(key);
    if (value != null) data[key] = value;
  }
  for (const [key, value] of Object.entries(getAllSecrets())) {
    if (!isPortable(key)) continue;
    if (sectionSet && !sectionSet.has(sectionOf(key))) continue;
    if (data[key] == null) data[key] = value;
  }
  // Xtream playlists embed credentials in their URLs; drop them when the
  // sub-option is deselected so they never leave the device.
  const iptvSubOptions = subOptions?.iptv;
  if (
    (!sectionSet || sectionSet.has("iptv")) &&
    iptvSubOptions &&
    !iptvSubOptions.includes("xtreamCredentials")
  ) {
    const raw = data["harbor.iptv.playlists.v1"];
    if (raw != null) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          const filtered = parsed.filter((p: { kind?: string }) => p?.kind !== "xtream");
          if (filtered.length === 0) {
            delete data["harbor.iptv.playlists.v1"];
          } else {
            data["harbor.iptv.playlists.v1"] = JSON.stringify(filtered);
          }
        }
      } catch {
        /* leave malformed playlists data untouched */
      }
    }
  }
  const includeBg = !sectionSet || sectionSet.has("theme");
  const bgImage = includeBg ? await loadBgImage() : null;
  return {
    format: FORMAT,
    version: VERSION,
    app: typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "dev",
    exportedAt: new Date().toISOString(),
    data,
    sections: sectionSet ? (ALL_SECTION_KEYS.filter((k) => sectionSet.has(k)) as BackupSectionKey[]) : [...ALL_SECTION_KEYS],
    ...(subOptions && Object.keys(subOptions).length > 0 ? { subOptions } : {}),
    ...(bgImage ? { bgImage } : {}),
  };
}

export async function downloadBackup(
  selected?: BackupSectionKey[],
  subOptions?: Record<string, string[]>,
): Promise<boolean> {
  const backup = await buildBackup(selected, subOptions);
  const text = JSON.stringify(backup, null, 2);
  const stamp = new Date().toISOString().slice(0, 10);
  return downloadText(`harbor-backup-${stamp}.harbx`, text, ["harbx"], "Harbor backup");
}

export type ParsedBackup = { ok: true; backup: Backup } | { ok: false; error: string };

export function parseBackup(text: string): ParsedBackup {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, error: "That file is not valid JSON." };
  }
  if (!json || typeof json !== "object") {
    return { ok: false, error: "Unrecognized file." };
  }
  const b = json as Partial<Backup>;
  if (b.format !== FORMAT) {
    return { ok: false, error: "This is not a Harbor backup file." };
  }
  if (!b.data || typeof b.data !== "object") {
    return { ok: false, error: "This backup has no data in it." };
  }
  const data: Record<string, string> = {};
  for (const [k, v] of Object.entries(b.data)) {
    if (typeof v === "string" && isPortable(k)) data[k] = v;
  }
  if (Object.keys(data).length === 0) {
    return { ok: false, error: "This backup contained nothing restorable." };
  }
  const sections = Array.isArray(b.sections) ? (b.sections.filter(isSectionKey) as BackupSectionKey[]) : undefined;
  const subOptions: Record<string, string[]> = {};
  if (b.subOptions && typeof b.subOptions === "object") {
    for (const [k, v] of Object.entries(b.subOptions)) {
      if (isSectionKey(k) && Array.isArray(v) && v.every((x) => typeof x === "string")) {
        subOptions[k] = v;
      }
    }
  }
  return {
    ok: true,
    backup: {
      format: FORMAT,
      version: typeof b.version === "number" ? b.version : VERSION,
      app: typeof b.app === "string" ? b.app : "unknown",
      exportedAt: typeof b.exportedAt === "string" ? b.exportedAt : "",
      data,
      ...(sections && sections.length > 0 ? { sections } : {}),
      ...(Object.keys(subOptions).length > 0 ? { subOptions } : {}),
      ...(typeof b.bgImage === "string" || b.bgImage === null ? { bgImage: b.bgImage } : {}),
    },
  };
}

export function backupKeyCount(backup: Backup): number {
  return Object.keys(backup.data).length;
}

/**
 * Sections this backup actually restores. Legacy files without a sections
 * field restore everything, which keeps old backups working unchanged.
 */
export function backupSections(backup: Backup): BackupSectionKey[] {
  return backup.sections && backup.sections.length > 0 ? backup.sections : [...ALL_SECTION_KEYS];
}

export async function applyBackup(backup: Backup): Promise<void> {
  const restore = new Set<BackupSectionKey>(backupSections(backup));
  const stale: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key || !isPortable(key)) continue;
    // Only clear keys that belong to a section this backup actually restores.
    if (!restore.has(sectionOf(key))) continue;
    stale.push(key);
  }
  for (const key of stale) localStorage.removeItem(key);
  for (const key of Object.keys(getAllSecrets())) {
    if (!isPortable(key)) continue;
    if (!restore.has(sectionOf(key))) continue;
    if (backup.data[key] == null) setSecret(key, null);
  }
  // Restore localStorage-backed entries first so a restored profiles list can
  // change which profile the sign-ins land on.
  for (const [k, v] of Object.entries(backup.data)) {
    if (!isPortable(k) || isSecretKey(k)) continue;
    try {
      localStorage.setItem(k, v);
    } catch {
      /* keep restoring the rest even if one entry is rejected */
    }
  }
  // Sign-ins are stored per profile; place them on the profile that is active
  // after this restore so they come back regardless of where the backup was made.
  const targetProfile = activeProfileId();
  for (const [k, v] of Object.entries(backup.data)) {
    if (!isPortable(k) || !isSecretKey(k)) continue;
    try {
      setSecret(secretKeyForProfile(k, targetProfile), v);
    } catch {
      /* keep restoring the rest even if one entry is rejected */
    }
  }
  if (backup.bgImage !== undefined && restore.has("theme")) {
    try {
      await saveBgImage(backup.bgImage);
    } catch {
      /* background restore is best-effort */
    }
  }
  await flushSecrets();
}
