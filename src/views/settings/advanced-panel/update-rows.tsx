import { Download, FlaskConical, Loader2, RotateCw } from "lucide-react";
import { useSettings } from "@/lib/settings";
import {
  checkForUpdate,
  clearStagedUpdate,
  openUpdatePanel,
  updateAvailable,
  useUpdate,
} from "@/lib/updater/use-update";
import { IS_BETA_BUILD } from "@/lib/build-info";
import { useT } from "@/lib/i18n";
import { ToggleRow } from "../shared";
import { ROW_ACTION, ROW_ACTION_PRIMARY, SettingRow } from "../kit";

const QUAL =
  "inline-flex h-[22px] shrink-0 items-center rounded-[6px] px-2 text-[13px] font-bold uppercase leading-[17px] tracking-[0.72px]";

export function BetaChannelRow() {
  const t = useT();
  const { settings, update } = useSettings();
  const on = settings.betaUpdates;
  return (
    <ToggleRow
      label={t("Get beta updates")}
      sub={t(
        "Receive early builds with the newest fixes before they reach the stable release. Betas can be rough around the edges; switch this off to return to stable at the next update.",
      )}
      leading={
        <FlaskConical
          size={20}
          strokeWidth={2.1}
          className={on ? "text-accent" : "text-ink-subtle"}
        />
      }
      value={on}
      onChange={(betaUpdates) => {
        if (!betaUpdates) clearStagedUpdate();
        update({ betaUpdates });
      }}
    />
  );
}

export function UpdatesRow() {
  const t = useT();
  const u = useUpdate();
  const ready = updateAvailable(u);
  const busy = u.status === "checking";
  const status =
    u.status === "checking"
      ? t("Checking harbor.site for a newer build.")
      : u.status === "downloading"
        ? t("Downloading {pct}%", { pct: Math.round(u.progress * 100) })
        : u.status === "downloaded"
          ? t("Downloaded. Ready to install and restart.")
          : u.status === "installing"
            ? t("Installing. Harbor will restart.")
            : u.status === "available"
              ? t("A new version is ready to download.")
              : u.status === "uptodate"
                ? t("You're on the latest version.")
                : u.status === "error" && u.manualCheck
                  ? t("Couldn't reach the update server. Try again in a moment.")
                  : t("Harbor checks automatically every few hours.");
  return (
    <SettingRow
      icon={
        <RotateCw
          size={20}
          strokeWidth={2}
          className={`${ready ? "text-accent" : "text-ink-muted"} ${busy ? "animate-spin" : ""}`}
        />
      }
      label={
        <span className="inline-flex min-w-0 flex-wrap items-center gap-2">
          <span className="min-w-0">
            {ready && u.version
              ? t("Harbor {version} available", { version: u.version })
              : `Harbor ${__APP_VERSION__}`}
          </span>
          {IS_BETA_BUILD && (
            <span className={`${QUAL} bg-accent-soft text-accent`}>{t("Beta")}</span>
          )}
        </span>
      }
      desc={status}
    >
      {ready ? (
        <button type="button" onClick={openUpdatePanel} className={ROW_ACTION_PRIMARY}>
          <Download size={16} strokeWidth={2.2} />
          {t("Update now")}
        </button>
      ) : (
        <button
          type="button"
          onClick={busy ? undefined : () => void checkForUpdate(true)}
          aria-disabled={busy}
          className={`${ROW_ACTION}${busy ? " pointer-events-none opacity-45" : ""}`}
        >
          {busy ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <RotateCw size={16} strokeWidth={2.2} />
          )}
          {busy ? t("Checking") : t("Check for updates")}
        </button>
      )}
    </SettingRow>
  );
}
