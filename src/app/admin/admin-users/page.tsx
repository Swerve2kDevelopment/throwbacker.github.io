import { AdminForm, AdminStatusBanner, Field } from "@/components/admin/AdminForm";
import { ConfirmDeleteModal } from "@/components/ui/ConfirmDeleteModal";
import { createAdminUserAction, deleteAdminUserAction, sendAdminDmAction } from "@/lib/admin-actions";
import { getDiscordBotGuilds, getDiscordBotIdentity, getDiscordGuildMember } from "@/lib/discord-bot";
import { assertAdminUser } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage({
  searchParams
}: {
  searchParams: Promise<{ saved?: string; deleted?: string; error?: string; notice?: string; dm?: string; failed?: string; checkDiscordId?: string; checkGuildId?: string }>;
}) {
  await assertAdminUser();

  const resolvedSearchParams = await searchParams;
  const botDiagnostics = await getBotDiagnostics(resolvedSearchParams.checkDiscordId, resolvedSearchParams.checkGuildId);
  const adminUsers = await prisma.adminUser.findMany({
    orderBy: { createdAt: "desc" }
  });

  return (
    <div>
      <AdminStatusBanner searchParams={resolvedSearchParams} />
      {resolvedSearchParams.dm ? (
        <div className="mb-4 border border-metal-line bg-metal-panel2 p-3 text-sm font-bold text-metal-muted">
          Discord DMs sent: {resolvedSearchParams.dm}
          {resolvedSearchParams.failed ? `; failed IDs: ${resolvedSearchParams.failed}` : ""}.
        </div>
      ) : null}
      <div className="grid gap-5 xl:grid-cols-[420px_1fr]">
        <div className="grid gap-5">
          <AdminForm title="Approve Admin">
            <form action={createAdminUserAction} className="grid gap-3">
              <Field label="Discord user ID">
                <input className="input" name="discordId" required />
              </Field>
              <button className="button button-primary" type="submit">
                Add admin
              </button>
            </form>
          </AdminForm>

          <AdminForm title="Send Discord DM">
            <form action={sendAdminDmAction} className="grid gap-3">
              <Field label="Discord user ID">
                <input className="input" name="targetDiscordId" placeholder="Paste any Discord user ID" />
              </Field>
              <Field label="Bulk send">
                <label className="flex items-center gap-2 text-sm font-bold text-metal-muted">
                  <input type="checkbox" name="sendToAllAdmins" />
                  Send to all approved admins instead
                </label>
              </Field>
              <Field label="Message">
                <textarea className="input min-h-32" name="message" maxLength={1900} required placeholder="Message to send from the Discord bot" />
                <span className="text-xs text-metal-muted">Requires DISCORD_BOT_TOKEN. You can enter any Discord user ID, but Discord may reject DMs if the bot cannot message that user.</span>
              </Field>
              <button className="button button-primary" type="submit">
                Send DM
              </button>
            </form>
          </AdminForm>

          <AdminForm title="Discord Bot Diagnostics">
            <form action="/admin/admin-users" className="grid gap-3">
              <Field label="Discord user ID">
                <input className="input" name="checkDiscordId" defaultValue={resolvedSearchParams.checkDiscordId || ""} placeholder="User ID to check" />
              </Field>
              <Field label="Guild/server ID">
                <input className="input" name="checkGuildId" defaultValue={resolvedSearchParams.checkGuildId || ""} placeholder="Server ID to check" />
              </Field>
              <button className="button" type="submit">
                Check bot access
              </button>
            </form>
            <div className="mt-4 grid gap-2 text-sm">
              {botDiagnostics.lines.map((line) => (
                <div key={line} className="subtle-panel p-3 font-semibold text-metal-muted">
                  {line}
                </div>
              ))}
            </div>
          </AdminForm>
        </div>

        <section className="panel p-4">
          <h2 className="mb-4 border-b border-metal-line pb-3 text-xl font-black">Approved Admins</h2>
          <div className="table-scroll">
            <table className="wiki-table">
              <thead>
                <tr>
                  <th>Discord ID</th>
                  <th>Added by</th>
                  <th>Created</th>
                  <th className="numeric">Actions</th>
                </tr>
              </thead>
              <tbody>
                {adminUsers.length ? (
                  adminUsers.map((admin) => (
                    <tr key={admin.id}>
                      <td className="font-mono">{admin.discordId}</td>
                      <td>{admin.addedBy || "-"}</td>
                      <td>{admin.createdAt.toLocaleString("en-GB")}</td>
                      <td>
                        <div className="flex justify-end">
                          <form action={deleteAdminUserAction.bind(null, admin.id)}>
                            <ConfirmDeleteModal />
                          </form>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4} className="text-metal-muted">
                      No approved admins added yet.
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

async function getBotDiagnostics(discordId?: string, guildId?: string) {
  if (!process.env.DISCORD_BOT_TOKEN) {
    return { lines: ["DISCORD_BOT_TOKEN is not configured."] };
  }

  try {
    const [bot, guilds] = await Promise.all([getDiscordBotIdentity(), getDiscordBotGuilds()]);
    const lines = [
      `Bot token belongs to: ${bot.global_name || bot.username} (${bot.id})`,
      `Bot can see ${guilds.length} guild${guilds.length === 1 ? "" : "s"}.`,
      guilds.length ? `Visible guilds: ${guilds.slice(0, 10).map((guild) => `${guild.name} (${guild.id})`).join(", ")}${guilds.length > 10 ? ", ..." : ""}` : "No visible guilds returned by Discord."
    ];

    if (discordId && guildId) {
      try {
        const member = await getDiscordGuildMember(guildId, discordId);
        lines.push(`Member check: found ${member.user?.global_name || member.user?.username || discordId}${member.nick ? `, nick ${member.nick}` : ""} in guild ${guildId}.`);
      } catch (error) {
        lines.push(`Member check failed: ${error instanceof Error ? error.message : "Unknown Discord error"}`);
      }
    }

    return { lines };
  } catch (error) {
    return { lines: [`Bot diagnostic failed: ${error instanceof Error ? error.message : "Unknown Discord error"}`] };
  }
}
