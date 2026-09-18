import { useEffect, useRef } from "react";

const ZOOM_MIN = 0.5;
const ZOOM_MAX = 3;
const PINCH_SLOP = 6;

export function clampPinchZoom(z: number): number {
  return Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, Math.round(z * 100) / 100));
}

type Args = {
  zoom: number;
  onZoom?: (z: number) => void;
  rootRef: React.RefObject<HTMLDivElement | null>;
};

export function usePinchZoom({ zoom, onZoom, rootRef }: Args) {
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const onZoomRef = useRef(onZoom);
  onZoomRef.current = onZoom;
  const pinch = useRef({
    pts: new Map<number, { x: number; y: number }>(),
    baseDist: 0,
    baseZoom: 1,
    lastZ: 1,
    rectLeft: 0,
    rectTop: 0,
  });
  const pinchMoved = useRef(false);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const onTouchMove = (e: TouchEvent) => {
      if (!onZoomRef.current) return;
      if (pinch.current.pts.size >= 2) e.preventDefault();
    };
    root.addEventListener("touchmove", onTouchMove, { passive: false });
    return () => root.removeEventListener("touchmove", onTouchMove);
  }, [rootRef]);

  const span = () => {
    const pts = [...pinch.current.pts.values()];
    if (pts.length < 2) return 0;
    return Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!onZoomRef.current) return;
    pinch.current.pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch.current.pts.size === 2) {
      const box = e.currentTarget.getBoundingClientRect();
      pinch.current.rectLeft = box.left;
      pinch.current.rectTop = box.top;
      pinch.current.baseDist = Math.max(1, span());
      pinch.current.baseZoom = zoomRef.current;
      pinch.current.lastZ = zoomRef.current;
    }
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const tracked = pinch.current;
    if (!onZoomRef.current || !tracked.pts.has(e.pointerId)) return;
    tracked.pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (tracked.pts.size !== 2 || tracked.baseDist <= 0) return;
    const dist = span();
    if (Math.abs(dist - tracked.baseDist) > PINCH_SLOP) pinchMoved.current = true;
    const z = clampPinchZoom(tracked.baseZoom * (dist / tracked.baseDist));
    if (z !== tracked.lastZ && tracked.lastZ > 0) {
      const k = z / tracked.lastZ;
      const root = rootRef.current;
      if (root) {
        let mx = 0;
        let my = 0;
        for (const p of tracked.pts.values()) {
          mx += p.x;
          my += p.y;
        }
        mx = mx / tracked.pts.size - tracked.rectLeft;
        my = my / tracked.pts.size - tracked.rectTop;
        root.scrollLeft = (root.scrollLeft + mx) * k - mx;
        root.scrollTop = (root.scrollTop + my) * k - my;
      }
      tracked.lastZ = z;
    }
    onZoomRef.current(clampPinchZoom(tracked.baseZoom * (dist / tracked.baseDist)));
  };

  const endPointer = (e: React.PointerEvent<HTMLDivElement>) => {
    pinch.current.pts.delete(e.pointerId);
  };

  const shouldSuppressClick = () => {
    if (pinchMoved.current) {
      pinchMoved.current = false;
      return true;
    }
    return false;
  };

  return { onPointerDown, onPointerMove, onPointerUp: endPointer, onPointerCancel: endPointer, shouldSuppressClick };
}
