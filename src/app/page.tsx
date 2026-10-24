import Link from "next/link";
import { Crown, Flame, Radio, Sparkles, Swords, Trophy } from "lucide-react";
import { MatchStatus, TournamentStatus } from "@prisma/client";

import { RankBadge } from "@/components/RankBadge";
import { TournamentCard } from "@/components/TournamentCard";
import { Avatar } from "@/components/ui/Avatar";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatCard } from "@/components/ui/StatCard";
import { TeamLogo } from "@/components/ui/TeamLogo";
import { avatarFallback, formatDate, formatDateTime, formatDecimal } from "@/lib/format";
import { getMatchSideName, getMatchTitle } from "@/lib/match-utils";
import { prisma } from "@/lib/prisma";
import { attachRegisteredTeams } from "@/lib/registered-teams";
import { calculateAggregateStats, getPlayersWithAggregateStats, sortPlayersByMetric } from "@/lib/stats";

export const dynamic = "force-dynamic";

const matchInclude = {
  teamA: true,
  teamB: true,
  tournament: true,
  league: true,
  maps: { orderBy: { order: "asc" as const } },
  stats: { include: { player: true } }
};

export default async function HomePage() {
  const [playerOfWeek, keyMoments, recentMatchesRaw, activeTournaments, players, counts] = await Promise.all([
    prisma.playerOfWeek.findFirst({
      where: { weekStart: { lte: new Date() } },
      include: { player: { include: { currentTeam: true } } },
      orderBy: { weekStart: "desc" }
    }),
    prisma.playerKeyMoment.findMany({
      include: { player: true, match: { include: { teamA: true, teamB: true } } },
      orderBy: { createdAt: "desc" },
      take: 6
    }),
    prisma.match.findMany({
      where: { status: { in: [MatchStatus.COMPLETED, MatchStatus.LIVE] } },
      include: matchInclude,
      orderBy: [{ playedAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
      take: 6
    }),
    prisma.tournament.findMany({
      where: { OR: [{ featured: true }, { status: TournamentStatus.ONGOING }] },
      include: { tournamentTeams: { include: { team: true } } },
      orderBy: [{ status: "asc" }, { startDate: "desc" }],
      take: 2
    }),
    getPlayersWithAggregateStats(),
    Promise.all([prisma.player.count(), prisma.match.count({ where: { status: MatchStatus.COMPLETED } }), prisma.mapGame.count(), prisma.team.count()])
  ]);

  const recentMatches = await attachRegisteredTeams(recentMatchesRaw);
  const ranked = sortPlayersByMetric(
    players.filter((player) => player.aggregate.maps > 0),
    "mmr"
  );
  const topPlayer = ranked[0];
  const latestMatch = recentMatches[0];
  const potwStats = playerOfWeek ? players.find((player) => player.id === playerOfWeek.playerId) : null;

  const latestTopPerformer = latestMatch
    ? Array.from(
        latestMatch.stats.reduce((map, stat) => {
          const entry = map.get(stat.playerId) || { player: stat.player, entries: [] as typeof latestMatch.stats };
          entry.entries.push(stat);
          map.set(stat.playerId, entry);
          return map;
        }, new Map<string, { player: (typeof latestMatch.stats)[number]["player"]; entries: typeof latestMatch.stats }>())
      )
        .map(([, value]) => ({ player: value.player, aggregate: calculateAggregateStats(value.entries) }))
        .sort((a, b) => b.aggregate.rating - a.aggregate.rating)[0]
    : null;

  return (
    <main className="page-shell grid gap-6">
      <section className="home-hero">
        <div>
          <p className="eyebrow">Old Siege</p>
          <h1>
            Challengers <span>League</span>
          </h1>
          <p>
            {counts[1]} completed matches, {counts[2]} maps and {counts[0]} players on record.
            {latestMatch?.playedAt ? ` Last result logged ${formatDate(latestMatch.playedAt)}.` : ""}
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Link className="button button-primary" href="/matches">
              <Swords size={16} />
              Results
            </Link>
            <Link className="button" href="/leaderboards">
              Rankings
            </Link>
            <Link className="button" href="/tournaments">
              Tournaments
            </Link>
          </div>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img alt="OSCL" src="/league-logos/OSCL.png" className="home-hero-logo" />
      </section>

      <section>
        <div className="section-heading">
          <div>
            <p className="eyebrow">This week</p>
            <h2>League Pulse</h2>
          </div>
        </div>

        <div className="pulse-grid">
          {playerOfWeek ? (
            <article className="potw-card">
              <Link href={`/players/${playerOfWeek.player.slug}`} className="potw-avatar">
                {avatarFallback(playerOfWeek.player.displayName)}
                {playerOfWeek.player.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img alt="" src={playerOfWeek.player.avatarUrl} />
                ) : null}
              </Link>
              <div className="min-w-0">
                <p className="eyebrow inline-flex items-center gap-2">
                  <Crown size={14} />
                  Player of the Week · {formatDate(playerOfWeek.weekStart)}
                </p>
                <h2>
                  <Link href={`/players/${playerOfWeek.player.slug}`}>{playerOfWeek.player.displayName}</Link>
                </h2>
                <p className="potw-title">
                  {playerOfWeek.title || "Player of the Week"}
                  {playerOfWeek.player.currentTeam ? <span className="text-metal-muted"> · {playerOfWeek.player.currentTeam.name}</span> : null}
                </p>
                {playerOfWeek.note ? <p className="potw-note">{playerOfWeek.note}</p> : null}
                {potwStats ? (
                  <div className="potw-stats">
                    <div>
                      <span>Rating</span>
                      <strong>{formatDecimal(potwStats.aggregate.rating)}</strong>
                    </div>
                    <div>
                      <span>K/D</span>
                      <strong>{formatDecimal(potwStats.aggregate.kd)}</strong>
                    </div>
                    <div>
                      <span>MMR</span>
                      <strong>{potwStats.rank.mmr}</strong>
                    </div>
                    <div>
                      <span>Maps</span>
                      <strong>{potwStats.aggregate.maps}</strong>
                    </div>
                  </div>
                ) : null}
              </div>
            </article>
          ) : (
            <div className="potw-empty">
              <div>
                <Crown className="mx-auto mb-2 text-metal-accent" size={22} />
                No Player of the Week picked yet.
              </div>
            </div>
          )}

          <div className="pulse-stack">
            {latestMatch ? (
              <Link href={`/matches/${latestMatch.id}`} className="result-card">
                <div className="flex items-center justify-between gap-2">
                  <p className="label inline-flex items-center gap-2">
                    <Radio size={13} className="text-metal-accent" />
                    {latestMatch.status === MatchStatus.LIVE ? "Live now" : "Latest result"}
                  </p>
                  <span className="label">{formatDateTime(latestMatch.playedAt)}</span>
                </div>
                <div className="result-score">
                  <div className={`result-side${latestMatch.winnerSide === "A" ? " is-winner" : ""}`}>
                    <TeamLogo team={latestMatch.teamA} />
                    <span>{getMatchSideName(latestMatch, "A")}</span>
                  </div>
                  <div className="result-numbers">
                    {latestMatch.winnerSide === "A" ? <b>{latestMatch.scoreA}</b> : latestMatch.scoreA}
                    <span className="mx-2 text-metal-muted">-</span>
                    {latestMatch.winnerSide === "B" ? <b>{latestMatch.scoreB}</b> : latestMatch.scoreB}
                  </div>
                  <div className={`result-side${latestMatch.winnerSide === "B" ? " is-winner" : ""}`}>
                    <TeamLogo team={latestMatch.teamB} />
                    <span>{getMatchSideName(latestMatch, "B")}</span>
                  </div>
                </div>
                <div className="result-meta">
                  <span>{latestMatch.maps.map((map) => map.mapName).join(", ") || "Map not listed"}</span>
                  <span>{latestMatch.tournament?.name || latestMatch.league?.shortName || (latestMatch.matchKind === "LEAGUE" ? "League" : "Fun game")}</span>
                  {latestTopPerformer ? (
                    <span>
                      Top: <strong className="text-metal-text">{latestTopPerformer.player.displayName}</strong> {latestTopPerformer.aggregate.kills}/{latestTopPerformer.aggregate.deaths}/
                      {latestTopPerformer.aggregate.assists} ({formatDecimal(latestTopPerformer.aggregate.rating)})
                    </span>
                  ) : null}
                </div>
              </Link>
            ) : (
              <EmptyState message="No completed matches yet." />
            )}

            {topPlayer ? (
              <Link href={`/players/${topPlayer.slug}`} className="leader-card">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img alt="" src={topPlayer.rank.image} />
                <div className="min-w-0">
                  <p className="label">Top ranked player</p>
                  <strong>{topPlayer.displayName}</strong>
                  <em>
                    <span style={{ color: topPlayer.rank.color }}>{topPlayer.rank.name}</span> · {topPlayer.rank.mmr} MMR · {formatDecimal(topPlayer.aggregate.rating)} rating
                  </em>
                </div>
                <span className="ml-auto">
                  <Avatar player={topPlayer} size="lg" />
                </span>
              </Link>
            ) : null}
          </div>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <div>
          <div className="section-heading">
            <h2 className="inline-flex items-center gap-2">
              <Sparkles size={18} className="text-metal-accent" />
              Key Moments
            </h2>
          </div>
          <div className="moment-feed">
            {keyMoments.length ? (
              keyMoments.map((moment) => (
                <Link key={moment.id} href={`/matches/${moment.matchId}`} className="moment-card">
                  <Avatar player={moment.player} />
                  <div>
                    <strong>
                      {moment.player.displayName} <span className="inline font-semibold text-metal-text">{moment.text}</span>
                    </strong>
                    <span>{getMatchTitle(moment.match)}</span>
                  </div>
                </Link>
              ))
            ) : (
              <EmptyState message="Key moments added to matches show up here." />
            )}
          </div>
        </div>

        <div>
          <div className="section-heading">
            <h2 className="inline-flex items-center gap-2">
              <Swords size={18} className="text-metal-accent" />
              Recent Results
            </h2>
            <Link href="/matches" className="section-link">
              All matches
            </Link>
          </div>
          <div className="grid gap-2">
            {recentMatches.length ? (
              recentMatches.slice(0, 5).map((match) => (
                <Link key={match.id} href={`/matches/${match.id}`} className="feed-row">
                  <span>{getMatchTitle(match)}</span>
                  <strong>
                    {match.scoreA}-{match.scoreB}
                  </strong>
                  <em>{match.maps[0]?.mapName || `${match.format}v${match.format}`}</em>
                </Link>
              ))
            ) : (
              <EmptyState message="No results yet." />
            )}
          </div>
        </div>
      </section>

      <section className="kpi-row">
        <StatCard label="Players" value={counts[0]} />
        <StatCard label="Teams" value={counts[3]} />
        <StatCard label="Matches" value={counts[1]} />
        <StatCard label="Maps played" value={counts[2]} />
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
        <div>
          <div className="section-heading">
            <h2 className="inline-flex items-center gap-2">
              <Trophy size={18} className="text-metal-accent" />
              MMR Top 5
            </h2>
            <Link href="/leaderboards" className="section-link">
              Full rankings
            </Link>
          </div>
          <table className="wiki-table">
            <thead>
              <tr>
                <th>Player</th>
                <th>Rank</th>
                <th className="numeric">MMR</th>
                <th className="numeric">Rating</th>
              </tr>
            </thead>
            <tbody>
              {ranked.length ? (
                ranked.slice(0, 5).map((player, index) => (
                  <tr key={player.id} className={index === 0 ? "highlight" : undefined}>
                    <td>
                      <Link href={`/players/${player.slug}`} className="player-cell">
                        <Avatar player={player} />
                        <strong>{player.displayName}</strong>
                      </Link>
                    </td>
                    <td>
                      <RankBadge rank={player.rank} compact />
                    </td>
                    <td className="numeric font-black" style={{ color: player.rank.color }}>
                      {player.rank.mmr}
                    </td>
                    <td className="numeric">{formatDecimal(player.aggregate.rating)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4} className="text-metal-muted">
                    No ranked players yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div>
          <div className="section-heading">
            <h2 className="inline-flex items-center gap-2">
              <Flame size={18} className="text-metal-accent" />
              Tournaments
            </h2>
            <Link href="/tournaments" className="section-link">
              All events
            </Link>
          </div>
          <div className="grid gap-3">
            {activeTournaments.length ? (
              activeTournaments.map((tournament) => <TournamentCard key={tournament.id} tournament={tournament} />)
            ) : (
              <EmptyState message="No featured or running tournaments." />
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
