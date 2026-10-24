import type { Metadata } from "next";
import Link from "next/link";

import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Leagues"
};

export default async function LeaguesPage() {
  const leagues = await prisma.league.findMany({
    include: {
      _count: {
        select: { matches: true }
      }
    },
    orderBy: { name: "asc" }
  });

  return (
    <main className="page-shell">
      <div className="mb-5 border-b border-metal-line pb-5">
        <p className="eyebrow">Competitions</p>
        <h1 className="mt-1 text-3xl font-black">Leagues</h1>
        <p className="mt-2 max-w-3xl text-metal-muted">
          Each league keeps its own match feed and player table.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {leagues.length ? (
          leagues.map((league) => (
            <Link key={league.id} href={`/leagues/${league.slug}`} className="league-card">
              {league.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img alt="" src={league.logoUrl} className="h-20 w-20 object-contain" />
              ) : (
                <span className="flex h-20 w-20 items-center justify-center rounded-lg border border-metal-line bg-black text-xl font-black text-metal-accent">
                  {league.shortName || "LG"}
                </span>
              )}
              <span className="min-w-0">
                <span className="block text-sm font-black uppercase text-metal-accent">{league.shortName || "League"}</span>
                <span className="mt-1 block text-2xl font-black text-metal-text">{league.name}</span>
                <span className="mt-2 block text-sm font-bold text-metal-muted">
                  {league._count.matches} match{league._count.matches === 1 ? "" : "es"} logged
                </span>
              </span>
            </Link>
          ))
        ) : (
          <div className="subtle-panel p-5 text-metal-muted">No leagues added yet.</div>
        )}
      </div>
    </main>
  );
}
