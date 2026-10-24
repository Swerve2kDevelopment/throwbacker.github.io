import type { Metadata } from "next";
import { MatchKind } from "@prisma/client";

import { MatchCard } from "@/components/MatchCard";
import { FilterDropdown } from "@/components/ui/FilterDropdown";
import { prisma } from "@/lib/prisma";
import { attachRegisteredTeams } from "@/lib/registered-teams";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Matches"
};

export default async function MatchesPage({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  const resolvedSearchParams = await searchParams;
  const type = resolvedSearchParams.type || "all";
  const matches = await attachRegisteredTeams(
    await prisma.match.findMany({
    where:
      type === "standalone"
        ? { tournamentId: null }
        : type === "tournament"
          ? { tournamentId: { not: null } }
          : type === "league"
            ? { matchKind: MatchKind.LEAGUE }
            : type === "fun"
              ? { matchKind: MatchKind.FUN }
              : undefined,
    include: {
      tournament: true,
      league: true,
      teamA: true,
      teamB: true,
      maps: { orderBy: { order: "asc" } },
      participants: true
    },
    orderBy: [{ playedAt: "desc" }, { createdAt: "desc" }]
  })
  );

  return (
    <main className="page-shell">
      <div className="mb-5 flex flex-col gap-3 border-b border-metal-line pb-5 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="label text-metal-accent">Series archive</p>
          <h1 className="mt-1 text-3xl font-black">Matches</h1>
        </div>
        <form action="/matches" className="flex items-end gap-2">
          <FilterDropdown
            name="type"
            label="Type"
            value={type}
            options={[
              { value: "all", label: "All matches" },
              { value: "league", label: "League games" },
              { value: "fun", label: "Fun games" },
              { value: "tournament", label: "Tournament matches" },
              { value: "standalone", label: "Standalone matches" }
            ]}
          />
          <button className="button" type="submit">
            Apply
          </button>
        </form>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        {matches.length ? matches.map((match) => <MatchCard key={match.id} match={match} />) : <div className="subtle-panel p-5 text-metal-muted">No matches added yet.</div>}
      </div>
    </main>
  );
}
