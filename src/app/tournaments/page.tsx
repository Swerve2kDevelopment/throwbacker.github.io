import type { Metadata } from "next";
import { TournamentStatus } from "@prisma/client";

import { TournamentCard } from "@/components/TournamentCard";
import { FilterDropdown } from "@/components/ui/FilterDropdown";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Tournaments"
};

export default async function TournamentsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const resolvedSearchParams = await searchParams;
  const rawStatus = resolvedSearchParams.status?.toUpperCase();
  const status = Object.values(TournamentStatus).includes(rawStatus as TournamentStatus) ? (rawStatus as TournamentStatus) : undefined;
  const tournaments = await prisma.tournament.findMany({
    where: status ? { status } : undefined,
    include: {
      tournamentTeams: {
        include: { team: true }
      }
    },
    orderBy: [{ featured: "desc" }, { startDate: "desc" }]
  });

  return (
    <main className="page-shell">
      <div className="mb-5 flex flex-col gap-3 border-b border-metal-line pb-5 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="label text-metal-accent">Event archive</p>
          <h1 className="mt-1 text-3xl font-black">Tournaments</h1>
        </div>
        <form action="/tournaments" className="flex items-end gap-2">
          <FilterDropdown
            name="status"
            label="Status"
            value={resolvedSearchParams.status || "ALL"}
            options={[
              { value: "ALL", label: "All" },
              { value: "UPCOMING", label: "Upcoming" },
              { value: "ONGOING", label: "Ongoing" },
              { value: "COMPLETED", label: "Completed" }
            ]}
          />
          <button className="button" type="submit">
            Apply
          </button>
        </form>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {tournaments.length ? (
          tournaments.map((tournament) => <TournamentCard key={tournament.id} tournament={tournament} />)
        ) : (
          <div className="subtle-panel p-5 text-metal-muted">No tournaments added yet.</div>
        )}
      </div>
    </main>
  );
}
