import type { Frame, PlayerSrc } from "../view";

/** A channel replacement must never leave another player behind the dock. */
export function withoutTrailingPlayers(stack: Frame[]): Frame[] {
  let end = stack.length;
  while (end > 1 && stack[end - 1].kind === "player") end--;
  return stack.slice(0, end);
}

/** Channel navigation changes the stream, not the preview's current presentation. */
export function preservePreviewMode(previous: PlayerSrc, next: PlayerSrc): PlayerSrc {
  return previous.sportsDocked === undefined
    ? next
    : { ...next, sportsDocked: previous.sportsDocked };
}

/** The preview is an overlay; page navigation must keep its mounted playback session. */
export function navigateUnderPreview(
  stack: Frame[],
  navigate: (pages: Frame[]) => Frame[],
): Frame[] {
  const dock = stack.at(-1);
  if (dock?.kind !== "player" || !dock.src.sportsDocked) return navigate(stack);
  const pages = withoutTrailingPlayers(stack);
  const next = navigate(pages);
  // Starting/replacing playback takes ownership of the single player surface.
  if (next.at(-1)?.kind === "player" || next.at(-1)?.kind === "picker") return next;
  return next === pages ? stack : [...next, dock];
}

export function previewPageStack(stack: Frame[]): Frame[] {
  const last = stack.at(-1);
  return last?.kind === "player" && last.src.sportsDocked ? withoutTrailingPlayers(stack) : stack;
}
