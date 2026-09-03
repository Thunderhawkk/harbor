import { useSettings } from "@/lib/settings";
import { useT } from "@/lib/i18n";
import {
  BUFFER_SIZES,
  bufferProfileFor,
  bufferSizeFor,
  formatBufferMemory,
  type BufferSizeId,
} from "@/lib/player/buffer-profile";
import { Section, Segmented } from "../shared";
import { SettingRow } from "../kit";

const LABELS: Record<BufferSizeId, string> = {
  auto: "Auto",
  small: "Small",
  medium: "Medium",
  large: "Large",
  max: "Maximum",
};

const DESCRIPTIONS: Record<BufferSizeId, string> = {
  auto: "Harbor sizes the head start for each title and grows it once playback settles. Right for almost everyone.",
  small:
    "The quickest start and the least memory used. Good on a fast, steady connection, or on a machine that is short on memory.",
  medium:
    "A couple of minutes of head start. Rides out a brief hiccup without much of a wait before playback begins.",
  large:
    "Ten minutes of head start. Built for spotty Wi-Fi or a far-away server, at the cost of a longer wait before playback begins.",
  max: "Half an hour of head start. Only worth it on a badly unreliable connection.",
};

export function BufferSizeSection() {
  const { settings, update } = useSettings();
  const t = useT();
  const value = bufferSizeFor(settings);
  const profile = bufferProfileFor(value);
  const adaptive = t("Adaptive");
  const duration = (secs: number) =>
    secs >= 60 ? t("{n} min", { n: Math.round(secs / 60) }) : t("{n} sec", { n: secs });
  const stats = [
    {
      caption: t("Reads ahead"),
      readout: profile ? duration(profile.readaheadSecs) : adaptive,
    },
    {
      caption: t("Memory cap"),
      readout: profile ? formatBufferMemory(profile.maxBytes) : adaptive,
    },
    {
      caption: t("Wait before playing"),
      readout: !profile
        ? adaptive
        : profile.pauseWaitSecs > 0
          ? duration(profile.pauseWaitSecs)
          : t("None"),
    },
  ];

  return (
    <Section
      title={t("Slow or unstable connection")}
      subtitle={t("If video keeps pausing to buffer, or you're on spotty Wi-Fi or a far-away server, this gives Harbor a bigger head start so playback rides through the rough patches.")}
      newId="mpv:buffer-size"
    >
      <SettingRow
        label={t("Buffer size")}
        desc={t(DESCRIPTIONS[value])}
        warn={
          profile && value === "max"
            ? t("Holds up to {size} in memory while a video plays.", {
                size: formatBufferMemory(profile.maxBytes),
              })
            : undefined
        }
      >
        <Segmented
          value={value}
          options={BUFFER_SIZES.map((id) => ({ value: id, label: LABELS[id] }))}
          onChange={(v) => update({ mpvBufferSize: v })}
        />
      </SettingRow>
      <div className="flex flex-wrap items-center gap-1.5 rounded-md bg-elevated px-4 py-3.5">
        {stats.map((s) => (
          <span
            key={s.caption}
            className="flex items-center gap-2.5 rounded-md bg-canvas px-3 py-1.5"
          >
            <span className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-ink-subtle">
              {s.caption}
            </span>
            <span className="text-[12.5px] font-semibold tabular-nums text-ink">{s.readout}</span>
          </span>
        ))}
      </div>
    </Section>
  );
}
