import type { SectionId } from "./shared";

export type TabEntry = { id: string; label: string; icon: string };

export const SECTION_TABS: Partial<Record<SectionId, TabEntry[]>> = {
  account: [
    { id: "you", label: "You", icon: "UserRound" },
    { id: "profiles", label: "Profiles", icon: "Users" },
    { id: "harbor", label: "Harbor account", icon: "Anchor" },
    { id: "stremio", label: "Stremio", icon: "Plug" },
  ],
  player: [
    { id: "play", label: "Play", icon: "Play" },
    { id: "engine", label: "Engine", icon: "Cpu" },
    { id: "aspect", label: "Aspect", icon: "RectangleHorizontal" },
    { id: "audio", label: "Audio", icon: "Volume2" },
    { id: "onscreen", label: "On screen", icon: "LayoutDashboard" },
    { id: "xray", label: "X-Ray", icon: "ScanEye" },
    { id: "adskip", label: "Ad skip", icon: "SkipForward" },
    { id: "intros", label: "Intros", icon: "FastForward" },
    { id: "upnext", label: "Up next", icon: "ListVideo" },
    { id: "trailers", label: "Trailers", icon: "Clapperboard" },
  ],
  mpv: [
    { id: "quality", label: "Quality", icon: "Gauge" },
    { id: "picture", label: "Picture", icon: "Image" },
    { id: "network", label: "Network", icon: "Wifi" },
    { id: "advanced", label: "mpv.conf", icon: "FileCode" },
  ],
  shaders: [
    { id: "anime4k", label: "Anime4K", icon: "Sparkles" },
    { id: "more", label: "More shaders", icon: "Layers" },
  ],
  anime: [
    { id: "smooth", label: "Motion", icon: "Waves" },
    { id: "svp", label: "SVP", icon: "Film" },
  ],
  language: [
    { id: "app", label: "Harbor", icon: "Languages" },
    { id: "audio", label: "Audio", icon: "AudioLines" },
    { id: "discovery", label: "What you see", icon: "Eye" },
  ],
  subtitles: [
    { id: "languages", label: "Languages", icon: "Languages" },
    { id: "sources", label: "Sources", icon: "Download" },
    { id: "sync", label: "Sync", icon: "Timer" },
    { id: "look", label: "Look", icon: "Type" },
  ],
  streaming: [
    { id: "services", label: "Services", icon: "Tv" },
    { id: "home-servers", label: "Home servers", icon: "Server" },
    { id: "filters", label: "Filters", icon: "Filter" },
    { id: "sorting", label: "Sorting", icon: "ArrowDownUp" },
    { id: "picker", label: "Picker", icon: "MousePointerClick" },
  ],
  p2p: [
    { id: "engine", label: "Engine", icon: "Cpu" },
    { id: "server", label: "Server", icon: "Server" },
  ],
  library: [
    { id: "home", label: "Home", icon: "House" },
    { id: "cards", label: "Cards", icon: "LayoutGrid" },
    { id: "detail", label: "Detail pages", icon: "FileText" },
    { id: "providers", label: "Metadata", icon: "Database" },
    { id: "ai", label: "AI search", icon: "Sparkles" },
    { id: "library", label: "Library", icon: "Library" },
  ],
  theme: [
    { id: "theme", label: "Theme", icon: "Palette" },
    { id: "library", label: "Your themes", icon: "Brush" },
    { id: "logo", label: "Logo & icon", icon: "Shapes" },
    { id: "type", label: "Typography", icon: "Type" },
    { id: "interface", label: "Interface", icon: "LayoutDashboard" },
    { id: "ambience", label: "Ambience", icon: "Sun" },
    { id: "window", label: "Window", icon: "AppWindow" },
  ],
  badges: [
    { id: "badges", label: "Badges", icon: "BadgeCheck" },
    { id: "rules", label: "Custom rules", icon: "SlidersHorizontal" },
    { id: "packs", label: "Packs", icon: "Package" },
  ],
  hotkeys: [
    { id: "keys", label: "Shortcuts", icon: "Keyboard" },
    { id: "behaviour", label: "Behaviour", icon: "Settings2" },
  ],
  controllers: [
    { id: "setup", label: "Setup", icon: "Gamepad2" },
    { id: "mapping", label: "Buttons & sticks", icon: "Joystick" },
  ],
  tv: [
    { id: "devices", label: "Devices", icon: "Cast" },
    { id: "look", label: "Look", icon: "Palette" },
    { id: "watching", label: "Watching", icon: "Play" },
    { id: "content", label: "Content", icon: "Shield" },
  ],
  storage: [
    { id: "overview", label: "Overview", icon: "HardDrive" },
    { id: "video", label: "Video files", icon: "FileVideo" },
    { id: "caches", label: "Caches", icon: "Trash2" },
  ],
  webhooks: [
    { id: "destinations", label: "Destinations", icon: "Send" },
    { id: "what", label: "Sources", icon: "Rss" },
    { id: "rules", label: "Rules", icon: "Filter" },
  ],
  relay: [
    { id: "status", label: "Status", icon: "Activity" },
    { id: "manage", label: "Manage", icon: "Settings2" },
  ],
  advanced: [
    { id: "system", label: "System", icon: "MonitorCog" },
    { id: "privacy", label: "Privacy", icon: "Lock" },
    { id: "repair", label: "Repair", icon: "Wrench" },
    { id: "code", label: "Custom code", icon: "Code" },
    { id: "about", label: "About", icon: "Info" },
  ],
};

export function tabsFor(section: SectionId): TabEntry[] {
  return SECTION_TABS[section] ?? [];
}
