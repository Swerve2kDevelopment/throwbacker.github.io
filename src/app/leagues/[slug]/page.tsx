import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { MatchCard } from "@/components/MatchCard";
import { StatCard } from "@/components/ui/StatCard";
import { formatDecimal } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { attachRegisteredTeams } from "@/lib/registered-teams";
import { calculateAggregateStats } from "@/lib/stats";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const league = await prisma.league.findUnique({ where: { slug } });

  return {
    title: league ? league.name : "League",
    description: league?.description || undefined
  };
}

export default async function LeaguePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const league = await prisma.league.findUnique({
    where: { slug },
    include: {
      matches: {
        include: {
          tournament: true,
          league: true,
          teamA: true,
          teamB: true,
          maps: true,
          participants: true
        },
        orderBy: [{ playedAt: "desc" }, { createdAt: "desc" }]
      }
    }
  });

  if (!league) notFound();

  const stats = await prisma.playerMapStats.findMany({
    where: {
      match: {
        leagueId: league.id
      }
    },
    include: {
      player: true
    }
  });

  const playerRows = Array.from(
    stats.reduce((map, stat) => {
      const existing = map.get(stat.playerId) || {
        player: stat.player,
        entries: [] as typeof stats
      };
      existing.entries.push(stat);
      map.set(stat.playerId, existing);
      return map;
    }, new Map<string, { player: (typeof stats)[number]["player"]; entries: typeof stats }>())
  )
    .map(([, value]) => ({
      player: value.player,
      aggregate: calculateAggregateStats(value.entries)
    }))
    .sort((a, b) => b.aggregate.rating - a.aggregate.rating || b.aggregate.kills - a.aggregate.kills || a.player.displayName.localeCompare(b.player.displayName))
    .slice(0, 5);

  league.matches = await attachRegisteredTeams(league.matches);
  const completedMatches = league.matches.filter((match) => match.status === "COMPLETED").length;
  const totalMaps = league.matches.reduce((sum, match) => sum + match.maps.length, 0);
  const uniquePlayerCount = new Set(league.matches.flatMap((match) => match.participants.map((participant) => participant.playerId))).size;

  return (
    <main className="page-shell">
      <section className="oscl-hero">
        <div className="oscl-hero-copy">
          <p className="eyebrow">League games</p>
          <h1>{league.name}</h1>
          <p>
            {league.description ||
              `Every 4v4 and 5v5 ${league.shortName || "league"} game on record: ${completedMatches} completed, ${totalMaps} maps, ${uniquePlayerCount} players. 1v1 and 2v2 games are tracked separately as fun games.`}
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Link className="button oscl-button" href="/matches?type=league">
              League Matches
            </Link>
            <Link className="button" href="/players">
              Player Rankings
            </Link>
          </div>
        </div>
        <div className="oscl-logo-stage">
          {league.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img alt="" src={league.logoUrl} />
          ) : (
            <span>{league.shortName || "OSCL"}</span>
          )}
        </div>
      </section>

      <section className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="League Matches" value={league.matches.length} helper={`${completedMatches} completed`} />
        <StatCard label="Maps Logged" value={totalMaps} helper="Across OSCL series" />
        <StatCard label="Players Featured" value={uniquePlayerCount} helper="From match rosters" />
        <StatCard label="Theme" value={league.shortName || "League"} helper={league.themeColor || "Lime green"} />
      </section>

      <section className="mt-8 grid gap-6 lg:grid-cols-[1fr_1.4fr]">
        <div>
          <div className="section-heading">
            <h2>OSCL Top Five</h2>
          </div>
          <div className="table-scroll">
            <table className="wiki-table">
              <thead>
                <tr>
                  <th>Player</th>
                  <th className="numeric">Rating</th>
                  <th className="numeric">K-D</th>
                  <th className="numeric">Maps</th>
                </tr>
              </thead>
              <tbody>
                {playerRows.length ? (
                  playerRows.map((row) => (
                    <tr key={row.player.id}>
                      <td>
                        <Link href={`/players/${row.player.slug}`} className="font-black hover:text-metal-accent">
                          {row.player.displayName}
                        </Link>
                      </td>
                      <td className="numeric font-black">{formatDecimal(row.aggregate.rating)}</td>
                      <td className="numeric">
                        {row.aggregate.kills}-{row.aggregate.deaths}
                      </td>
                      <td className="numeric">{row.aggregate.maps}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4} className="text-metal-muted">
                      No OSCL stats logged yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div>
          <div className="section-heading">
            <h2>League Match Feed</h2>
          </div>
          <div className="grid gap-3">
            {league.matches.length ? (
              league.matches.slice(0, 8).map((match) => <MatchCard key={match.id} match={match} />)
            ) : (
              <div className="subtle-panel p-5 text-metal-muted">No OSCL matches added yet.</div>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
