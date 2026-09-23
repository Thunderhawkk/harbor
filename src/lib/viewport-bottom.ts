export const VIEWPORT_BOTTOM_VAR = "--harbor-viewport-bottom";

export function viewportBottomGap(
  layoutHeight: number,
  visualHeight: number,
  offsetTop: number,
): number {
  if (![layoutHeight, visualHeight, offsetTop].every(Number.isFinite)) return 0;
  const gap = layoutHeight - (visualHeight + Math.max(0, offsetTop));
  if (!(gap > 0.5)) return 0;
  return Math.min(Math.round(gap), Math.max(0, Math.round(layoutHeight)));
}

export function trackViewportBottom(): () => void {
  if (typeof window === "undefined") return () => {};
  const view = window.visualViewport;
  const root = document.documentElement;
  const apply = () => {
    const gap = view ? viewportBottomGap(root.clientHeight, view.height, view.offsetTop) : 0;
    root.style.setProperty(VIEWPORT_BOTTOM_VAR, `${gap}px`);
  };
  apply();
  view?.addEventListener("resize", apply);
  view?.addEventListener("scroll", apply);
  window.addEventListener("resize", apply);
  return () => {
    view?.removeEventListener("resize", apply);
    view?.removeEventListener("scroll", apply);
    window.removeEventListener("resize", apply);
    root.style.removeProperty(VIEWPORT_BOTTOM_VAR);
  };
}
