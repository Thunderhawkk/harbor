import lottie, { type AnimationItem } from "lottie-web";
import { useEffect, useRef, type ReactNode } from "react";
import { useReducedMotion } from "@/lib/use-reduced-motion";

export function NavLottie({
  data,
  hovered,
  fallback,
}: {
  data: object;
  hovered?: boolean;
  fallback: ReactNode;
}) {
  const host = useRef<HTMLSpanElement | null>(null);
  const anim = useRef<AnimationItem | null>(null);
  const reduce = useReducedMotion();
  const play = !reduce && !!hovered;

  useEffect(() => {
    const el = host.current;
    if (!play || !el) return;
    const a = lottie.loadAnimation({
      container: el,
      renderer: "svg",
      loop: false,
      autoplay: true,
      animationData: data,
      rendererSettings: {
        progressiveLoad: false,
        hideOnTransparent: true,
        preserveAspectRatio: "xMidYMid meet",
      },
    });
    anim.current = a;
    return () => {
      a.destroy();
      anim.current = null;
      el.replaceChildren();
    };
  }, [data, play]);

  if (reduce) return <>{fallback}</>;

  return (
    <span className="relative inline-flex leading-none">
      <span className={`inline-flex leading-none ${play ? "invisible" : ""}`}>{fallback}</span>
      {play && (
        <span ref={host} aria-hidden className="harbor-nav-lottie absolute inset-[2px]" />
      )}
    </span>
  );
}
