import type { SVGProps } from "react";
// Original Harbor vectors. Editable individual SVGs and the artboard live in assets/sports/icons.
export const SPORT_ICON_PATHS = {
  soccer:
    '<circle cx="16" cy="16" r="12"/><path d="m16 9 6 4-2 7h-8l-2-7Z" fill="currentColor" stroke="none"/><path d="m16 4 0 5m12 6-6-2m1 13-3-6M9 26l3-6M4 15l6-2"/>',
  basketball:
    '<circle cx="16" cy="16" r="12"/><path d="M4 16h24M16 4v24M7 8c11 3 11 13 0 16M25 8c-11 3-11 13 0 16"/>',
  football:
    '<path d="M5 27C0 8 8 0 27 5c5 19-3 27-22 22Z"/><path d="m11 21 10-10m-8 1 7 7m-10-4 7 7M4 18l10 10M18 4l10 10"/>',
  baseball:
    '<circle cx="16" cy="16" r="12"/><path d="M9 6c8 7 8 13 0 20M23 6c-8 7-8 13 0 20M10 10l4-2m-2 8 4-1m-6 7 4 2m8-14-4-2m2 8-4-1m6 7-4 2"/>',
  hockey:
    '<path d="m23 4-8 18H5a2 2 0 0 0-2 2v3h13L27 5"/><ellipse cx="24" cy="26" rx="4" ry="2"/>',
  combat:
    '<path d="m11 4-7 7v10l7 7h10l7-7V11l-7-7Z"/><path d="m10 19 4-7 4 1 4-3m-8 2 6 7-3 4m3-4 4 1"/><circle cx="16" cy="8" r="1" fill="currentColor"/>',
  motorsport:
    '<path d="M8 28V4m0 1c7-5 12 5 20 0v14c-8 5-13-5-20 0"/><path d="M8 5h6v6H8zm6 6h7v7h-7zm7-5h7v6h-7z" fill="currentColor" stroke="none"/>',
  tennis:
    '<ellipse cx="19" cy="12" rx="8" ry="10" transform="rotate(40 19 12)"/><path d="m12 20-8 9m8-17 9 8m-6-13 10 9m-10 3 9-11"/>',
  golf: '<path d="M16 25V3l12 5-12 5"/><ellipse cx="15" cy="26" rx="12" ry="3"/><circle cx="7" cy="21" r="2" fill="currentColor" stroke="none"/>',
  rugby:
    '<path d="M4 27C1 7 9 1 28 5c3 18-5 26-24 22Z"/><path d="m12 20 8-8m-8 3 5 5m-2-8 5 5M4 15l13 13M15 4l13 13"/>',
  boxing:
    '<path d="M9 23c-3-3-5-6-5-10V8c0-3 4-4 6-2 1-4 5-4 7-1 3-2 7 0 7 3v5c5-2 6 3 3 6l-5 5v5H9Z"/><path d="M9 23h13M10 6v7m7-8v8"/>',
  esports:
    '<path d="M10 9h12c4 0 5 4 6 9l1 5c0 4-4 5-6 2l-3-4h-8l-3 4c-2 3-6 2-6-2l1-5c1-5 2-9 6-9Z"/><path d="M8 15h6m-3-3v6"/><circle cx="23" cy="13" r="1.5" fill="currentColor" stroke="none"/><circle cx="20" cy="17" r="1.5" fill="currentColor" stroke="none"/>',
  trophy:
    '<path d="M9 4h14v9a7 7 0 0 1-14 0Zm7 16v7m-6 1h12M9 7H4v4c0 4 3 6 6 6m13-10h5v4c0 4-3 6-6 6"/><path d="m16 7 1.3 2.7 3 .4-2.2 2.1.5 3-2.6-1.4-2.6 1.4.5-3-2.2-2.1 3-.4Z" fill="currentColor" stroke="none"/>',
  crown:
    '<path d="m4 9 7 6 5-10 5 10 7-6-3 16H7Z"/><path d="M8 21h16"/><circle cx="16" cy="4" r="2" fill="currentColor" stroke="none"/>',
  flame:
    '<path d="M17 3c2 7-3 8-1 13 2-1 4-3 4-6 6 5 10 9 6 15-4 6-16 5-20-1C1 16 10 12 11 7c1 3 1 5 3 6 2-3 3-6 3-10Z"/><path d="M17 19c0 3-3 3-3 6 0 4 6 4 6 0 0-2-2-3-3-6Z" fill="currentColor" stroke="none"/>',
  podium: '<path d="M3 27V17h8V9h10v12h8v6Z"/><path d="M11 27V17m10 10v-6M15 13l2-1v6"/>',
  cricket:
    '<path d="m18 3 4 3-6 8-4-3Z"/><path d="m12 11 4 3-8 13-6-4Z"/><path d="M22 16v13m4-13v13m-6-14h8"/><circle cx="24" cy="9" r="2"/>',
  aussie:
    '<ellipse cx="16" cy="16" rx="9" ry="14" transform="rotate(40 16 16)"/><path d="m11 21 10-10m-9 3 6 6m-3-9 6 6"/>',
  lacrosse:
    '<path d="m4 29 13-14m-2-9 3-3h10v10l-3 3c-4 2-12-6-10-10Z"/><path d="m18 4 9 9m-11-6 9 9m-8-5 8-8m-5 11 8-8"/>',
  volleyball:
    '<circle cx="16" cy="16" r="12"/><path d="M5 11c9 1 13 6 13 16M12 5c6 6 7 13 3 23M27 12c-8-2-14 0-20 8M24 23c-4-8-10-11-20-9"/>',
  handball:
    '<circle cx="21" cy="5" r="3"/><circle cx="10" cy="8" r="3"/><path d="m19 11-5 6 6 5 3 6M14 17l-5 6-6 2m16-14 7 3 3-5m-12 4-6-2-4 3"/>',
  badminton:
    '<path d="m4 5 15 9 9 9-5 5-9-9Z"/><path d="m4 5 8-2 11 11 4 9M4 5 3 13l11 10 9 5M8 6l10 12M6 10l10 10m3-6-5 5"/>',
  tabletennis:
    '<path d="M21 4c7 3 9 10 6 15-2 4-6 5-10 5l-6 6-5-5 6-6C6 13 9 4 15 3c2-1 4 0 6 1Z"/><path d="m10 13 13 10"/><circle cx="5" cy="7" r="3"/>',
  snooker:
    '<rect x="3" y="4" width="26" height="24" rx="4"/><circle cx="11" cy="18" r="3"/><circle cx="21" cy="10" r="2"/><path d="m25 24-9-9M5 6h1m20 0h1M5 26h1m20 0h1"/>',
  darts:
    '<circle cx="15" cy="17" r="12"/><circle cx="15" cy="17" r="7"/><circle cx="15" cy="17" r="2"/><path d="m15 17 9-9m-2 2V5l5-3v6l3 2-6 2Z"/>',
  netball:
    '<path d="M16 15v14M8 29h16M6 8h20l-3 11H9Zm2 3 15 8m1-8-15 8"/><ellipse cx="16" cy="8" rx="10" ry="3"/>',
  fieldhockey:
    '<path d="m20 3-9 21c-2 4-8 4-8 0 0-2 3-2 5-2L16 3M24 4l-8 20c-1 3 3 5 6 3l5-4-3-3-5 3"/><circle cx="27" cy="10" r="2"/>',
  cycling:
    '<circle cx="8" cy="22" r="6"/><circle cx="25" cy="22" r="5"/><path d="m8 22 7-11 5 11H8m12 0 3-14h-5m-5 3H9m14-3 3 1"/>',
  winter:
    '<path d="m5 27 22-13M3 23l23-14M14 9l6 5-6 5 3 5m3-10 7 3m-9-6-6 5-7-1M10 11 6 24"/><circle cx="19" cy="5" r="3"/>',
  athletics:
    '<circle cx="20" cy="5" r="3"/><path d="m18 10-5 8 7 4 4 7M13 18l-4 7H3m13-11-6-3-5 4m13-5 6 6h5"/>',
  softball:
    '<circle cx="16" cy="16" r="12"/><path d="M8 7c7 4 7 14 0 18M24 7c-7 4-7 14 0 18m-15-15 4-2m-2 7h4m-4 5 3 2m9-12-4-2m2 7h-4m4 5-3 2"/>',
};
export type SportIconName = keyof typeof SPORT_ICON_PATHS;
export function SportIcon({
  name,
  size = 24,
  ...props
}: { name: string; size?: number } & SVGProps<SVGSVGElement>) {
  const markup = SPORT_ICON_PATHS[name as SportIconName] ?? SPORT_ICON_PATHS.trophy;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
      dangerouslySetInnerHTML={{ __html: markup }}
    />
  );
}
