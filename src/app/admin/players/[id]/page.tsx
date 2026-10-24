import { notFound } from "next/navigation";

import { AdminForm, AdminStatusBanner, Field } from "@/components/admin/AdminForm";
import { createPlayerBanAction, liftPlayerBanAction, refreshPlayerAvatarAction, syncPlayerDiscordProfileAction, updatePlayerAction } from "@/lib/admin-actions";
import { formatDateTime } from "@/lib/format";
import { assertAdminUser } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function dateInput(value?: Date | null) {
  return value ? value.toISOString().slice(0, 10) : "";
}

export default async function AdminEditPlayerPage({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string; deleted?: string; error?: string; notice?: string }>;
}) {
  await assertAdminUser();

  const [{ id }, resolvedSearchParams] = await Promise.all([params, searchParams]);
  const [player, teams] = await Promise.all([
    prisma.player.findUnique({
      where: { id },
      include: {
        bans: {
          orderBy: [{ liftedAt: "asc" }, { createdAt: "desc" }]
        }
      }
    }),
    prisma.team.findMany({ orderBy: { name: "asc" } })
  ]);

  if (!player) notFound();

  return (
    <div>
      <AdminStatusBanner searchParams={resolvedSearchParams} />
      <AdminForm title={`Edit ${player.displayName}`}>
        <form action={updatePlayerAction.bind(null, player.id)} className="grid gap-3">
          <Field label="Display name">
            <input className="input" name="displayName" defaultValue={player.displayName} required />
          </Field>
          <Field label="Slug">
            <input className="input" name="slug" defaultValue={player.slug} />
          </Field>
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Discord ID">
              <input className="input" name="discordId" defaultValue={player.discordId || ""} />
            </Field>
            <Field label="Discord username">
              <input className="input" name="discordUsername" defaultValue={player.discordUsername || ""} />
            </Field>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Nationality">
              <input className="input" name="nationality" defaultValue={player.nationality || ""} />
            </Field>
            <Field label="Real name">
              <input className="input" name="realName" defaultValue={player.realName || ""} />
            </Field>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Role">
              <input className="input" name="role" defaultValue={player.role || ""} />
            </Field>
            <Field label="Status">
              <input className="input" name="status" defaultValue={player.status || ""} />
            </Field>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Date of birth">
              <input className="input" type="date" name="dateOfBirth" defaultValue={dateInput(player.dateOfBirth)} />
            </Field>
            <Field label="Current team">
              <select className="input" name="currentTeamId" defaultValue={player.currentTeamId || ""}>
                <option value="">Free agent</option>
                {teams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="Avatar URL">
            <input className="input" name="avatarUrl" defaultValue={player.avatarUrl || ""} placeholder="Leave blank to fetch from Discord ID" />
          </Field>
          <Field label="Social links">
            <textarea className="input min-h-20" name="socialLinks" defaultValue={player.socialLinks.join("\n")} placeholder="One URL per line" />
          </Field>
          <Field label="Aliases">
            <textarea className="input min-h-20" name="aliases" defaultValue={player.aliases.join("\n")} />
          </Field>
          <Field label="Notes">
            <textarea className="input min-h-24" name="notes" defaultValue={player.notes || ""} />
          </Field>
          <button className="button button-primary" type="submit">
            Save changes
          </button>
        </form>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <form action={syncPlayerDiscordProfileAction.bind(null, player.id)}>
            <button className="button" type="submit" disabled={!player.discordId}>
              Sync name and avatar from Discord
            </button>
          </form>
          <form action={refreshPlayerAvatarAction.bind(null, player.id)}>
            <button className="button" type="submit">
              Re-cache avatar
            </button>
          </form>
          <span className="form-hint">
            Stored as {player.avatarUrl?.startsWith("/") ? <code>{player.avatarUrl.split("?")[0]}</code> : player.avatarUrl ? "a remote link (may expire)" : "no avatar"}
          </span>
        </div>
      </AdminForm>

      <section className="mt-5 grid gap-5 xl:grid-cols-[420px_1fr]">
        <AdminForm title="Add Player Ban">
          <form action={createPlayerBanAction.bind(null, player.id)} className="grid gap-3">
            <Field label="Match">
              <input className="input" name="matchText" required placeholder="Example: OSCL Week 1 - APEXIS vs VISN" />
            </Field>
            <Field label="Reason">
              <textarea className="input min-h-28" name="reason" required placeholder="Explain why this player is being banned." />
            </Field>
            <button className="button button-danger" type="submit">
              Add ban
            </button>
          </form>
        </AdminForm>

        <section className="panel p-4">
          <h2 className="mb-4 border-b border-metal-line pb-3 text-xl font-black">Player Bans</h2>
          <div className="grid gap-3">
            {player.bans.length ? (
              player.bans.map((ban) => (
                <div key={ban.id} className={ban.liftedAt ? "subtle-panel p-4" : "ban-admin-card p-4"}>
                  <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                    <div>
                      <p className={ban.liftedAt ? "label" : "label text-white"}>{ban.liftedAt ? "Previous Ban" : "Active Ban"}</p>
                      <p className="mt-1 font-black">{ban.matchText}</p>
                      <p className="mt-2 text-sm font-semibold">{ban.reason}</p>
                      <p className="mt-2 text-xs font-bold text-metal-muted">
                        Issued {formatDateTime(ban.createdAt)}
                        {ban.issuedBy ? ` by ${ban.issuedBy}` : ""}
                      </p>
                      {ban.liftedAt ? (
                        <p className="mt-1 text-xs font-bold text-metal-muted">
                          Lifted {formatDateTime(ban.liftedAt)}
                          {ban.liftedBy ? ` by ${ban.liftedBy}` : ""}
                          {ban.liftReason ? ` - ${ban.liftReason}` : ""}
                        </p>
                      ) : null}
                    </div>
                    {!ban.liftedAt ? (
                      <form action={liftPlayerBanAction.bind(null, ban.id)} className="grid min-w-[220px] gap-2">
                        <input className="input" name="liftReason" placeholder="Lift note optional" />
                        <button className="button" type="submit">
                          Lift ban
                        </button>
                      </form>
                    ) : null}
                  </div>
                </div>
              ))
            ) : (
              <div className="subtle-panel p-5 text-metal-muted">No bans recorded for this player.</div>
            )}
          </div>
        </section>
      </section>
    </div>
  );
}
