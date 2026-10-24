import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BracketType, MatchStatus } from "@prisma/client";

import { Bracket } from "@/components/Bracket";
import { LeaderboardTable } from "@/components/LeaderboardTable";
import { MatchCard } from "@/components/MatchCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatCard } from "@/components/ui/StatCard";
import { Tabs } from "@/components/ui/Tabs";
import { TeamLogo } from "@/components/ui/TeamLogo";
import { buildEliminationBracket, buildStandings } from "@/lib/bracket";
import { avatarFallback, formatDate, formatDecimal, formatPercent, statusLabel } from "@/lib/format";
import { getAuthSession } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { attachRegisteredTeams } from "@/lib/registered-teams";
import { calculateAggregateStats, getPlayersWithAggregateStats, sortPlayersByMetric } from "@/lib/stats";
import { toggleFavoriteTournamentAction } from "@/lib/viewer-actions";

export const dynamic = "force-dynamic";

const bracketLabels: Record<BracketType, string> = {
  SINGLE_ELIMINATION: "Single Elimination",
  DOUBLE_ELIMINATION: "Double Elimination",
  ROUND_ROBIN: "Round Robin",
  SWISS: "Swiss",
  GROUP_STAGE: "Group Stage"
};

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const tournament = await prisma.tournament.findUnique({
    where: { slug },
    select: { name: true, description: true, updatedAt: true, bracketType: true }
  });

  if (!tournament) return { title: "Tournament" };
  const imageUrl = `/tournaments/${slug}/opengraph-image?v=${tournament.updatedAt.getTime()}`;
  const description = tournament.description || `${tournament.name}: ${bracketLabels[tournament.bracketType].toLowerCase()} bracket, results and player stats.`;

  return {
    title: tournament.name,
    description,
    openGraph: {
      title: `${tournament.name} | OSCL`,
      description,
      url: `/tournaments/${slug}`,
      images: [{ url: imageUrl, width: 1200, height: 630, type: "image/png", alt: `${tournament.name}` }]
    },
    twitter: {
      card: "summary_large_image",
      title: `${tournament.name} | OSCL`,
      description,
      images: [imageUrl]
    }
  };
}

export default async function TournamentProfilePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const session = await getAuthSession();
  const tournament = await prisma.tournament.findUnique({
    where: { slug },
    include: {
      tournamentTeams: {
        include: { team: true },
        orderBy: [{ finalPlacement: "asc" }, { seed: "asc" }]
      },
      mvpPlayer: true,
      matches: {
        include: {
          teamA: true,
          teamB: true,
          winnerTeam: true,
          tournament: true,
          league: true,
          maps: { orderBy: { order: "asc" } },
          participants: true
        },
        orderBy: [{ playedAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }]
      },
      stats: {
        include: { player: true, team: true }
      }
    }
  });

  if (!tournament) notFound();
  tournament.matches = await attachRegisteredTeams(tournament.matches);

  const favorite = session?.user?.id
    ? await prisma.favoriteTournament.findUnique({
        where: { userId_tournamentId: { userId: session.user.id, tournamentId: tournament.id } }
      })
    : null;

  const aggregate = calculateAggregateStats(tournament.stats);
  const leaders = sortPlayersByMetric(
    (await getPlayersWithAggregateStats({ tournamentId: tournament.id })).filter((player) => player.aggregate.maps > 0),
    "rating"
  );
  const bestRatedPlayers = leaders.slice(0, 6);
  const playerCount = new Set(tournament.stats.map((stat) => stat.playerId)).size;
  const entries = tournament.tournamentTeams.map((entry) => ({ seed: entry.seed, team: entry.team }));
  const isElimination = tournament.bracketType === BracketType.SINGLE_ELIMINATION || tournament.bracketType === BracketType.DOUBLE_ELIMINATION;
  const bracket = isElimination && entries.length >= 2 ? buildEliminationBracket(entries, tournament.matches, tournament.bracketType) : null;
  const standings = buildStandings(entries, tournament.matches);

  const liveGames = tournament.matches.filter((match) => match.status === MatchStatus.LIVE);
  const upcomingGames = tournament.matches.filter((match) => match.status === MatchStatus.SCHEDULED).reverse();
  const completedGames = tournament.matches.filter((match) => match.status === MatchStatus.COMPLETED);
  const champion = tournament.tournamentTeams.find((entry) => entry.finalPlacement === 1)?.team;

  const mapStats = Array.from(
    tournament.matches
      .flatMap((match) => match.maps)
      .reduce((map, mapGame) => {
        const row = map.get(mapGame.mapName) || { mapName: mapGame.mapName, played: 0, rounds: 0, sideAWins: 0, sideBWins: 0, closest: Infinity };
        row.played += 1;
        row.rounds += mapGame.teamAScore + mapGame.teamBScore;
        if (mapGame.winnerSide === "A") row.sideAWins += 1;
        if (mapGame.winnerSide === "B") row.sideBWins += 1;
        row.closest = Math.min(row.closest, Math.abs(mapGame.teamAScore - mapGame.teamBScore));
        map.set(mapGame.mapName, row);
        return map;
      }, new Map<string, { mapName: string; played: number; rounds: number; sideAWins: number; sideBWins: number; closest: number }>())
      .values()
  ).sort((a, b) => b.played - a.played || a.mapName.localeCompare(b.mapName));
  const maxMapPlayed = Math.max(1, ...mapStats.map((row) => row.played));
  const totalMaps = mapStats.reduce((sum, row) => sum + row.played, 0);
  const favoriteAction = toggleFavoriteTournamentAction.bind(null, tournament.id, tournament.slug);

  const standingsTable = (
    <div className="table-scroll">
      <table className="wiki-table standings-table">
        <thead>
          <tr>
            <th className="numeric">#</th>
            <th>Team</th>
            <th className="numeric">P</th>
            <th className="numeric">W</th>
            <th className="numeric">L</th>
            <th className="numeric">Maps</th>
            <th className="numeric">Seed</th>
          </tr>
        </thead>
        <tbody>
          {standings.length ? (
            standings.map((row, index) => (
              <tr key={row.team.id} className={index === 0 && row.wins ? "highlight" : undefined}>
                <td className="numeric">{index + 1}</td>
                <td>
                  <Link href={`/teams/${row.team.slug}`} className="inline-flex items-center gap-2 font-bold text-metal-text hover:text-metal-accent">
                    <TeamLogo team={row.team} />
                    {row.team.name}
                  </Link>
                </td>
                <td className="numeric">{row.played}</td>
                <td className="numeric font-black text-metal-accent">{row.wins}</td>
                <td className="numeric">{row.losses}</td>
                <td className="numeric">
                  {row.mapsWon}-{row.mapsLost}
                </td>
                <td className="numeric text-metal-muted">{row.seed || "-"}</td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={7} className="text-metal-muted">
                No teams added yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );

  const bracketTab = (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
      <div className="tournament-bracket-panel min-w-0">
        <div className="section-heading">
          <div>
            <p className="eyebrow">{bracketLabels[tournament.bracketType]}</p>
            <h2>{isElimination ? "Bracket" : "Standings"}</h2>
          </div>
          {champion ? (
            <span className="league-pill">
              Champion: {champion.name}
            </span>
          ) : null}
        </div>
        {bracket ? (
          <>
            <Bracket stages={bracket.stages} />
            {bracket.unplaced.length ? (
              <div className="bracket-note">
                {bracket.unplaced.length} game{bracket.unplaced.length === 1 ? " isn't" : "s aren't"} in a bracket slot yet. Staff can place games from the tournament editor; games between the two teams a slot expects are placed automatically.
              </div>
            ) : null}
          </>
        ) : isElimination ? (
          <EmptyState message="Add at least two teams to draw the bracket." />
        ) : (
          standingsTable
        )}
      </div>

      <div className="tournament-side-stack">
        <div className="panel p-4">
          <p className="eyebrow">Map veto</p>
          {tournament.mapVetoes.length ? (
            <ul className="mt-3 space-y-2 text-sm font-semibold">
              {tournament.mapVetoes.map((veto, index) => (
                <li key={`${veto}-${index}`} className="border-l-2 border-metal-accent pl-3 text-metal-text">
                  {veto}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-metal-muted">No map veto set.</p>
          )}
        </div>
        <div className="panel p-4">
          <p className="eyebrow">Operator bans</p>
          {tournament.operatorBans.length ? (
            <ul className="mt-3 space-y-2 text-sm font-semibold">
              {tournament.operatorBans.map((ban, index) => (
                <li key={`${ban}-${index}`} className="border-l-2 border-red-500 pl-3 text-metal-text">
                  {ban}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-metal-muted">No tournament-wide bans.</p>
          )}
        </div>
      </div>
    </div>
  );

  const gameGroup = (title: string, games: typeof tournament.matches) =>
    games.length ? (
      <section>
        <div className="section-heading">
          <h2>{title}</h2>
          <span className="label">{games.length}</span>
        </div>
        <div className="tournament-game-grid">
          {games.map((match) => (
            <MatchCard key={match.id} match={match} />
          ))}
        </div>
      </section>
    ) : null;

  const gamesTab = tournament.matches.length ? (
    <div className="grid gap-6">
      {gameGroup("Live", liveGames)}
      {gameGroup("Upcoming", upcomingGames)}
      {gameGroup("Results", completedGames)}
    </div>
  ) : (
    <EmptyState message="No games added yet." />
  );

  const statsTab = (
    <div className="grid gap-6">
      <section>
        <div className="section-heading">
          <div>
            <p className="eyebrow">Rating race</p>
            <h2>Best Rated Players</h2>
          </div>
        </div>
        {bestRatedPlayers.length ? (
          <div className="rated-player-grid">
            {bestRatedPlayers.map((player, index) => (
              <Link key={player.id} href={`/players/${player.slug}`} className="rated-player-card">
                <span className="rated-player-rank">#{index + 1}</span>
                <div className="rated-player-avatar">
                  <span>{avatarFallback(player.displayName)}</span>
                  {player.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img alt="" src={player.avatarUrl} />
                  ) : null}
                </div>
                <div className="min-w-0">
                  <strong>{player.displayName}</strong>
                  <em>{player.realName || player.currentTeam?.name || "Free agent"}</em>
                </div>
                <div className="rated-player-stat">
                  <span>
                    {player.aggregate.kills}/{player.aggregate.deaths}/{player.aggregate.assists} · {player.aggregate.maps} maps
                  </span>
                  <strong>{formatDecimal(player.aggregate.rating)}</strong>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <EmptyState message="No player stats entered for this tournament yet." />
        )}
      </section>

      <section className="grid gap-5 lg:grid-cols-[1.3fr_1fr]">
        <div className="panel p-4">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Map statistics</p>
              <h2>Map Pool</h2>
            </div>
            <span className="label">{totalMaps} maps played</span>
          </div>
          {mapStats.length ? (
            <div className="map-graph-list">
              {mapStats.map((row) => {
                const decided = row.sideAWins + row.sideBWins;
                return (
                  <div key={row.mapName} className="map-graph-row">
                    <div className="map-graph-head">
                      <strong>{row.mapName}</strong>
                      <span>
                        {row.played}× · {Math.round((row.played / Math.max(totalMaps, 1)) * 100)}% pick rate
                      </span>
                    </div>
                    <div className="map-graph-track">
                      <div style={{ width: `${Math.max(6, (row.played / maxMapPlayed) * 100)}%` }} />
                    </div>
                    <p>
                      Avg {formatDecimal(row.rounds / row.played, 1)} rounds
                      {Number.isFinite(row.closest) ? ` · closest finish ${row.closest === 0 ? "level" : `${row.closest}-round margin`}` : ""}
                      {decided ? ` · Team A side ${row.sideAWins}-${row.sideBWins}` : ""}
                    </p>
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyState message="No maps logged yet." />
          )}
        </div>

        <div className="panel p-4">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Tournament totals</p>
              <h2>Summary</h2>
            </div>
          </div>
          <div className="tournament-summary-grid">
            <StatCard label="Kills" value={aggregate.kills} />
            <StatCard label="Deaths" value={aggregate.deaths} />
            <StatCard label="K/D" value={formatDecimal(aggregate.kd)} />
            <StatCard label="HS%" value={formatPercent(aggregate.hsPercent)} />
            <StatCard label="Avg rating" value={formatDecimal(aggregate.rating)} />
            <StatCard label="Players" value={playerCount} />
          </div>
        </div>
      </section>

      <section>
        <div className="section-heading">
          <h2>All Players</h2>
        </div>
        <LeaderboardTable players={leaders} metric="rating" label="Rating" />
      </section>
    </div>
  );

  const teamsTab = (
    <div className="grid gap-5 lg:grid-cols-2">
      <div>
        <div className="section-heading">
          <h2>Final Placements</h2>
        </div>
        <div className="table-scroll">
          <table className="wiki-table standings-table">
            <thead>
              <tr>
                <th className="numeric">Place</th>
                <th>Team</th>
                <th className="numeric">Seed</th>
              </tr>
            </thead>
            <tbody>
              {tournament.tournamentTeams.length ? (
                tournament.tournamentTeams.map((entry) => (
                  <tr key={entry.id}>
                    <td className="numeric">{entry.finalPlacement || "-"}</td>
                    <td>
                      <Link href={`/teams/${entry.team.slug}`} className="inline-flex items-center gap-2 font-bold text-metal-text hover:text-metal-accent">
                        <TeamLogo team={entry.team} />
                        {entry.team.name}
                      </Link>
                    </td>
                    <td className="numeric">{entry.seed || "-"}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={3} className="text-metal-muted">
                    No teams added yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      {isElimination ? (
        <div>
          <div className="section-heading">
            <h2>Match Record</h2>
          </div>
          {standingsTable}
        </div>
      ) : null}
    </div>
  );

  return (
    <main className="page-shell grid gap-5">
      <section className="tournament-hero">
        {tournament.bannerUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img alt="" src={tournament.bannerUrl} className="tournament-hero-bg" />
        ) : null}
        <div className="tournament-hero-glow" />
        <div className="tournament-hero-main">
          <div className="tournament-hero-logo">
            {tournament.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img alt="" src={tournament.logoUrl} />
            ) : (
              <span>{tournament.name.slice(0, 1)}</span>
            )}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="event-chip event-chip-accent">{bracketLabels[tournament.bracketType]}</span>
              <span className={`status-pill status-${tournament.status.toLowerCase()}`}>{statusLabel(tournament.status)}</span>
            </div>
            <h1>{tournament.name}</h1>
            <p>
              {formatDate(tournament.startDate)}
              {tournament.endDate ? ` – ${formatDate(tournament.endDate)}` : ""}
              {tournament.prizePool ? ` · ${tournament.prizePool}` : ""}
            </p>
            {tournament.description ? <p className="tournament-hero-description">{tournament.description}</p> : null}
          </div>
        </div>
        <div className="tournament-hero-side">
          <div className="tournament-quick-grid">
            <div>
              <span>Teams</span>
              <strong>{tournament.tournamentTeams.length}</strong>
            </div>
            <div>
              <span>Players</span>
              <strong>{playerCount}</strong>
            </div>
            <div>
              <span>Games</span>
              <strong>
                {completedGames.length}/{tournament.matches.length}
              </strong>
            </div>
            <div>
              <span>Maps</span>
              <strong>{totalMaps}</strong>
            </div>
          </div>
          <div className="tournament-hero-mvp">
            <span>{champion ? "Champion" : "MVP"}</span>
            {champion ? (
              <Link href={`/teams/${champion.slug}`}>{champion.name}</Link>
            ) : tournament.mvpPlayer ? (
              <Link href={`/players/${tournament.mvpPlayer.slug}`}>{tournament.mvpPlayer.displayName}</Link>
            ) : (
              <strong>TBD</strong>
            )}
          </div>
          <form action={favoriteAction}>
            <button className="button w-full" type="submit">
              {favorite ? "Remove from watchlist" : "Watch tournament"}
            </button>
          </form>
        </div>
      </section>

      <Tabs
        tabs={[
          { id: "bracket", label: isElimination ? "Bracket" : "Standings", content: bracketTab },
          { id: "games", label: "Games", count: tournament.matches.length, content: gamesTab },
          { id: "stats", label: "Stats", content: statsTab },
          { id: "teams", label: "Teams", count: tournament.tournamentTeams.length, content: teamsTab }
        ]}
      />
    </main>
  );
}
