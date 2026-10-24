import type { Metadata } from "next";
import Link from "next/link";
import { MatchKind } from "@prisma/client";
import { notFound } from "next/navigation";

import { PlayerCell } from "@/components/ui/Avatar";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatCard } from "@/components/ui/StatCard";
import { TeamLogo } from "@/components/ui/TeamLogo";
import { avatarFallback, formatDateTime, formatDecimal, formatPercent, statusLabel } from "@/lib/format";
import { operatorKey, parseOperatorBan } from "@/lib/match-entry";
import { getMatchSideName, getMatchSideTag, getMatchTitle } from "@/lib/match-utils";
import { prisma } from "@/lib/prisma";
import { attachRegisteredTeam } from "@/lib/registered-teams";
import { calculateAggregateStats } from "@/lib/stats";

export const dynamic = "force-dynamic";

const stageLabels: Record<string, string> = {
  UPPER: "Upper bracket",
  LOWER: "Lower bracket",
  GRAND_FINAL: "Grand final",
  GROUP: "Group stage"
};

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const match = await prisma.match.findUnique({
    where: { id },
    include: { teamA: true, teamB: true, maps: true }
  });
  if (!match) return { title: "Match" };

  const title = getMatchTitle(match);
  const description = `${getMatchSideName(match, "A")} ${match.scoreA}-${match.scoreB} ${getMatchSideName(match, "B")}${
    match.maps.length ? ` on ${match.maps.map((map) => map.mapName).join(", ")}` : ""
  }.`;
  return { title, description, openGraph: { title, description } };
}

export default async function MatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const foundMatch = await prisma.match.findUnique({
    where: { id },
    include: {
      tournament: true,
      league: true,
      teamA: true,
      teamB: true,
      winnerTeam: true,
      maps: {
        include: { winnerTeam: true },
        orderBy: { order: "asc" }
      },
      participants: {
        include: { player: true },
        orderBy: [{ side: "asc" }, { player: { displayName: "asc" } }]
      },
      stats: {
        include: { player: true, team: true, mapGame: true }
      },
      keyMoments: {
        include: { player: true },
        orderBy: { createdAt: "asc" }
      }
    }
  });

  if (!foundMatch) notFound();
  const match = await attachRegisteredTeam(foundMatch);
  const operatorIcons = await prisma.operatorIcon.findMany();
  const iconByOperator = new Map(operatorIcons.map((operator) => [operatorKey(operator.name), operator.iconPath]));

  const aggregate = calculateAggregateStats(match.stats);
  const teamAName = getMatchSideName(match, "A");
  const teamBName = getMatchSideName(match, "B");
  const teamATag = getMatchSideTag(match, "A");
  const teamBTag = getMatchSideTag(match, "B");
  const sideTeam = { A: match.teamA, B: match.teamB };
  const sideName = { A: teamAName, B: teamBName };
  const participantSide = new Map(match.participants.map((participant) => [participant.playerId, participant.side]));

  const playerRows = Array.from(
    match.stats.reduce((map, stat) => {
      const existing = map.get(stat.playerId) || { player: stat.player, side: stat.side, entries: [] as typeof match.stats };
      existing.entries.push(stat);
      existing.side = existing.side || stat.side;
      map.set(stat.playerId, existing);
      return map;
    }, new Map<string, { player: (typeof match.stats)[number]["player"]; side: string | null; entries: typeof match.stats }>())
  )
    .map(([playerId, value]) => ({
      player: value.player,
      side: (value.side || participantSide.get(playerId) || null) as "A" | "B" | null,
      aggregate: calculateAggregateStats(value.entries)
    }))
    .sort((a, b) => b.aggregate.rating - a.aggregate.rating);

  const bans = match.operatorBans.map(parseOperatorBan);
  const mvp = playerRows[0];
  const competitionLabel = match.tournament?.name || (match.league ? match.league.shortName || match.league.name : null);

  const statGroups = (["A", "B", null] as const)
    .map((side) => ({ side, rows: playerRows.filter((row) => row.side === side) }))
    .filter((group) => group.rows.length);

  return (
    <main className="page-shell grid gap-6">
      <section className="match-hero">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              {match.matchKind === MatchKind.LEAGUE ? (
                match.league ? (
                  <Link href={`/leagues/${match.league.slug}`} className="league-pill">
                    {match.league.shortName || match.league.name} League Game
                  </Link>
                ) : (
                  <span className="league-pill">League Game</span>
                )
              ) : (
                <span className="fun-pill">Fun Game</span>
              )}
              {match.bracketStage ? (
                <span className="event-chip">
                  {stageLabels[match.bracketStage]}
                  {match.bracketRound ? ` · R${match.bracketRound}` : ""}
                </span>
              ) : null}
              <span className={`status-pill status-${match.status.toLowerCase()}`}>{statusLabel(match.status)}</span>
            </div>
            <h1 className="mt-3 text-3xl font-black md:text-4xl">{getMatchTitle(match)}</h1>
            <p className="mt-2 text-sm font-semibold text-metal-muted">
              {match.tournament ? (
                <Link href={`/tournaments/${match.tournament.slug}`} className="text-metal-link hover:text-metal-accent">
                  {match.tournament.name}
                </Link>
              ) : (
                competitionLabel || "Standalone match"
              )}{" "}
              · {match.format}v{match.format} · {formatDateTime(match.playedAt)}
            </p>
          </div>
        </div>

        <div className="scoreboard">
          {(["A", "B"] as const).map((side) => {
            const team = sideTeam[side];
            const won = match.winnerSide === side || (team && match.winnerTeamId === team.id);
            const content = (
              <>
                {team?.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img alt="" src={team.logoUrl} />
                ) : (
                  <span className="scoreboard-tag">{(side === "A" ? teamATag : teamBTag).slice(0, 3).toUpperCase()}</span>
                )}
                <span className="min-w-0">
                  <strong>{sideName[side]}</strong>
                  <em>{won ? "Winner" : team ? team.tag || "Registered team" : "Custom side"}</em>
                </span>
              </>
            );
            const className = `scoreboard-team${side === "B" ? " is-b" : ""}${won ? " is-winner" : ""}`;
            const node = team ? (
              <Link key={side} href={`/teams/${team.slug}`} className={className}>
                {content}
              </Link>
            ) : (
              <div key={side} className={className}>
                {content}
              </div>
            );
            return side === "A" ? (
              node
            ) : (
              <div key="score-and-b" className="contents">
                <div className="scoreboard-score">
                  <b className={match.winnerSide === "A" ? "is-winner" : undefined}>{match.scoreA}</b>
                  <span>:</span>
                  <b className={match.winnerSide === "B" ? "is-winner" : undefined}>{match.scoreB}</b>
                </div>
                {node}
              </div>
            );
          })}
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Maps" value={match.maps.length} helper={match.maps.map((map) => map.mapName).join(", ") || undefined} />
        <StatCard label="Total kills" value={aggregate.kills} helper={`${aggregate.headshots} headshots`} />
        <StatCard label="Avg rating" value={formatDecimal(aggregate.rating)} />
        <StatCard
          label="Top performer"
          value={mvp ? mvp.player.displayName : "-"}
          helper={mvp ? `${mvp.aggregate.kills}/${mvp.aggregate.deaths}/${mvp.aggregate.assists} · ${formatDecimal(mvp.aggregate.rating)}` : undefined}
          accent
        />
      </section>

      {match.keyMoments.length ? (
        <section>
          <div className="section-heading">
            <h2>Key Moments</h2>
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            {match.keyMoments.map((moment) => (
              <Link key={moment.id} href={`/players/${moment.player.slug}`} className="moment-card">
                <span className="avatar">
                  {avatarFallback(moment.player.displayName)}
                  {moment.player.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img alt="" src={moment.player.avatarUrl} />
                  ) : null}
                </span>
                <div>
                  <strong>{moment.text}</strong>
                  <span>{moment.player.displayName}</span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <section>
        <div className="section-heading">
          <h2>Player Stats</h2>
        </div>
        {statGroups.length ? (
          <div className="grid gap-4">
            {statGroups.map((group) => (
              <div key={group.side || "none"} className="table-scroll">
                <table className="wiki-table">
                  <thead>
                    <tr>
                      <th>
                        <span className="inline-flex items-center gap-2">
                          {group.side ? <TeamLogo team={sideTeam[group.side]} /> : null}
                          {group.side ? sideName[group.side] : "Unassigned"}
                          {group.side && match.winnerSide === group.side ? <span className="text-metal-accent">· Win</span> : null}
                        </span>
                      </th>
                      <th className="numeric">K</th>
                      <th className="numeric">D</th>
                      <th className="numeric">A</th>
                      <th className="numeric">K/D</th>
                      <th className="numeric">HS%</th>
                      <th className="numeric">Rating</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.rows.map((row) => (
                      <tr key={row.player.id} className={row === mvp ? "highlight" : undefined}>
                        <td>
                          <PlayerCell player={row.player} />
                        </td>
                        <td className="numeric font-black text-metal-text">{row.aggregate.kills}</td>
                        <td className="numeric">{row.aggregate.deaths}</td>
                        <td className="numeric">{row.aggregate.assists}</td>
                        <td className="numeric">{formatDecimal(row.aggregate.kd)}</td>
                        <td className="numeric">{formatPercent(row.aggregate.hsPercent)}</td>
                        <td className={`numeric font-black ${row.aggregate.rating >= 1.2 ? "text-metal-accent" : "text-metal-text"}`}>{formatDecimal(row.aggregate.rating)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState message="No player stats entered for this match yet." />
        )}
      </section>

      {bans.length || match.mapVetoes.length ? (
        <section className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
          <div className="panel p-4">
            <div className="section-heading">
              <h2>Operator Bans</h2>
            </div>
            {bans.length ? (
              <div className="operator-ban-grid">
                {bans.map((ban, index) => {
                  const icon = iconByOperator.get(operatorKey(ban.operator));
                  const by = ban.side ? sideName[ban.side] : ban.by;
                  return (
                    <div key={`${ban.raw}-${index}`} className="operator-ban-chip" title={ban.raw}>
                      {icon ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img alt="" src={icon} />
                      ) : (
                        <span>{ban.operator.slice(0, 2).toUpperCase()}</span>
                      )}
                      <span className="min-w-0">
                        <strong>{ban.operator}</strong>
                        {by ? <em>{by}</em> : null}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-metal-muted">No operator bans recorded.</p>
            )}
          </div>
          <div className="panel p-4">
            <div className="section-heading">
              <h2>Map Veto</h2>
            </div>
            {match.mapVetoes.length ? (
              <ol className="grid gap-2 text-sm font-semibold">
                {match.mapVetoes.map((veto, index) => (
                  <li key={`${veto}-${index}`} className="border-l-2 border-metal-accent pl-3 text-metal-text">
                    <span className="mr-2 text-metal-muted">{index + 1}.</span>
                    {veto}
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-sm text-metal-muted">No map veto recorded.</p>
            )}
          </div>
        </section>
      ) : null}

      <section className="grid gap-4 lg:grid-cols-2">
        {(["A", "B"] as const).map((side) => {
          const roster = match.participants.filter((participant) => participant.side === side);
          return (
            <div key={side} className="match-roster-panel">
              <div className="match-roster-heading">
                <h2>
                  <TeamLogo team={sideTeam[side]} />
                  {sideName[side]}
                </h2>
                <span>{side === "A" ? match.scoreA : match.scoreB}</span>
              </div>
              <div className="match-player-grid">
                {roster.length ? (
                  roster.map((participant) => (
                    <Link key={participant.id} href={`/players/${participant.player.slug}`} className="match-player-card">
                      <div className="match-player-avatar">
                        <span>{avatarFallback(participant.player.displayName)}</span>
                        {participant.player.avatarUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img alt="" src={participant.player.avatarUrl} />
                        ) : null}
                      </div>
                      <strong>{participant.player.displayName}</strong>
                      <span>{participant.player.realName || participant.player.role || "Player"}</span>
                    </Link>
                  ))
                ) : (
                  <p className="text-sm text-metal-muted">No roster assigned.</p>
                )}
              </div>
            </div>
          );
        })}
      </section>

      <section>
        <div className="section-heading">
          <h2>Maps</h2>
        </div>
        <div className="table-scroll">
          <table className="wiki-table">
            <thead>
              <tr>
                <th className="numeric">#</th>
                <th>Map</th>
                <th className="numeric">{teamATag}</th>
                <th className="numeric">{teamBTag}</th>
                <th>Winner</th>
              </tr>
            </thead>
            <tbody>
              {match.maps.length ? (
                match.maps.map((map) => (
                  <tr key={map.id}>
                    <td className="numeric">{map.order}</td>
                    <td className="font-black text-metal-text">{map.mapName}</td>
                    <td className={`numeric ${map.winnerSide === "A" ? "font-black text-metal-accent" : ""}`}>{map.teamAScore}</td>
                    <td className={`numeric ${map.winnerSide === "B" ? "font-black text-metal-accent" : ""}`}>{map.teamBScore}</td>
                    <td>{map.winnerSide === "A" ? teamAName : map.winnerSide === "B" ? teamBName : map.winnerTeam?.name || "-"}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="text-metal-muted">
                    No maps added yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
