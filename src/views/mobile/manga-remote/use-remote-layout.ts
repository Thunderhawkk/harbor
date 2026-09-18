import { useState } from "react";

export type RemoteLayout = "swipe" | "strip" | "strip-h" | "tap";

const KEY = "harbor.remote-reader.layout.v1";

function read(): RemoteLayout {
  try {
    const v = localStorage.getItem(KEY);
    if (v === "strip" || v === "strip-h" || v === "tap") return v;
  } catch {
    /* fall through to default */
  }
  return "swipe";
}

export function useRemoteLayout() {
  const [layout, setLayoutState] = useState<RemoteLayout>(read);
  const setLayout = (next: RemoteLayout) => {
    setLayoutState(next);
    try {
      localStorage.setItem(KEY, next);
    } catch {
      /* persistence is best-effort */
    }
  };
  return [layout, setLayout] as const;
}
