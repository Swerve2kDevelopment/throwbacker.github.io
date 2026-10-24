import Link from "next/link";

import { StatCard } from "@/components/ui/StatCard";
import { assertAdminUser } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function AdminDashboardPage() {
  await assertAdminUser();

  const [players, teams, tournaments, matches, stats, admins] = await Promise.all([
    prisma.player.count(),
    prisma.team.count(),
    prisma.tournament.count(),
    prisma.match.count(),
    prisma.playerMapStats.count(),
    prisma.adminUser.count()
  ]);

  const recentStats = await prisma.playerMapStats.findMany({
    take: 8,
    orderBy: { updatedAt: "desc" },
    include: {
      player: true,
      tournament: true,
      mapGame: true
    }
  });

  return (
    <div className="space-y-6">
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard label="Players" value={players} />
        <StatCard label="Teams" value={teams} />
        <StatCard label="Tournaments" value={tournaments} />
        <StatCard label="Matches" value={matches} />
        <StatCard label="Map stat entries" value={stats} />
        <StatCard label="Approved admins" value={admins} />
      </section>

      <section className="panel p-4">
        <div className="mb-4 flex flex-col gap-3 border-b border-metal-line pb-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-xl font-black">Quick Actions</h2>
            <p className="text-sm text-metal-muted">Log a match with every player's stats in one paste, or pick this week's standout.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link className="button" href="/admin/players">
              Add player
            </Link>
            <Link className="button" href="/admin/stats">
              Single stat line
            </Link>
            <Link className="button" href="/admin/settings">
              Player of the Week
            </Link>
            <Link className="button button-primary" href="/admin/matches">
              Log a match
            </Link>
          </div>
        </div>

        <div className="table-scroll">
          <table className="wiki-table">
            <thead>
              <tr>
                <th>Updated</th>
                <th>Player</th>
                <th>Tournament</th>
                <th>Map</th>
                <th className="numeric">K-D</th>
              </tr>
            </thead>
            <tbody>
              {recentStats.length ? (
                recentStats.map((entry) => (
                  <tr key={entry.id}>
                    <td>{entry.updatedAt.toLocaleString("en-GB")}</td>
                    <td>{entry.player.displayName}</td>
                    <td>{entry.tournament?.name || "Standalone"}</td>
                    <td>{entry.mapGame.mapName}</td>
                    <td className="numeric">{entry.kills}-{entry.deaths}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="text-metal-muted">
                    No stats entered yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
