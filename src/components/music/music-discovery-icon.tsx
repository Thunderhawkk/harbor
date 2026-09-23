type Glyph = "guitar" | "mic" | "keys" | "wave" | "record" | "heart" | "drum";

const genreGlyph: Record<number, Glyph> = {
  132: "mic",
  116: "mic",
  122: "drum",
  152: "guitar",
  113: "wave",
  165: "heart",
  85: "guitar",
  106: "wave",
  466: "drum",
  98: "keys",
  144: "drum",
  129: "keys",
  173: "guitar",
  464: "guitar",
  169: "heart",
  2: "drum",
  16: "drum",
};

/** Original small instrument drawings; the catalog's cover art carries the color. */
export function MusicDiscoveryIcon({
  genreId,
  className,
}: {
  genreId?: number;
  className?: string;
}) {
  const glyph = genreId === undefined ? "record" : (genreGlyph[genreId] ?? "record");
  return (
    <svg
      viewBox="0 0 48 48"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {glyph === "guitar" && (
        <>
          <path d="m27 21 11-11 3 3-11 11M36 10l4-4 3 3-4 4M28 21c-5-6-9-3-9 1-6-1-12 4-10 10 2 7 10 10 15 6 4-3 5-7 3-10 4 0 6-4 1-7Z" />
          <circle cx="20" cy="30" r="3" />
          <path d="m13 35 3 3" />
        </>
      )}
      {glyph === "mic" && (
        <>
          <rect x="16" y="5" width="16" height="27" rx="8" transform="rotate(22 24 19)" />
          <path d="m15 14 14 6m-16 0 14 6M18 32l-3 8m0 0c5 1 10 0 12-4" />
        </>
      )}
      {glyph === "keys" && (
        <>
          <rect x="5" y="10" width="38" height="28" rx="4" />
          <path d="M14 24v14m10-14v14m10-14v14M12 10v14h5V10m5 0v14h5V10m5 0v14h5V10" />
        </>
      )}
      {glyph === "wave" && (
        <>
          <path d="M5 24h4l4-12 6 26 6-31 6 29 5-16 3 4h4" />
          <circle cx="39" cy="10" r="2" />
        </>
      )}
      {glyph === "record" && (
        <>
          <circle cx="24" cy="24" r="18" />
          <circle cx="24" cy="24" r="5" />
          <path d="M12 23a12 12 0 0 1 10-11m4 24a12 12 0 0 0 10-11" />
        </>
      )}
      {glyph === "heart" && (
        <>
          <path d="M24 39 9 25C-1 14 13 3 24 15 35 3 49 14 39 25Z" />
          <path d="M10 24h7l3-6 5 13 4-7h9" />
        </>
      )}
      {glyph === "drum" && (
        <>
          <ellipse cx="24" cy="23" rx="17" ry="6" />
          <path d="M7 23v13c8 8 26 8 34 0V23M12 27l6 11 6-9 6 9 6-11M12 6l24 9M36 6l-24 9" />
        </>
      )}
    </svg>
  );
}
