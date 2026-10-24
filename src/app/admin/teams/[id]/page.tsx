import { notFound } from "next/navigation";

import { AdminForm, AdminStatusBanner, Field } from "@/components/admin/AdminForm";
import { updateTeamAction, updateTeamManagersAction } from "@/lib/admin-actions";
import { assertAdminUser } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function AdminEditTeamPage({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string; deleted?: string; error?: string; notice?: string }>;
}) {
  await assertAdminUser();

  const [{ id }, resolvedSearchParams] = await Promise.all([params, searchParams]);
  const [team, players] = await Promise.all([
    prisma.team.findUnique({ where: { id }, include: { currentPlayers: true, managers: { orderBy: { createdAt: "asc" } } } }),
    prisma.player.findMany({ orderBy: { displayName: "asc" } })
  ]);

  if (!team) notFound();
  const rosterIds = new Set(team.currentPlayers.map((player) => player.id));

  return (
    <div>
      <AdminStatusBanner searchParams={resolvedSearchParams} />
      <AdminForm title={`Edit ${team.name}`}>
        <form action={updateTeamAction.bind(null, team.id)} className="grid gap-3">
          <Field label="Name">
            <input className="input" name="name" defaultValue={team.name} required />
          </Field>
          <Field label="Slug">
            <input className="input" name="slug" defaultValue={team.slug} />
          </Field>
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Tag">
              <input className="input" name="tag" defaultValue={team.tag || ""} />
            </Field>
            <Field label="Country / region">
              <input className="input" name="region" defaultValue={team.region || ""} />
            </Field>
          </div>
          <div className="grid gap-3 md:grid-cols-[1fr_120px]">
            <Field label="Logo URL">
              <input className="input" name="logoUrl" defaultValue={team.logoUrl || ""} />
            </Field>
            <Field label="Theme color">
              <input className="input h-[42px] p-1" type="color" name="themeColor" defaultValue={team.themeColor || "#e11d2e"} />
            </Field>
          </div>
          <Field label="Description">
            <textarea className="input min-h-24" name="description" defaultValue={team.description || ""} />
          </Field>
          <Field label="Current roster">
            <select className="input min-h-44" name="currentRosterIds" multiple defaultValue={[...rosterIds]}>
              {players.map((player) => (
                <option key={player.id} value={player.id}>
                  {player.displayName}
                </option>
              ))}
            </select>
          </Field>
          <button className="button button-primary" type="submit">
            Save changes
          </button>
        </form>
      </AdminForm>

      <div className="mt-5">
        <AdminForm title="Team Managers">
          <form action={updateTeamManagersAction.bind(null, team.id)} className="grid gap-3">
            <Field label="Manager Discord user IDs">
              <textarea className="input min-h-28" name="managerDiscordIds" defaultValue={team.managers.map((manager) => manager.discordId).join("\n")} placeholder="One Discord user ID per line" />
              <span className="text-xs text-metal-muted">Managers can send sign requests, release players, and bench players from their account page.</span>
            </Field>
            <button className="button button-primary" type="submit">
              Save managers
            </button>
          </form>
        </AdminForm>
      </div>
    </div>
  );
}
