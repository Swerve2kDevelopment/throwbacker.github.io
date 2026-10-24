import Link from "next/link";
import { MatchKind } from "@prisma/client";

import { AdminForm, AdminStatusBanner } from "@/components/admin/AdminForm";
import { MatchForm } from "@/components/admin/MatchForm";
import { ConfirmDeleteModal } from "@/components/ui/ConfirmDeleteModal";
import { createMatchAction, deleteMatchAction } from "@/lib/admin-actions";
import { getMatchTitle } from "@/lib/match-utils";
import { assertAdminUser } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function AdminMatchesPage({
  searchParams
}: {
  searchParams: Promise<{ saved?: string; deleted?: string; error?: string; notice?: string; tournamentId?: string }>;
}) {
  await assertAdminUser();

  const resolvedSearchParams = await searchParams;
  const [matches, tournaments, leagues, teams, players] = await Promise.all([
    prisma.match.findMany({
      include: { tournament: true, league: true, teamA: true, teamB: true, maps: true, participants: true, _count: { select: { stats: true } } },
      orderBy: { playedAt: "desc" },
      take: 80
    }),
    prisma.tournament.findMany({ orderBy: { startDate: "desc" } }),
    prisma.league.findMany({ orderBy: { name: "asc" } }),
    prisma.team.findMany({ orderBy: { name: "asc" } }),
    prisma.player.findMany({ orderBy: { displayName: "asc" } })
  ]);

  return (
    <div>
      <AdminStatusBanner searchParams={resolvedSearchParams} />
      <div className="grid gap-5 2xl:grid-cols-[560px_1fr]">
        <AdminForm title="Log a Match" description="Paste the scoreboard and you're done. Stats, key moments and bans all save together.">
          <MatchForm
            action={createMatchAction}
            submitLabel="Save match"
            tournaments={tournaments}
            leagues={leagues}
            teams={teams}
            players={players}
            defaults={{ tournamentId: resolvedSearchParams.tournamentId }}
          />
        </AdminForm>

        <section className="panel p-4">
          <h2 className="mb-4 border-b border-metal-line pb-3 text-xl font-black">Matches</h2>
          <div className="table-scroll">
            <table className="wiki-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Match</th>
                  <th>Type</th>
                  <th>Tournament</th>
                  <th>League</th>
                  <th className="numeric">Score</th>
                  <th className="numeric">Maps</th>
                  <th className="numeric">Stats</th>
                  <th className="numeric">Actions</th>
                </tr>
              </thead>
              <tbody>
                {matches.length ? (
                  matches.map((match) => (
                    <tr key={match.id}>
                      <td>{match.playedAt?.toLocaleString("en-GB") || "TBD"}</td>
                      <td>
                        <Link href={`/admin/matches/${match.id}`} className="font-black hover:text-metal-accent">
                          {getMatchTitle(match)}
                        </Link>
                      </td>
                      <td>{match.matchKind === MatchKind.LEAGUE ? "League" : "Fun"}</td>
                      <td>{match.tournament?.name || "Standalone"}</td>
                      <td>{match.league?.shortName || match.league?.name || "-"}</td>
                      <td className="numeric">{match.scoreA}-{match.scoreB}</td>
                      <td className="numeric">{match.maps.length}</td>
                      <td className="numeric">{match._count.stats}</td>
                      <td>
                        <div className="flex justify-end gap-2">
                          <Link className="button" href={`/admin/matches/${match.id}`}>
                            Edit
                          </Link>
                          <form action={deleteMatchAction.bind(null, match.id)}>
                            <ConfirmDeleteModal />
                          </form>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={9} className="text-metal-muted">
                      No matches added yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
