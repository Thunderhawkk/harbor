import { useEffect, useRef, useState } from "react";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { useT } from "@/lib/i18n";
import {
  loadMusicAudioDevices,
  MUSIC_EQ_FREQUENCIES,
  normalizeMusicAudio,
  saveMusicAudioSettings,
  useMusicAudioSettings,
  type MusicAudioDevice,
  type MusicAudioSettingsValue,
} from "@/lib/music/audio-settings";
import { Dropdown } from "@/components/dropdown";
import { MusicEqCurve } from "./music-eq-curve";
import {
  MUSIC_EQ_PRESETS,
  matchEqPreset,
  matchPeqPreset,
  peqPresetFilters,
} from "@/lib/music/eq-presets";
import {
  ListeningControls,
  ListeningProfiles,
  OutputControls,
  ParametricEditor,
} from "./music-listening-lab";
import { MusicDockParts } from "./music-dock-parts";
import { useMusicPlayer } from "@/lib/music/player";
import { useMusicAudioMeter } from "@/lib/music/audio-meter";
import { MusicSignalDetails } from "./music-signal-details";
import "./music-audio-settings.css";

export function MusicAudioSettings({
  onBack,
  connectorId,
}: {
  onBack?: () => void;
  connectorId?: string | null;
}) {
  const t = useT();
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, []);
  const state = useMusicAudioSettings();
  const player = useMusicPlayer();
  const [showSignal, setShowSignal] = useState(false);
  const meter = useMusicAudioMeter(player.current, showSignal);
  const [draft, setDraft] = useState(state.settings);
  const [devices, setDevices] = useState<MusicAudioDevice[]>([]);
  const [scanning, setScanning] = useState(true);
  const [deviceFailed, setDeviceFailed] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    setDraft(state.settings);
  }, [state.settings]);
  useEffect(() => {
    let cancelled = false;
    setScanning(true);
    setDeviceFailed(false);
    loadMusicAudioDevices()
      .then(
        (result) => {
          if (!cancelled) setDevices(result);
        },
        () => {
          if (!cancelled) setDeviceFailed(true);
        },
      )
      .finally(() => {
        if (!cancelled) setScanning(false);
      });
    return () => {
      cancelled = true;
    };
  }, [refresh]);
  const update = (value: Partial<MusicAudioSettingsValue>) => {
    setSaved(false);
    setDraft((current) => normalizeMusicAudio({ ...current, ...value }));
  };
  const missing =
    draft.device !== "auto" && !devices.some((device) => device.name === draft.device);
  const dirty = JSON.stringify(draft) !== JSON.stringify(state.settings);
  return (
    <section className="music-audio-settings" aria-labelledby="music-audio-heading">
      {onBack && (
        <button className="music-audio-back" data-music-inner-back onClick={onBack}>
          <ArrowLeft size={17} />
          {t("Back")}
        </button>
      )}
      <header>
        <h2 id="music-audio-heading" tabIndex={-1} ref={heading}>
          {t("music.audio.title")}
        </h2>
        <p>{t("music.audio.scope")}</p>
      </header>
      {connectorId === "spotify" && <p className="music-audio-note">{t("music.audio.spotify")}</p>}
      {player.current && (
        <details
          className="music-lab-import"
          onToggle={(event) => setShowSignal(event.currentTarget.open)}
        >
          <summary>{t("music.quality.title")}</summary>
          {showSignal && (
            <MusicSignalDetails
              track={player.current}
              audioSettings={state.settings}
              meter={meter}
              outputLabel={
                devices.find((device) => device.name === state.settings.device)?.description
              }
            />
          )}
        </details>
      )}
      <fieldset disabled={!state.ready || state.saving}>
        <ListeningProfiles draft={draft} update={update} />
        <section className="music-audio-section">
          <div className="music-audio-row">
            <label>{t("music.audio.output")}</label>
            <button
              type="button"
              onClick={() => setRefresh((value) => value + 1)}
              disabled={scanning}
              aria-label={t("music.audio.refresh")}
            >
              <RefreshCw size={16} />
              {t("music.audio.refresh")}
            </button>
          </div>
          <Dropdown
            value={draft.device}
            ariaLabel={t("music.audio.output")}
            className="music-audio-output"
            onChange={(device) => update({ device })}
            options={[
              { value: "auto", label: t("music.audio.system") },
              ...(missing ? [{ value: draft.device, label: t("music.audio.missing") }] : []),
              ...devices
                .filter((device) => device.name !== "auto")
                .map((device) => ({
                  value: device.name,
                  label: device.description || device.name,
                })),
            ]}
          />
          <p>{t("music.audio.detect")}</p>
          <label htmlFor="music-equipment-label">{t("music.audio.equipment")}</label>
          <input
            id="music-equipment-label"
            type="text"
            maxLength={100}
            value={draft.equipmentLabel}
            onChange={(event) => {
              setSaved(false);
              setDraft((current) => ({ ...current, equipmentLabel: event.target.value }));
            }}
          />
          <p>{t("music.audio.equipmentHelp")}</p>
          <OutputControls draft={draft} update={update} />
          {deviceFailed && <p role="status">{t("music.audio.deviceError")}</p>}
          {missing && !scanning && !deviceFailed && (
            <p role="status">{t("music.audio.missingHelp")}</p>
          )}
        </section>
        <section className="music-audio-section">
          <div className="music-audio-row">
            <label className="music-audio-toggle">
              <input
                type="checkbox"
                checked={draft.eqEnabled}
                onChange={(event) => update({ eqEnabled: event.target.checked })}
              />
              {t("music.lab.equalizer")}
            </label>
            <button
              type="button"
              onClick={() =>
                update(
                  draft.eqMode === "graphic" ? { eqBands: Array(10).fill(0) } : { peqFilters: [] },
                )
              }
            >
              {t("music.audio.reset")}
            </button>
          </div>
          <p>{t("music.audio.eqHelp")}</p>
          <div className="music-audio-row music-eq-modes">
            <span className="music-eq-mode-field">
              <label>{t("music.lab.mode")}</label>
              <Dropdown
                value={draft.eqMode}
                ariaLabel={t("music.lab.mode")}
                onChange={(value) => update({ eqMode: value as MusicAudioSettingsValue["eqMode"] })}
                options={[
                  { value: "graphic", label: t("music.audio.equalizer") },
                  { value: "parametric", label: t("music.lab.parametric") },
                ]}
              />
            </span>
            <span className="music-eq-mode-field">
              <label>{t("music.audio.presets")}</label>
              {draft.eqMode === "parametric" ? (
                <Dropdown
                  value={matchPeqPreset(draft.peqFilters, MUSIC_EQ_FREQUENCIES)}
                  ariaLabel={t("music.audio.presets")}
                  onChange={(value) => {
                    const preset = MUSIC_EQ_PRESETS.find((item) => item.id === value);
                    if (preset)
                      update({
                        peqFilters: peqPresetFilters(preset, MUSIC_EQ_FREQUENCIES),
                        eqEnabled: true,
                      });
                  }}
                  options={[
                    ...(matchPeqPreset(draft.peqFilters, MUSIC_EQ_FREQUENCIES) === "custom"
                      ? [{ value: "custom", label: t("music.eq.preset.custom") }]
                      : []),
                    ...MUSIC_EQ_PRESETS.map((preset) => ({
                      value: preset.id,
                      label: t(preset.labelKey),
                    })),
                  ]}
                />
              ) : (
                <Dropdown
                  value={matchEqPreset(draft.eqBands)}
                  ariaLabel={t("music.audio.presets")}
                  onChange={(value) => {
                    const preset = MUSIC_EQ_PRESETS.find((item) => item.id === value);
                    if (preset) update({ eqBands: [...preset.bands], eqEnabled: true });
                  }}
                  options={[
                    ...(matchEqPreset(draft.eqBands) === "custom"
                      ? [{ value: "custom", label: t("music.eq.preset.custom") }]
                      : []),
                    ...MUSIC_EQ_PRESETS.map((preset) => ({
                      value: preset.id,
                      label: t(preset.labelKey),
                    })),
                  ]}
                />
              )}
            </span>
          </div>
          {draft.eqMode === "parametric" ? (
            <ParametricEditor draft={draft} applied={state.settings} update={update} />
          ) : (
            <>
              <MusicEqCurve
                bands={draft.eqBands}
                disabled={!draft.eqEnabled}
                onChange={(bands) => update({ eqBands: bands })}
              />
              <div className="music-audio-bands">
                {MUSIC_EQ_FREQUENCIES.map((frequency, index) => (
                  <label key={frequency}>
                    <span dir="ltr">
                      {frequency >= 1000 ? `${frequency / 1000}k` : frequency} Hz
                    </span>
                    <input
                      type="range"
                      min={-12}
                      max={12}
                      step={0.5}
                      value={draft.eqBands[index]}
                      disabled={!draft.eqEnabled}
                      aria-label={t("music.audio.band", { frequency })}
                      aria-valuetext={`${draft.eqBands[index]} dB`}
                      onChange={(event) =>
                        update({
                          eqBands: draft.eqBands.map((gain, i) =>
                            i === index ? Number(event.target.value) : gain,
                          ),
                        })
                      }
                    />
                    <output dir="ltr">
                      {draft.eqBands[index] > 0 ? "+" : ""}
                      {draft.eqBands[index]} dB
                    </output>
                  </label>
                ))}
              </div>
            </>
          )}
          <label className="music-audio-toggle">
            <input
              type="checkbox"
              checked={draft.autoHeadroom}
              disabled={!draft.eqEnabled}
              onChange={(event) => update({ autoHeadroom: event.target.checked })}
            />
            {t("music.audio.headroom")}
          </label>
          {draft.eqMode === "graphic" && <p>{t("music.audio.headroomHelp")}</p>}
        </section>
        <section className="music-audio-section">
          <div className="music-audio-row">
            <label htmlFor="music-balance">{t("music.audio.balance")}</label>
            <output>
              {draft.balance === 0
                ? t("music.audio.center")
                : `${t(draft.balance < 0 ? "music.audio.left" : "music.audio.right")} ${Math.round(Math.abs(draft.balance) * 100)}%`}
            </output>
          </div>
          <input
            id="music-balance"
            className="harbor-slider"
            type="range"
            min={-1}
            max={1}
            step={0.05}
            value={draft.balance}
            onChange={(event) => update({ balance: Number(event.target.value) })}
          />
          <p>{t("music.audio.balanceHelp")}</p>
        </section>
        <section className="music-audio-section">
          <div className="music-audio-row">
            <label>{t("music.audio.replayGain")}</label>
            <Dropdown
              value={draft.replayGain}
              ariaLabel={t("music.audio.replayGain")}
              onChange={(value) =>
                update({ replayGain: value as MusicAudioSettingsValue["replayGain"] })
              }
              options={[
                { value: "off", label: t("music.audio.replayOff") },
                { value: "track", label: t("music.audio.replayTrack") },
                { value: "album", label: t("music.audio.replayAlbum") },
              ]}
            />
          </div>
          <p>{t("music.audio.replayHelp")}</p>
        </section>
        <section className="music-audio-section">
          <label className="music-audio-toggle">
            <input
              type="checkbox"
              checked={draft.boostEnabled}
              onChange={(event) => update({ boostEnabled: event.target.checked })}
            />
            {t("music.audio.boost")}
          </label>
          <div className="music-audio-row">
            <label>{t("music.audio.ceiling")}</label>
            <fieldset disabled={!draft.boostEnabled}>
              <Dropdown
                value={String(draft.volumeLimit)}
                ariaLabel={t("music.audio.ceiling")}
                onChange={(value) => update({ volumeLimit: Number(value) })}
                options={[1, 1.5, 2, 3, 4, 5].map((value) => ({
                  value: String(value),
                  label: `${value * 100}%`,
                }))}
              />
            </fieldset>
          </div>
          <p>{t("music.audio.boostHelp")}</p>
        </section>
        <ListeningControls draft={draft} update={update} />
        <MusicDockParts />
        <footer data-dirty={dirty || undefined}>
          <button
            type="button"
            className="music-audio-apply"
            disabled={!dirty || (missing && draft.device !== state.settings.device)}
            onClick={() => {
              setSaved(false);
              void saveMusicAudioSettings(draft)
                .then(() => setSaved(true))
                .catch(() => {});
            }}
          >
            {t(state.saving ? "music.audio.saving" : "music.audio.apply")}
          </button>
          <span role="status">
            {state.error ? t("music.audio.saveError") : saved ? t("music.audio.saved") : ""}
          </span>
        </footer>
      </fieldset>
    </section>
  );
}
