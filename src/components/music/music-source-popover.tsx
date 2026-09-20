import { useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { useEscape } from "@/components/modal-shell";
import "./music-source-popover.css";

export function MusicSourcePopover({
  anchor,
  closing,
  onDismiss,
  children,
}: {
  anchor: RefObject<HTMLElement | null>;
  closing: boolean;
  onDismiss: () => void;
  children: ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ left: 8, bottom: 88, width: 360, maxHeight: 480 });
  useEscape(onDismiss);
  useLayoutEffect(() => {
    const place = () => {
      const button = anchor.current;
      if (!button) return;
      const rect = button.getBoundingClientRect();
      const width = Math.min(360, window.innerWidth - 16);
      const top = button.closest("[data-music-dock]")?.getBoundingClientRect().top ?? rect.top;
      setBox({
        width,
        left: Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8)),
        bottom: window.innerHeight - top + 8,
        maxHeight: Math.max(80, top - 16),
      });
    };
    const outside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!panel.current?.contains(target) && !anchor.current?.contains(target)) onDismiss();
    };
    place();
    const observer = new ResizeObserver(place);
    if (anchor.current) observer.observe(anchor.current);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    document.addEventListener("pointerdown", outside, true);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
      document.removeEventListener("pointerdown", outside, true);
    };
  }, [anchor, onDismiss]);
  return createPortal(
    <div
      ref={panel}
      role="dialog"
      aria-labelledby="music-source-title"
      data-music-source-popover
      data-closing={closing || undefined}
      className="music-source-popover"
      style={box}
    >
      {children}
    </div>,
    document.body,
  );
}
