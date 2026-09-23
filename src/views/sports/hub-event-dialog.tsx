import { legacyEsportsMatch } from "@/lib/sports/legacy-esports-match";
import { LegacyEsportsEvent } from "./legacy-esports-event";
import { useEffect, useRef, useState } from "react";
import { X, ArrowRight, ExternalLink } from "lucide-react";
import { ModalShell } from "@/components/modal-shell";
import { useView } from "@/lib/view";
import { useT } from "@/lib/i18n";
import { openUrl } from "@/lib/window";
import type { SportsGame } from "@/lib/sports/espn";
import { hubLeague } from "@/lib/sports/hub-data";
import { SPORTS_BROADCASTS } from "@/lib/sports/broadcasts";
import { WatchSources } from "./watch-sources";
import { useEventDate } from "./hub-cards";
import { HubCompetition } from "./hub-competition";
import { BroadcastPlayer } from "./hub-broadcasts";
import { WhereToWatch } from "./where-to-watch";
import { SportsReminderButton } from "./reminder-button";
import { F1Hub } from "./f1-hub";
import { FightCard } from "./fight-card";
import { EsportsMap } from "./esports-map";
import { VenuePreview } from "./venue-preview";
import { EventMetadata } from "./event-metadata";
import { EventOdds } from "./event-odds";
import { officialBoxingUrl } from "@/lib/sports/providers/boxing-schedule";

function StandardHubEventDialog({
  game,
  games,
  onClose,
  onDetail,
}: {
  game: SportsGame;
  games: SportsGame[];
  onClose: () => void;
  onDetail: (g: SportsGame) => void;
}) {
  const t = useT();
  const date = useEventDate();
  const trigger = useRef(document.activeElement as HTMLElement | null);
  const [watch, setWatch] = useState(false);
  useEffect(
    () => () => {
      trigger.current?.focus({ preventScroll: true });
    },
    [],
  );
  const { player } = useView();
  const playerOnOpen = useRef(player);
  useEffect(() => {
    if (player?.sportsDocked && player !== playerOnOpen.current) onClose();
  }, [player, onClose]);
  const broadcast = SPORTS_BROADCASTS.find((item) => item.league === game.league);
  const fights = games
    .filter((g) => g.league === game.league && g.context?.id === game.context?.id)
    .sort((a, b) => Number(b.id === game.id) - Number(a.id === game.id) || b.startMs - a.startMs);
  const combat = hubLeague(game.league)?.group === "combat" && game.id.includes("|");
  const competition = ["motorsport", "golf"].includes(hubLeague(game.league)?.group || "");
  if (watch && broadcast)
    return <BroadcastPlayer broadcast={broadcast} onClose={() => setWatch(false)} />;
  return (
    <ModalShell closing={false} onDismiss={onClose} labelledBy="sports-event-title" width={1000}>
      <div className="sh-setup-head sh-event-dialog-head">
        <div className="sh-event-dialog-copy">
          <span className="sh-eyebrow">{game.league}</span>
          <h2 id="sports-event-title">{game.context?.name || game.home.name}</h2>
          <p>
            {date(game.startMs, false, game.dateOnly)}
            {game.context?.venue ? ` · ${game.context.venue}` : ""}
          </p>
        </div>
        <SportsReminderButton game={game} />
        <button className="sh-icon sh-event-dialog-close" aria-label={t("Close")} onClick={onClose}>
          <X size={20} />
        </button>
      </div>
      <div className="sh-setup-body">
        {hubLeague(game.league)?.group === "esports" && <EsportsMap game={game} />}
        <VenuePreview game={game} detail={null} sport={hubLeague(game.league)?.group ?? ""} />
        {combat ? (
          <FightCard
            games={fights.length ? fights : [game]}
            expanded
            onOpen={(g) => {
              onClose();
              onDetail(g);
            }}
          />
        ) : competition ? (
          <>
            {game.league === "F1" && <F1Hub game={game} />}
            <HubCompetition game={game} />
          </>
        ) : game.source === "thesportsdb-hub" && hubLeague(game.league) ? (
          <EventMetadata
            key={`${game.league}:${game.id}`}
            game={game}
            league={hubLeague(game.league)!}
          />
        ) : (
          <div className={`sh-event-info ${game.poster || game.artwork ? "has-art" : ""}`}>
            {(game.poster || game.artwork) && (
              <img className="sh-event-poster" src={game.poster || game.artwork} alt="" />
            )}
            <div>
              <h3>{t("Event details")}</h3>
              <p>
                {game.home.name} {game.away.name && `· ${game.away.name}`}
              </p>
              {game.source === "opendota" ? (
                <>
                  <p>
                    {game.home.score} : {game.away.score} · {game.detail}
                  </p>
                  <button
                    className="sh-button"
                    onClick={() => openUrl(`https://www.opendota.com/matches/${game.id}`)}
                  >
                    {t("View match statistics")}
                    <ExternalLink size={15} />
                  </button>
                </>
              ) : (
                <p className="sh-muted">
                  {t(
                    game.source === "official-boxing"
                      ? "Schedule published by the event promoter. Visit the official fight card for the latest lineup and broadcast details."
                      : game.source === "official-one"
                        ? "Schedule from ONE Championship. Visit the official event page for the announced fight card."
                        : "Schedule from TheSportsDB. Live scores and detailed statistics are not supplied by this feed.",
                  )}
                </p>
              )}
              {broadcast && (
                <button className="sh-button" onClick={() => setWatch(true)}>
                  {t("Open official channel")}
                  <ArrowRight size={16} />
                </button>
              )}
            </div>
          </div>
        )}
        {game.source === "official-one" && /^[a-z0-9-]+$/.test(game.id) && (
          <button
            className="sh-button"
            onClick={() => openUrl(`https://www.onefc.com/events/${game.id}/`)}
          >
            {t("Official event page")}
            <ExternalLink size={16} />
          </button>
        )}
        {officialBoxingUrl(game) && (
          <button className="sh-button" onClick={() => openUrl(officialBoxingUrl(game)!)}>
            {t("Official fight card")}
            <ExternalLink size={16} />
          </button>
        )}
        <WhereToWatch game={game} />
        <WatchSources game={game} />
        <EventOdds game={game} />
      </div>
    </ModalShell>
  );
}

export function HubEventDialog(props: {
  game: SportsGame;
  games: SportsGame[];
  onClose: () => void;
  onDetail: (game: SportsGame) => void;
}) {
  return legacyEsportsMatch(props.game) ? (
    <LegacyEsportsEvent game={props.game} onClose={props.onClose} />
  ) : (
    <StandardHubEventDialog {...props} />
  );
}
