import type { Metadata } from "next";
import Link from "next/link";

import { LeaderboardTable } from "@/components/LeaderboardTable";
import { FilterDropdown } from "@/components/ui/FilterDropdown";
import { prisma } from "@/lib/prisma";
import { getLeaderboardRows, leaderboardLabels, sortPlayersByMetric, type LeaderboardMetric } from "@/lib/stats";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Leaderboards"
};

const metrics = Object.keys(leaderboardLabels) as LeaderboardMetric[];

function metricParam(value?: string): LeaderboardMetric {
  return metrics.includes(value as LeaderboardMetric) ? (value as LeaderboardMetric) : "rating";
}

export default async function LeaderboardsPage({
  searchParams
}: {
  searchParams: Promise<{ metric?: string; tournament?: string }>;
}) {
  const resolvedSearchParams = await searchParams;
  const metric = metricParam(resolvedSearchParams.metric);
  const tournamentId = resolvedSearchParams.tournament || "";
  const [tournaments, rows] = await Promise.all([
    prisma.tournament.findMany({
      orderBy: { startDate: "desc" },
      select: { id: true, name: true }
    }),
    getLeaderboardRows(tournamentId || null)
  ]);

  const players = sortPlayersByMetric(rows, metric).slice(0, 100);

  return (
    <main className="page-shell">
      <div className="mb-5 border-b border-metal-line pb-5">
        <p className="label text-metal-accent">All-time and event stats</p>
        <h1 className="mt-1 text-3xl font-black">Leaderboards</h1>
      </div>

      <section className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex flex-wrap gap-2">
          {metrics.map((item) => {
            const params = new URLSearchParams({ metric: item });
            if (tournamentId) params.set("tournament", tournamentId);
            return (
              <Link key={item} href={`/leaderboards?${params.toString()}`} className={item === metric ? "button button-primary" : "button"}>
                {leaderboardLabels[item]}
              </Link>
            );
          })}
        </div>

        <form action="/leaderboards" className="flex items-end gap-2">
          <input type="hidden" name="metric" value={metric} />
          <FilterDropdown
            name="tournament"
            label="Tournament"
            value={tournamentId}
            options={[
              { value: "", label: "All-time" },
              ...tournaments.map((tournament) => ({
                value: tournament.id,
                label: tournament.name
              }))
            ]}
          />
          <button className="button" type="submit">
            Apply
          </button>
        </form>
      </section>

      <LeaderboardTable players={players} metric={metric} label={leaderboardLabels[metric]} />
    </main>
  );
}
