import { Check, RotateCw } from "lucide-react";
import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n";
import { clearAdvisoryIgnores, useAdvisoryIgnoreCount } from "@/lib/player/content-advisory-ignore";
import { ActionRow } from "../advanced-panel/action-row";

export function AdvisoryIgnoreRow({ featureOn }: { featureOn: boolean }) {
  const t = useT();
  const count = useAdvisoryIgnoreCount();
  const [restored, setRestored] = useState(false);

  useEffect(() => {
    if (!restored) return;
    const timer = window.setTimeout(() => setRestored(false), 1400);
    return () => window.clearTimeout(timer);
  }, [restored]);

  if (!featureOn && count === 0) return null;

  return (
    <ActionRow
      label={t("Ignored titles")}
      sub={
        count === 0
          ? t("Titles you ignore on the advisory card never show it again.")
          : t("{count} titles will never show the content advisory again.", { count })
      }
      cta={restored ? t("Restored") : t("Restore")}
      icon={restored ? <Check size={14} strokeWidth={2.6} /> : <RotateCw size={14} />}
      tone={restored ? "success" : "neutral"}
      disabled={count === 0 && !restored}
      onClick={() => {
        clearAdvisoryIgnores();
        setRestored(true);
      }}
    />
  );
}
