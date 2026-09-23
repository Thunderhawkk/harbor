import { useSyncExternalStore } from "react";
import { useT } from "@/lib/i18n";
import { useView } from "@/lib/view";
import { hasSportsSource } from "@/lib/sports/enabled";
import { usePlaylists } from "@/lib/iptv/playlists-store";
import {
  declineSportsConsent,
  resetSportsConsent,
  getSportsConsentSnapshot,
  getSportsConsentServerSnapshot,
  subscribeSportsConsent,
} from "@/lib/sports/consent";
import { Section, ToggleRow, ROW_DESC } from "./shared";
import { ROW_ACTION } from "./kit";

export function SportsAccessRow() {
  const t = useT();
  const { setView } = useView();
  const available = hasSportsSource(usePlaylists());
  const consent = useSyncExternalStore(
    subscribeSportsConsent,
    getSportsConsentSnapshot,
    getSportsConsentServerSnapshot,
  );
  return (
    <Section title={t("Sports")}>
      <ToggleRow
        label={t("Show Sports")}
        value={consent.status !== "declined"}
        sub={t(
          "Show Sports in navigation. You must acknowledge the Sports notice before the page loads.",
        )}
        lockReason={
          !available
            ? t("Configure a Live TV, M3U or Xtream source to make Sports available.")
            : undefined
        }
        onChange={(value) => {
          if (value) resetSportsConsent();
          else declineSportsConsent();
        }}
      />
      <div className="flex flex-wrap items-center justify-between gap-4 py-3">
        <p className={`max-w-[65ch] ${ROW_DESC}`}>
          {t(
            "Enabling Sports does not accept the notice. Your choice is kept on this device and is not synced to your account.",
          )}
        </p>
        <button
          type="button"
          className={ROW_ACTION}
          disabled={!available}
          onClick={() => {
            resetSportsConsent();
            setView("sports");
          }}
        >
          {t("Review Sports notice")}
        </button>
      </div>
      {!consent.persisted && consent.status !== "unknown" && (
        <p role="status" className={ROW_DESC}>
          {t(
            "Your choice is active for this session but could not be saved. You may be asked again when Harbor restarts.",
          )}
        </p>
      )}
    </Section>
  );
}
