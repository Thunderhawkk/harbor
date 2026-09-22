import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
  type RefObject,
} from "react";

type Spot = { x: number; y: number };

const EDGE = 8;
let held: Spot | null = null;

function clamp(spot: Spot, box: DOMRect): Spot {
  return {
    x: Math.min(Math.max(EDGE, spot.x), Math.max(EDGE, window.innerWidth - box.width - EDGE)),
    y: Math.min(Math.max(EDGE, spot.y), Math.max(EDGE, window.innerHeight - box.height - EDGE)),
  };
}

export function useDockDrag(root: RefObject<HTMLElement | null>, enabled: boolean) {
  const [spot, setSpot] = useState<Spot | null>(held);
  const grab = useRef<Spot | null>(null);
  useEffect(() => {
    if (!enabled) return;
    const element = root.current;
    const fit = () => {
      const box = element?.getBoundingClientRect();
      if (!box || !held || grab.current) return;
      const next = clamp(held, box);
      if (next.x === held.x && next.y === held.y) return;
      held = next;
      setSpot(next);
    };
    const observer = element ? new ResizeObserver(fit) : null;
    if (element && observer) observer.observe(element);
    window.addEventListener("resize", fit);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", fit);
    };
  }, [enabled, root]);
  const onPointerDown = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      if (!enabled || event.button !== 0) return;
      if ((event.target as HTMLElement).closest("button, a, input, iframe")) return;
      const box = root.current?.getBoundingClientRect();
      if (!box) return;
      grab.current = { x: event.clientX - box.left, y: event.clientY - box.top };
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [enabled, root],
  );
  const onPointerMove = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      const hold = grab.current;
      const box = root.current?.getBoundingClientRect();
      if (!hold || !box) return;
      event.preventDefault();
      held = clamp({ x: event.clientX - hold.x, y: event.clientY - hold.y }, box);
      setSpot(held);
    },
    [root],
  );
  const onPointerUp = useCallback((event: PointerEvent<HTMLElement>) => {
    grab.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  }, []);
  const style: CSSProperties | undefined =
    enabled && spot
      ? { left: `${spot.x}px`, right: "auto", top: `${spot.y}px`, bottom: "auto" }
      : undefined;
  return {
    style,
    handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp },
  };
}
