import type { Metadata } from "next";
import Link from "next/link";
import { TransferRequestStatus } from "@prisma/client";

import { TeamCard } from "@/components/TeamCard";
import { SearchInput } from "@/components/ui/SearchInput";
import { formatDateTime } from "@/lib/format";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Teams"
};

export default async function TeamsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const resolvedSearchParams = await searchParams;
  const q = resolvedSearchParams.q?.trim().toLowerCase() || "";
  const [teams, transferEvents, transferRequests] = await Promise.all([
    prisma.team.findMany({
    include: {
      currentPlayers: {
        orderBy: { displayName: "asc" }
      },
      tournamentTeams: true,
      matchWins: true
    },
    orderBy: { name: "asc" }
    }),
    prisma.transferEvent.findMany({
      include: {
        team: true,
        player: true
      },
      orderBy: { createdAt: "desc" },
      take: 12
    }),
    prisma.transferRequest.findMany({
      where: { status: TransferRequestStatus.PENDING },
      include: {
        team: true,
        player: true
      },
      orderBy: { createdAt: "desc" },
      take: 12
    })
  ]);

  const filtered = teams.filter((team) => {
    if (!q) return true;
    return [team.name, team.tag, team.region, ...team.currentPlayers.map((player) => player.displayName)]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(q));
  });
  const transferFeed = [
    ...transferEvents.map((event) => ({
      id: `event-${event.id}`,
      date: event.createdAt,
      label: event.type,
      content: (
        <>
          <Link href={`/players/${event.player.slug}`} className="hover:text-metal-accent">{event.player.displayName}</Link>{" "}
          {event.type === "JOINED" ? "joined" : event.type === "LEFT" ? "left" : "was benched on"}{" "}
          <Link href={`/teams/${event.team.slug}`} className="hover:text-metal-accent">{event.team.name}</Link>
        </>
      )
    })),
    ...transferRequests.map((request) => ({
      id: `request-${request.id}`,
      date: request.createdAt,
      label: "REQUEST",
      content: (
        <>
          <Link href={`/teams/${request.team.slug}`} className="hover:text-metal-accent">{request.team.name}</Link>{" "}
          are looking to sign{" "}
          <Link href={`/players/${request.player.slug}`} className="hover:text-metal-accent">{request.player.displayName}</Link>
        </>
      )
    }))
  ]
    .sort((a, b) => Number(b.date) - Number(a.date))
    .slice(0, 12);

  return (
    <main className="page-shell">
      <div className="mb-5 flex flex-col gap-3 border-b border-metal-line pb-5 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="label text-metal-accent">Team database</p>
          <h1 className="mt-1 text-3xl font-black">Teams</h1>
        </div>
        <SearchInput defaultValue={resolvedSearchParams.q} placeholder="Search teams or players" action="/teams" />
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {filtered.length ? filtered.map((team) => <TeamCard key={team.id} team={team} />) : <div className="subtle-panel p-5 text-metal-muted">No teams added yet.</div>}
      </div>

      <section className="mt-8">
        <div className="section-heading">
          <h2>Transfer History</h2>
        </div>
        <div className="panel p-4">
          <div className="grid gap-2">
            {transferFeed.length ? (
              transferFeed.map((item) => (
                <div key={item.id} className="feed-row">
                  <span>{item.content}</span>
                  <strong>{item.label}</strong>
                  <em>{formatDateTime(item.date)}</em>
                </div>
              ))
            ) : (
              <div className="subtle-panel p-4 text-sm font-semibold text-metal-muted">No transfer history yet.</div>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
