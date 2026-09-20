import { MusicServiceLogo } from "./music-service-logo";
import { Disc3 } from "lucide-react";
import { useEffect, useState } from "react";
import { useT, useUiLanguage } from "@/lib/i18n";
import { loadMusicReleaseMetadata, type MusicReleaseDetails } from "@/lib/music/release-metadata";
import type { MusicCatalogItem } from "@/lib/music/types";
import { MusicArtistLink } from "./music-artist-link";

export function MusicReleaseMetadata({ item }: { item: MusicCatalogItem }) {
  const t = useT();
  const language = useUiLanguage();
  const { id, kind, connectorId } = item;
  const key = `${connectorId ?? ""}:${kind}:${id}`;
  const [result, setResult] = useState<{ key: string; details: MusicReleaseDetails | null } | null>(
    null,
  );
  useEffect(() => {
    const controller = new AbortController();
    void loadMusicReleaseMetadata({ id, kind, connectorId }, controller.signal)
      .then((details) => {
        if (!controller.signal.aborted) setResult({ key, details });
      })
      .catch(() => {
        if (!controller.signal.aborted) setResult({ key, details: null });
      });
    return () => controller.abort();
  }, [id, kind, connectorId, key]);
  const details = result?.key === key ? result.details : null;
  if (!details) return null;
  const fields: { label: string; value: string; stat?: "albums" | "fans" }[] = [];
  if (details.releaseDate)
    fields.push({
      label: t("music.metadata.releaseDate"),
      value: new Intl.DateTimeFormat(language, { dateStyle: "medium", timeZone: "UTC" }).format(
        new Date(`${details.releaseDate}T00:00:00.000Z`),
      ),
    });
  if (details.recordLabel)
    fields.push({ label: t("music.metadata.recordLabel"), value: details.recordLabel });
  if (details.genres.length)
    fields.push({
      label: t(details.kind === "track" ? "music.metadata.albumGenres" : "music.metadata.genres"),
      value: new Intl.ListFormat(language, { style: "short", type: "conjunction" }).format(
        details.genres,
      ),
    });
  if (details.contributors.length)
    fields.push({
      label: t("music.metadata.contributors"),
      value: new Intl.ListFormat(language, { style: "short", type: "conjunction" }).format(
        details.contributors,
      ),
    });
  if (details.albumCount !== undefined)
    fields.push({
      stat: "albums",
      label: t("music.library.albums"),
      value: details.albumCount.toLocaleString(language),
    });
  if (details.fanCount !== undefined)
    fields.push({
      stat: "fans",
      label: t("music.metadata.deezerFans"),
      value: details.fanCount.toLocaleString(language),
    });
  if (!fields.length && !details.explicit) return null;
  return (
    <div className="music-release-facts flex flex-wrap items-start gap-x-8 gap-y-4 border-b border-edge-soft pb-5">
      <dl className="flex min-w-0 flex-wrap gap-x-8 gap-y-4">
        {fields.map((field) => (
          <div key={field.label} data-music-stat={field.stat} className="min-w-24 max-w-sm">
            <dt className="text-[11px] text-ink-subtle">
              {field.stat === "fans" ? (
                <MusicServiceLogo source="deezer" size={22} />
              ) : field.stat === "albums" ? (
                <Disc3 size={22} aria-hidden />
              ) : null}
              {field.label}
            </dt>
            <dd className="mt-1 break-words text-[13px] leading-relaxed text-ink-muted">
              {field.label === t("music.metadata.contributors") ? (
                <span className="flex flex-wrap gap-x-3 gap-y-1">
                  {details.contributors.map((name) => (
                    <MusicArtistLink
                      key={name}
                      name={name}
                      track={item.kind === "track" ? item : undefined}
                    />
                  ))}
                </span>
              ) : (
                field.value
              )}
            </dd>
          </div>
        ))}
      </dl>
      {details.explicit === true && (
        <span className="rounded-[3px] bg-raised px-2 py-1 text-[10px] font-medium text-ink-muted">
          {t("music.metadata.explicit")}
        </span>
      )}
    </div>
  );
}
