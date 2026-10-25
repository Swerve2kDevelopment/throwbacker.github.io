import Link from "next/link";

import { AdminForm, AdminStatusBanner, Field } from "@/components/admin/AdminForm";
import { ImageUploadField } from "@/components/admin/ImageUploadField";
import { ConfirmDeleteModal } from "@/components/ui/ConfirmDeleteModal";
import { createTeamAction, deleteTeamAction } from "@/lib/admin-actions";
import { assertAdminUser } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function AdminTeamsPage({
  searchParams
}: {
  searchParams: Promise<{ saved?: string; deleted?: string; error?: string; notice?: string }>;
}) {
  await assertAdminUser();

  const resolvedSearchParams = await searchParams;
  const [teams, players] = await Promise.all([
    prisma.team.findMany({
      include: { currentPlayers: true },
      orderBy: { name: "asc" }
    }),
    prisma.player.findMany({ orderBy: { displayName: "asc" } })
  ]);

  return (
    <div>
      <AdminStatusBanner searchParams={resolvedSearchParams} />
      <div className="grid gap-5 xl:grid-cols-[420px_1fr]">
        <AdminForm title="Add Team">
          <form action={createTeamAction} className="grid gap-3">
            <Field label="Name">
              <input className="input" name="name" required />
            </Field>
            <Field label="Slug">
              <input className="input" name="slug" placeholder="auto-generated if blank" />
            </Field>
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Tag">
                <input className="input" name="tag" />
              </Field>
              <Field label="Country / region">
                <input className="input" name="region" />
              </Field>
            </div>
            <ImageUploadField label="Upload logo" name="logoFile" />
            <div className="grid gap-3 md:grid-cols-[1fr_120px]">
              <Field label="…or logo URL">
                <input className="input" name="logoUrl" placeholder="/team-logos/Name.png or https://…" />
              </Field>
              <Field label="Theme color">
                <input className="input h-[42px] p-1" type="color" name="themeColor" defaultValue="#e11d2e" />
              </Field>
            </div>
            <Field label="Description">
              <textarea className="input min-h-24" name="description" />
            </Field>
            <Field label="Current roster">
              <select className="input min-h-36" name="currentRosterIds" multiple>
                {players.map((player) => (
                  <option key={player.id} value={player.id}>
                    {player.displayName}
                  </option>
                ))}
              </select>
            </Field>
            <button className="button button-primary" type="submit">
              Save team
            </button>
          </form>
        </AdminForm>

        <section className="panel p-4">
          <h2 className="mb-4 border-b border-metal-line pb-3 text-xl font-black">Teams</h2>
          <div className="table-scroll">
            <table className="wiki-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Tag</th>
                  <th className="numeric">Roster</th>
                  <th className="numeric">Actions</th>
                </tr>
              </thead>
              <tbody>
                {teams.length ? (
                  teams.map((team) => (
                    <tr key={team.id}>
                      <td>
                        <Link href={`/admin/teams/${team.id}`} className="font-black hover:text-metal-accent">
                          {team.name}
                        </Link>
                      </td>
                      <td>{team.tag || "-"}</td>
                      <td className="numeric">{team.currentPlayers.length}</td>
                      <td>
                        <div className="flex justify-end gap-2">
                          <Link className="button" href={`/admin/teams/${team.id}`}>
                            Edit
                          </Link>
                          <form action={deleteTeamAction.bind(null, team.id)}>
                            <ConfirmDeleteModal />
                          </form>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4} className="text-metal-muted">
                      No teams added yet.
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
