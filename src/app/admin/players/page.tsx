import Link from "next/link";

import { AdminForm, AdminStatusBanner, Field } from "@/components/admin/AdminForm";
import { ImageUploadField } from "@/components/admin/ImageUploadField";
import { ConfirmDeleteModal } from "@/components/ui/ConfirmDeleteModal";
import { createPlayerAction, deletePlayerAction } from "@/lib/admin-actions";
import { assertAdminUser } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function AdminPlayersPage({
  searchParams
}: {
  searchParams: Promise<{ saved?: string; deleted?: string; error?: string; notice?: string }>;
}) {
  await assertAdminUser();

  const resolvedSearchParams = await searchParams;
  const [players, teams] = await Promise.all([
    prisma.player.findMany({
      include: { currentTeam: true },
      orderBy: { displayName: "asc" }
    }),
    prisma.team.findMany({ orderBy: { name: "asc" } })
  ]);

  return (
    <div>
      <AdminStatusBanner searchParams={resolvedSearchParams} />
      <div className="grid gap-5 xl:grid-cols-[420px_1fr]">
        <AdminForm title="Add Player">
          <form action={createPlayerAction} className="grid gap-3">
            <Field label="Display name">
              <input className="input" name="displayName" required />
            </Field>
            <Field label="Slug">
              <input className="input" name="slug" placeholder="auto-generated if blank" />
            </Field>
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Discord ID">
                <input className="input" name="discordId" />
              </Field>
              <Field label="Discord username">
                <input className="input" name="discordUsername" />
              </Field>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Nationality">
                <input className="input" name="nationality" />
              </Field>
              <Field label="Real name">
                <input className="input" name="realName" />
              </Field>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Role">
                <input className="input" name="role" placeholder="Entry, Support, IGL" />
              </Field>
              <Field label="Status">
                <input className="input" name="status" placeholder="Active, Inactive, Sub" />
              </Field>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Date of birth">
                <input className="input" type="date" name="dateOfBirth" />
              </Field>
              <Field label="Current team">
                <select className="input" name="currentTeamId" defaultValue="">
                  <option value="">Free agent</option>
                  {teams.map((team) => (
                    <option key={team.id} value={team.id}>
                      {team.name}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <ImageUploadField label="Upload photo (optional)" name="photoFile" hint="Leave empty to use their Discord avatar. Cropped to a square." />
            <Field label="…or avatar URL">
              <input className="input" name="avatarUrl" placeholder="Leave blank to fetch from Discord ID" />
            </Field>
            <Field label="Social links">
              <textarea className="input min-h-20" name="socialLinks" placeholder="One URL per line" />
            </Field>
            <Field label="Aliases">
              <textarea className="input min-h-20" name="aliases" />
            </Field>
            <Field label="Notes">
              <textarea className="input min-h-24" name="notes" />
            </Field>
            <button className="button button-primary" type="submit">
              Save player
            </button>
          </form>
        </AdminForm>

        <section className="panel p-4">
          <h2 className="mb-4 border-b border-metal-line pb-3 text-xl font-black">Players</h2>
          <div className="table-scroll">
            <table className="wiki-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Team</th>
                  <th>Discord</th>
                  <th className="numeric">Actions</th>
                </tr>
              </thead>
              <tbody>
                {players.length ? (
                  players.map((player) => (
                    <tr key={player.id}>
                      <td>
                        <Link href={`/admin/players/${player.id}`} className="font-black hover:text-metal-accent">
                          {player.displayName}
                        </Link>
                      </td>
                      <td>{player.currentTeam?.name || "Free agent"}</td>
                      <td>{player.discordUsername || player.discordId || "-"}</td>
                      <td>
                        <div className="flex justify-end gap-2">
                          <Link className="button" href={`/admin/players/${player.id}`}>
                            Edit
                          </Link>
                          <form action={deletePlayerAction.bind(null, player.id)}>
                            <ConfirmDeleteModal />
                          </form>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4} className="text-metal-muted">
                      No players added yet.
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
