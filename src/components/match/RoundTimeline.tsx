import Link from "next/link";
import { Bomb, Clock, Crosshair, ShieldCheck, Skull } from "lucide-react";

import { normalizeName, operatorKey } from "@/lib/match-entry";
import { displayOperator, endReasonLabels, operatorName, type ReplayRound, roundInsight } from "@/lib/replay";

/**
 * Round-by-round view of a match from replay data: a strip of round results,
 * then each round's story (opening duel, plant, clutch) and full kill feed.
 * Rounds are <details> so the page needs no client JavaScript.
 */

export type RoundPlayer = { slug: string; displayName: string };

type Props = {
  maps: Array<{ id: string; mapName: string; rounds: ReplayRound[] }>;
  sideName: Record<"A" | "B", string>;
  /** Normalized in-game name / alias -> site player. */
  players: Map<string, RoundPlayer>;
  /** operatorKey(name) -> icon path. */
  icons: Map<string, string | null>;
  /** Operator icon id -> name (admin-named and replay-learned). */
  idTable: Map<string, string>;
};

const reasonIcon = {
  elimination: Skull,
  time: Clock,
  defuse: ShieldCheck,
  detonation: Bomb
};

export function RoundTimeline({ maps, sideName, players, icons, idTable }: Props) {
  // `plain` inside a <summary>: a link there would navigate instead of opening the round.
  const PlayerName = ({ name, plain }: { name: string | null; plain?: boolean }) => {
    if (!name) return <span className="text-metal-muted">Unknown</span>;
    const player = players.get(normalizeName(name));
    if (plain) return <b className="round-player">{player?.displayName || name}</b>;
    return player ? (
      <Link href={`/players/${player.slug}`} title={name} className="round-player">
        {player.displayName}
      </Link>
    ) : (
      <span className="round-player" title="Not linked to a site player">
        {name}
      </span>
    );
  };

  const Operator = ({ round, player }: { round: ReplayRound; player: string | null }) => {
    const entry = round.operators.find((item) => item.player === player);
    const name = operatorName(entry, idTable);
    const icon = name ? icons.get(operatorKey(name)) : null;
    const label = name ? displayOperator(name) : "Unknown operator";
    return icon ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img className="round-op" alt={label} title={label} src={icon} />
    ) : (
      <span className="round-op" title={label}>
        {name ? name.slice(0, 2).toUpperCase() : "?"}
      </span>
    );
  };

  return (
    <div className="grid gap-6">
      {maps.map((map) => (
        <div key={map.id} className="grid gap-3">
          {maps.length > 1 ? <h3 className="text-lg font-black">{map.mapName}</h3> : null}

          <div className="round-strip" aria-label={`Round results on ${map.mapName}`}>
            {map.rounds.map((round) => {
              const Icon = round.endReason ? reasonIcon[round.endReason] : Crosshair;
              return (
                <a
                  key={round.number}
                  href={`#round-${map.id}-${round.number}`}
                  className={`round-chip${round.winner ? ` side-${round.winner}` : ""}`}
                  title={`Round ${round.number}: ${round.winner ? `${sideName[round.winner]} won` : "result unknown"}${round.endReason ? ` · ${endReasonLabels[round.endReason]}` : ""}`}
                >
                  <b>{round.number}</b>
                  <Icon size={13} />
                </a>
              );
            })}
          </div>

          <div className="grid gap-2">
            {map.rounds.map((round) => {
              const insight = roundInsight(round);
              const defenders: "A" | "B" | null = round.attackers === "A" ? "B" : round.attackers === "B" ? "A" : null;
              const Icon = round.endReason ? reasonIcon[round.endReason] : Crosshair;
              return (
                <details key={round.number} id={`round-${map.id}-${round.number}`} className={`round-card${round.winner ? ` side-${round.winner}` : ""}`}>
                  <summary>
                    <span className="round-number">R{round.number}</span>
                    <span className="round-headline">
                      <strong>
                        {round.winner ? `${sideName[round.winner]} won` : "Result unknown"}
                        {round.endReason ? (
                          <em>
                            <Icon size={13} /> {endReasonLabels[round.endReason]}
                          </em>
                        ) : null}
                      </strong>
                      <span>
                        {round.attackers ? `${sideName[round.attackers]} attacking` : "Sides unknown"}
                        {round.site ? ` · ${round.plant?.room ? "Planted at" : "Defended"} ${round.site}` : ""}
                      </span>
                    </span>
                    <span className="round-highlights">
                      {insight.openingKill ? (
                        <span>
                          First blood <PlayerName plain name={insight.openingKill.killer} />
                        </span>
                      ) : null}
                      {round.plant ? (
                        <span>
                          <Bomb size={12} /> <PlayerName plain name={round.plant.player} /> {round.plant.time}
                        </span>
                      ) : null}
                      {round.defuse ? (
                        <span>
                          <ShieldCheck size={12} /> <PlayerName plain name={round.defuse.player} /> {round.defuse.time}
                        </span>
                      ) : null}
                      {insight.clutch ? (
                        <span className={insight.clutch.won ? "round-clutch-won" : undefined}>
                          <PlayerName plain name={insight.clutch.player} /> {insight.clutch.won ? "won" : "lost"} a 1v{insight.clutch.versus}
                        </span>
                      ) : null}
                    </span>
                  </summary>

                  <div className="round-body">
                    <div className="round-lineups">
                      {([round.attackers, defenders] as const).map((side, index) =>
                        side ? (
                          <div key={side} className={`round-lineup side-${side}`}>
                            <span className="round-lineup-label">
                              {index === 0 ? "Attack" : "Defence"} · {sideName[side]}
                            </span>
                            <div>
                              {round.operators
                                .filter((entry) => entry.side === side)
                                .map((entry) => (
                                  <span key={entry.player} className="round-lineup-player">
                                    <Operator round={round} player={entry.player} />
                                    <PlayerName name={entry.player} />
                                  </span>
                                ))}
                            </div>
                          </div>
                        ) : null
                      )}
                    </div>

                    {round.kills.length ? (
                      <ol className="round-feed">
                        {round.kills.map((kill, index) => {
                          const killerSide = round.operators.find((entry) => entry.player === kill.killer)?.side;
                          return (
                            <li key={`${kill.victim}-${index}`} className={killerSide ? `side-${killerSide}` : undefined}>
                              <span className="round-time" title={kill.postPlant ? "Defuser timer (after the plant)" : "Round clock"}>
                                {kill.postPlant ? <Bomb size={11} /> : null}
                                {kill.time || "-"}
                              </span>
                              <span className="round-feed-player">
                                {kill.killer ? (
                                  <>
                                    <Operator round={round} player={kill.killer} />
                                    <PlayerName name={kill.killer} />
                                  </>
                                ) : (
                                  <span className="text-metal-muted">No killer</span>
                                )}
                              </span>
                              <Crosshair size={13} className="round-feed-arrow" />
                              <span className="round-feed-player round-feed-victim">
                                <Operator round={round} player={kill.victim} />
                                <PlayerName name={kill.victim} />
                              </span>
                              <span className="round-tags">
                                {kill === insight.openingKill ? <b className="tag-first">First blood</b> : null}
                                {kill.headshot ? <b className="tag-hs">HS</b> : null}
                                {kill.teamKill ? <b className="tag-tk">Team kill</b> : null}
                                {insight.traded.has(kill.victim) ? <b>Traded</b> : null}
                              </span>
                            </li>
                          );
                        })}
                      </ol>
                    ) : (
                      <p className="text-sm text-metal-muted">No kills this round.</p>
                    )}
                  </div>
                </details>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
