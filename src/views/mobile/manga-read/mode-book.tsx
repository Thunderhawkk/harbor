import { useMemo, useRef } from "react";
import { BookFlip } from "@/views/manga/manga-reader/book-view";
import { proxied, READER_BG_HEX } from "./local-reader-types";
import { usePinchZoom } from "./hooks/use-pinch-zoom";

export function ModeBook({
  pages,
  rtl,
  resumePage,
  onProgress,
  zoom = 1,
  onZoom,
  onToggleChrome,
}: {
  pages: string[];
  rtl: boolean;
  resumePage: number;
  onProgress: (page: number, spread: string) => void;
  zoom?: number;
  onZoom?: (z: number) => void;
  onToggleChrome: () => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const pinch = usePinchZoom({ zoom, onZoom, rootRef: wrapRef });
  const proxiedPages = useMemo(() => pages.map(proxied), [pages]);

  return (
    <div
      ref={wrapRef}
      className="h-full w-full"
      style={onZoom ? { touchAction: "pan-x pan-y" } : undefined}
      onClickCapture={() => {
        if (pinch.shouldSuppressClick()) return;
        onToggleChrome();
      }}
      onPointerDown={pinch.onPointerDown}
      onPointerMove={pinch.onPointerMove}
      onPointerUp={pinch.onPointerUp}
      onPointerCancel={pinch.onPointerCancel}
    >
      <BookFlip
        pages={proxiedPages}
        rtl={rtl}
        bg={READER_BG_HEX}
        resumePage={resumePage}
        soundEnabled={true}
        zoom={zoom}
        onProgress={onProgress}
      />
    </div>
  );
}
