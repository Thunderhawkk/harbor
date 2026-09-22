import { fetchDotaBroadcasts } from "@/lib/sports/esports-dota-broadcasts";
import { lazy, Suspense, useEffect, useId, useRef, useState } from "react";
import { ArrowRight, ExternalLink, Play, X } from "lucide-react";
import { ModalShell } from "@/components/modal-shell";
import { useT, useUiLanguage } from "@/lib/i18n";
import { openUrl } from "@/lib/window";
import type { EsportsMatch } from "@/lib/sports/esports-feeds";
import { ESPORTS_GAMES } from "@/lib/sports/esports-catalog";
import { esportsExternalUrl, type EsportsStream } from "@/lib/sports/esports-streams";
import type { SportsGame } from "@/lib/sports/espn";
import { EsportsImage } from "./esports-image";
import { EsportsMap } from "./esports-map";
import { SportsAddonSources } from "./addon-source-panel";
import { StreamPlatform } from "./esports-broadcast";
import { SportsReminderButton } from "./reminder-button";
import { EventOdds } from "./event-odds";
import { EsportsPlayerProfile } from "./esports-profile";
import type { EsportsTeamSelection } from "./esports-team-dialog";
const TeamDialog = lazy(() =>
  import("./esports-team-dialog").then((m) => ({ default: m.EsportsTeamDialog })),
);
import { EsportsCsRoster } from "./esports-cs-roster";
import { fetchCsMatchDetail } from "@/lib/sports/esports-cs-detail";

export function esportsSportsGame(match: EsportsMatch): SportsGame {
  const side = (index: number) => ({
    id: match.teams[index].id,
    name: match.teams[index].name,
    abbr: match.teams[index].code || match.teams[index].name,
    logo: match.teams[index].logo || "",
    score: match.teams[index].score?.toString() || "",
    winner: match.teams[index].winner || false,
  });
  return {
    id: match.id,
    league: {
      dota2: "DOTA2",
      lol: "LOL",
      valorant: "VALORANT",
      cs2: "CS2",
      rocketleague: "RLCS",
    }[match.game],
    source: match.game === "dota2" ? "opendota" : "esports-arena",
    state: match.state === "live" ? "in" : match.state === "recent" ? "post" : "pre",
    startMs: match.startMs,
    detail: match.event.stage || "",
    home: side(0),
    away: side(1),
    context: {
      id: match.event.id,
      name: match.event.name,
      round: match.event.stage || "",
      venue: "",
      draw: "",
      major: false,
    },
  };
}

export function EsportsMatchView({
  match,
  onClose,
  onWatch,
  portalTarget,
}: {
  match: EsportsMatch;
  onClose: () => void;
  onWatch: (stream: EsportsStream) => void;
  onTeam?: (id: number) => void;
  portalTarget?: Element;
}) {
  const t = useT();
  const locale = useUiLanguage();
  const id = useId();
  const close = useRef<HTMLButtonElement>(null);
  const trigger = useRef(document.activeElement as HTMLElement | null);
  const def = ESPORTS_GAMES.find((game) => game.id === match.game)!;
  const game = esportsSportsGame(match);
  const source = esportsExternalUrl(match.sourceUrl);
  const [selectedTeam, setSelectedTeam] = useState<EsportsTeamSelection | null>(null);
  const [accountId, setAccountId] = useState<number | null>(null);
  const [broadcastResult, setBroadcastResult] = useState<{
    key: string;
    streams: EsportsStream[];
  }>();
  const checkingBroadcasts =
    ["cs2", "dota2"].includes(match.game) && broadcastResult?.key !== match.sourceUrl;
  const broadcasts =
    broadcastResult?.key === match.sourceUrl && broadcastResult.streams.length
      ? broadcastResult.streams
      : match.streams;
  useEffect(() => {
    if (!["cs2", "dota2"].includes(match.game)) return;
    const controller = new AbortController();
    const key = match.sourceUrl;
    const slug = key.split("/").filter(Boolean).at(-1) || "";
    // Match-specific providers only; shared request caches avoid roster/player fan-out.
    const load = () => {
      const task =
        match.game === "dota2"
          ? fetchDotaBroadcasts(match, controller.signal)
          : fetchCsMatchDetail(slug, controller.signal).then((detail) => detail.streams);
      task.then(
        (streams) => {
          if (!controller.signal.aborted) setBroadcastResult({ key, streams });
        },
        () => {
          if (!controller.signal.aborted) setBroadcastResult({ key, streams: [] });
        },
      );
    };
    load();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible" && match.state === "live") load();
    }, 60_000);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [
    match.game,
    match.sourceUrl,
    match.id,
    match.startMs,
    match.state,
    match.teams[0].name,
    match.teams[1].name,
  ]);
  useEffect(() => {
    close.current?.focus();
    return () => {
      if (trigger.current?.isConnected) trigger.current.focus({ preventScroll: true });
    };
  }, []);
  useEffect(() => {
    if (accountId === null) close.current?.focus();
  }, [accountId]);
  if (accountId !== null)
    return <EsportsPlayerProfile accountId={accountId} onClose={() => setAccountId(null)} />;
  return (
    <ModalShell
      closing={false}
      onDismiss={onClose}
      labelledBy={id}
      width={1050}
      portalTarget={portalTarget}
      backdropClassName={portalTarget ? "broadcast-match-details" : undefined}
    >
      <div className="ea-dialog-head">
        <div>
          <span className="ea-kicker">{def.name}</span>
          <h2 id={id}>{match.event.name}</h2>
          <p>{match.event.stage}</p>
        </div>
        <button ref={close} className="sh-icon" aria-label={t("Close")} onClick={onClose}>
          <X size={20} />
        </button>
      </div>
      <div className="ea-match-detail">
        <div className="ea-detail-versus">
          {match.teams.map((team, index) => (
            <div key={index} className={`ea-detail-team team-${index}`}>
              <button
                className="ea-detail-team-link ea-team-link"
                onClick={() => setSelectedTeam({ game: match.game, team })}
                aria-label={`${t("View team profile")} · ${team.name}`}
              >
                <EsportsImage src={team.logo} name={team.name} />
                <h3>{team.name}</h3>
              </button>
            </div>
          ))}
          <div className="ea-detail-score">
            {match.state === "live" && (
              <b className="ea-live">
                <i />
                {t("Live now")}
              </b>
            )}
            <strong>
              {match.state === "upcoming"
                ? "VS"
                : `${match.teams[0].score ?? "—"} : ${match.teams[1].score ?? "—"}`}
            </strong>
            <span>
              {match.bestOf ? t("Best of {count}", { count: match.bestOf }) : def.shortName}
            </span>
            <small>
              {new Date(match.startMs).toLocaleString(locale, {
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })}
            </small>
          </div>
        </div>
        <div className="ea-detail-actions">
          <SportsReminderButton game={game} />
        </div>
        <section className="ea-match-broadcasts">
          <div>
            <h3>
              <Play size={18} />
              {t("Watch the action")}
            </h3>
            <p>
              {t(
                checkingBroadcasts && !broadcasts.length
                  ? "Loading broadcast…"
                  : broadcasts.length
                    ? "Broadcasts listed for this match."
                    : "No broadcaster was listed for this event. Check the competition’s official schedule for coverage in your region.",
              )}
            </p>
          </div>
          <div>
            {broadcasts.map((stream) => (
              <button className="sh-button" key={stream.url} onClick={() => onWatch(stream)}>
                <StreamPlatform platform={stream.platform} />
                {stream.title}
                <ArrowRight size={15} />
              </button>
            ))}
            {!checkingBroadcasts && !broadcasts.length && source && (
              <button className="sh-button" onClick={() => openUrl(source)}>
                {t("Full match statistics")}
                <ExternalLink size={15} />
              </button>
            )}
          </div>
        </section>
        <div className="ea-detail-actions">
          <button
            className="sh-button"
            onClick={() =>
              openUrl(
                `https://www.twitch.tv/search?term=${encodeURIComponent(`${match.teams[0].name} ${match.teams[1].name} ${def.name}`)}`,
              )
            }
          >
            {t("Search")} Twitch
            <ExternalLink size={14} />
          </button>
          <button
            className="sh-button"
            onClick={() =>
              openUrl(
                `https://www.youtube.com/results?search_query=${encodeURIComponent(`${match.teams[0].name} vs ${match.teams[1].name} ${def.name} ${new Date(match.startMs).getFullYear()}`)}`,
              )
            }
          >
            {t("Search")} YouTube
            <ExternalLink size={14} />
          </button>
        </div>
        <SportsAddonSources game={game} />
        {match.game === "cs2" && <EsportsCsRoster match={match} onWatch={onWatch} />}
        <EsportsMap
          game={game}
          sourceUrl={match.sourceUrl}
          onPlayer={(id) => setAccountId(Number(id))}
        />
        <EventOdds game={game} />
        <footer className="ea-detail-source">
          {source && (
            <button className="ea-source-link" onClick={() => openUrl(source)}>
              {t("Full match statistics")}
              <ExternalLink size={14} />
            </button>
          )}
          <p>
            {t(
              "Match data is supplied by the linked source. Live player positions are shown only when reported by the provider.",
            )}
          </p>
        </footer>
      </div>
      <Suspense fallback={null}>
        {selectedTeam && (
          <TeamDialog
            selection={selectedTeam}
            matches={[match]}
            onClose={() => setSelectedTeam(null)}
            onMatch={() => setSelectedTeam(null)}
          />
        )}
      </Suspense>
    </ModalShell>
  );
}
