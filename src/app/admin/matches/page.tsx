import Link from "next/link";
import { MatchKind } from "@prisma/client";

import { AdminForm, AdminStatusBanner } from "@/components/admin/AdminForm";
import { MatchForm } from "@/components/admin/MatchForm";
import { ConfirmDeleteModal } from "@/components/ui/ConfirmDeleteModal";
import { createMatchAction, deleteMatchAction } from "@/lib/admin-actions";
import { getMatchTitle } from "@/lib/match-utils";
import { assertAdminUser } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { ingestPayloadSchema, submissionToBuilder } from "@/lib/stats-ingest";

export const dynamic = "force-dynamic";

export default async function AdminMatchesPage({
  searchParams
}: {
  searchParams: Promise<{ saved?: string; deleted?: string; error?: string; notice?: string; tournamentId?: string; submission?: string }>;
}) {
  await assertAdminUser();

  const resolvedSearchParams = await searchParams;
  const [matches, tournaments, leagues, teams, players, operators] = await Promise.all([
    prisma.match.findMany({
      include: { tournament: true, league: true, teamA: true, teamB: true, maps: true, participants: true, _count: { select: { stats: true } } },
      orderBy: { playedAt: "desc" },
      take: 80
    }),
    prisma.tournament.findMany({ orderBy: { startDate: "desc" } }),
    prisma.league.findMany({ orderBy: { name: "asc" } }),
    prisma.team.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, tag: true, logoUrl: true } }),
    prisma.player.findMany({ orderBy: { displayName: "asc" }, select: { id: true, displayName: true, realName: true, avatarUrl: true, currentTeamId: true, aliases: true, inGameName: true } }),
    prisma.operatorIcon.findMany({ orderBy: { name: "asc" }, select: { name: true, iconPath: true } })
  ]);

  // Reviewing a tracker upload: prefill the builder from its scoreboard.
  const submission = resolvedSearchParams.submission
    ? await prisma.statsSubmission.findFirst({ where: { id: resolvedSearchParams.submission, status: "PENDING" }, include: { hostKey: true } })
    : null;
  const parsed = submission ? ingestPayloadSchema.safeParse(submission.payload) : null;
  const upload = parsed?.success ? { payload: parsed.data, ...(await submissionToBuilder(parsed.data)) } : null;

  return (
    <div>
      <AdminStatusBanner searchParams={resolvedSearchParams} />
      {resolvedSearchParams.submission && !upload ? <div className="notice-banner">That upload was already reviewed or no longer exists.</div> : null}
      {upload ? (
        <div className="notice-banner">
          Reviewing an upload from {submission?.hostKey?.label || "a host"}
          {upload.payload.build ? ` (${upload.payload.build})` : ""}. Check the scoreboard, then save.
          {upload.unknown.length ? (
            <>
              {" "}
              Not matched to a player: <strong>{upload.unknown.join(", ")}</strong>. Set their in-game name on the player page, then reopen this upload.
            </>
          ) : null}
        </div>
      ) : null}
      <div className="grid gap-5">
        <AdminForm title={upload ? "Review tracker upload" : "Log a Match"} description="Pick the teams, fill in the scoreboard, click the bans. Everything saves together.">
          <MatchForm
            action={createMatchAction}
            submitLabel="Save match"
            tournaments={tournaments}
            leagues={leagues}
            teams={teams}
            players={players}
            operators={operators}
            builder={upload?.builder}
            submissionId={upload ? submission?.id : undefined}
            defaults={{ tournamentId: resolvedSearchParams.tournamentId, playedAt: upload?.payload.playedAt }}
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
