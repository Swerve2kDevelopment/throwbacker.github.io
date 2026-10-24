import Link from "next/link";
import { BracketType, TournamentStatus } from "@prisma/client";

import { AdminForm, AdminStatusBanner, Field } from "@/components/admin/AdminForm";
import { ConfirmDeleteModal } from "@/components/ui/ConfirmDeleteModal";
import { createTournamentAction, deleteTournamentAction } from "@/lib/admin-actions";
import { assertAdminUser } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const bracketLabels: Record<BracketType, string> = {
  SINGLE_ELIMINATION: "Single elimination",
  DOUBLE_ELIMINATION: "Double elimination",
  ROUND_ROBIN: "Round robin",
  SWISS: "Swiss",
  GROUP_STAGE: "Group stage"
};

export default async function AdminTournamentsPage({
  searchParams
}: {
  searchParams: Promise<{ saved?: string; deleted?: string; error?: string; notice?: string }>;
}) {
  await assertAdminUser();

  const resolvedSearchParams = await searchParams;
  const [tournaments, teams, players] = await Promise.all([
    prisma.tournament.findMany({
      include: { tournamentTeams: true },
      orderBy: { startDate: "desc" }
    }),
    prisma.team.findMany({ orderBy: { name: "asc" } }),
    prisma.player.findMany({ orderBy: { displayName: "asc" } })
  ]);

  return (
    <div>
      <AdminStatusBanner searchParams={resolvedSearchParams} />
      <div className="grid gap-5 xl:grid-cols-[420px_1fr]">
        <AdminForm title="Add Tournament">
          <form action={createTournamentAction} className="grid gap-3">
            <Field label="Name">
              <input className="input" name="name" required />
            </Field>
            <Field label="Slug">
              <input className="input" name="slug" placeholder="auto-generated if blank" />
            </Field>
            <Field label="Description">
              <textarea className="input min-h-24" name="description" />
            </Field>
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Status">
                <select className="input" name="status" defaultValue={TournamentStatus.UPCOMING}>
                  {Object.values(TournamentStatus).map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Prize pool">
                <input className="input" name="prizePool" />
              </Field>
            </div>
            <Field label="Bracket format">
              <select className="input" name="bracketType" defaultValue={BracketType.SINGLE_ELIMINATION}>
                {Object.values(BracketType).map((type) => (
                  <option key={type} value={type}>
                    {bracketLabels[type]}
                  </option>
                ))}
              </select>
            </Field>
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Start date">
                <input className="input" type="date" name="startDate" />
              </Field>
              <Field label="End date">
                <input className="input" type="date" name="endDate" />
              </Field>
            </div>
            <Field label="Logo URL">
              <input className="input" name="logoUrl" />
            </Field>
            <Field label="Banner URL">
              <input className="input" name="bannerUrl" />
            </Field>
            <Field label="Tournament MVP">
              <select className="input" name="mvpPlayerId" defaultValue="">
                <option value="">No MVP selected</option>
                {players.map((player) => (
                  <option key={player.id} value={player.id}>
                    {player.displayName}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Map vetoes">
              <textarea className="input min-h-24" name="mapVetoes" placeholder="One veto per line: Team A bans Border" />
            </Field>
            <Field label="Operator bans">
              <textarea className="input min-h-24" name="operatorBans" placeholder="One ban per line: Team B bans Azami" />
            </Field>
            <Field label="Teams">
              <select className="input min-h-36" name="selectedTeamIds" multiple>
                {teams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name}
                  </option>
                ))}
              </select>
            </Field>
            <label className="flex items-center gap-2 text-sm font-bold text-metal-muted">
              <input type="checkbox" name="featured" />
              Featured on homepage
            </label>
            <button className="button button-primary" type="submit">
              Save tournament
            </button>
          </form>
        </AdminForm>

        <section className="panel p-4">
          <h2 className="mb-4 border-b border-metal-line pb-3 text-xl font-black">Tournaments</h2>
          <div className="table-scroll">
            <table className="wiki-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Status</th>
                  <th className="numeric">Teams</th>
                  <th className="numeric">Actions</th>
                </tr>
              </thead>
              <tbody>
                {tournaments.length ? (
                  tournaments.map((tournament) => (
                    <tr key={tournament.id}>
                      <td>
                        <Link href={`/admin/tournaments/${tournament.id}`} className="font-black hover:text-metal-accent">
                          {tournament.name}
                        </Link>
                      </td>
                      <td>{tournament.status}</td>
                      <td className="numeric">{tournament.tournamentTeams.length}</td>
                      <td>
                        <div className="flex justify-end gap-2">
                          <Link className="button" href={`/admin/tournaments/${tournament.id}`}>
                            Edit
                          </Link>
                          <form action={deleteTournamentAction.bind(null, tournament.id)}>
                            <ConfirmDeleteModal />
                          </form>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4} className="text-metal-muted">
                      No tournaments added yet.
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
