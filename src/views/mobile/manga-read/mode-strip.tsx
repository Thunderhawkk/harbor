import { useEffect, useRef } from "react";
import { ProxiedImg } from "./proxied-img";

export function ModeStrip({
  pages,
  initialPage,
  onPageChange,
  onToggleChrome,
  onScrollState,
}: {
  pages: string[];
  initialPage: number;
  onPageChange: (p: number) => void;
  onToggleChrome: () => void;
  onScrollState?: (page: number, frac: number, vel: number) => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const els = useRef<Array<HTMLDivElement | null>>([]);
  const change = useRef(onPageChange);
  change.current = onPageChange;
  const scrollState = useRef(onScrollState);
  scrollState.current = onScrollState;

  const didScroll = useRef(false);
  const firstUrl = useRef(pages[0]);
  if (firstUrl.current !== pages[0]) {
    firstUrl.current = pages[0];
    didScroll.current = false;
  }

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          const i = Number((e.target as HTMLElement).dataset.page);
          if (Number.isFinite(i)) change.current(i);
        }
      },
      { root, rootMargin: "-45% 0px -45% 0px" },
    );
    els.current.forEach((el) => el && obs.observe(el));
    return () => obs.disconnect();
  }, [pages]);

  useEffect(() => {
    if (didScroll.current || pages.length === 0) return;
    didScroll.current = true;
    if (initialPage <= 0) return;
    els.current[initialPage]?.scrollIntoView({ block: "start" });
  }, [pages, initialPage]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    let raf = 0;
    let last = 0;
    let lastSample = { frac: -1, page: -1, t: 0 };
    const report = () => {
      raf = 0;
      const cb = scrollState.current;
      if (!cb) return;
      const now = performance.now();
      if (now - last < 50) return;
      last = now;
      const rRoot = root.getBoundingClientRect();
      const center = rRoot.top + rRoot.height / 2;
      for (let i = 0; i < els.current.length; i++) {
        const el = els.current[i];
        if (!el) continue;
        const r = el.getBoundingClientRect();
        if (center >= r.top && center < r.bottom && r.height > 0) {
          const frac = Math.max(0, Math.min(1, (center - r.top) / r.height));
          let vel = 0;
          if (lastSample.page === i && now > lastSample.t) {
            vel = (frac - lastSample.frac) / (now - lastSample.t);
          }
          lastSample = { frac, page: i, t: now };
          cb(i, frac, vel);
          return;
        }
      }
    };
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(report);
    };
    root.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      root.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [pages]);

  return (
    <div ref={rootRef} className="h-full w-full overflow-y-auto overscroll-contain" onClick={onToggleChrome}>
      <div
        className="flex flex-col items-center"
        style={{
          paddingTop: "calc(env(safe-area-inset-top, 0px) + 108px)",
          paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 96px)",
        }}
      >
        {pages.map((url, i) => (
          <div
            key={i}
            data-page={i}
            ref={(el) => {
              els.current[i] = el;
            }}
            className="min-h-[40vh] w-full bg-[#0b0b0d]"
          >
            <ProxiedImg url={url} className="block w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
