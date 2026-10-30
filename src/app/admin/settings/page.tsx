import { AdminForm, AdminStatusBanner, Field } from "@/components/admin/AdminForm";
import { ImageUploadField } from "@/components/admin/ImageUploadField";
import { ConfirmDeleteModal } from "@/components/ui/ConfirmDeleteModal";
import {
  bulkOperatorIconsAction,
  cachePlayerAvatarsAction,
  deleteOperatorIconAction,
  deletePlayerOfWeekAction,
  importOperatorIconsAction,
  setPlayerOfWeekAction,
  testDiscordWebhookAction,
  updateLeagueLogoAction,
  updateSiteSettingsAction,
  uploadOperatorIconsAction,
  upsertOperatorIconAction
} from "@/lib/admin-actions";
import { formatDate } from "@/lib/format";
import { assertAdminUser } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { SETTING_KEYS, getSiteSettings } from "@/lib/site-settings";

export const dynamic = "force-dynamic";

function mondayOfThisWeek() {
  const date = new Date();
  const day = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - day);
  return date.toISOString().slice(0, 10);
}

function maskWebhook(url: string) {
  return url.replace(/(webhooks\/\d+\/).+$/, "$1••••••");
}

export default async function AdminSettingsPage({
  searchParams
}: {
  searchParams: Promise<{ saved?: string; deleted?: string; error?: string; notice?: string }>;
}) {
  await assertAdminUser();

  const resolvedSearchParams = await searchParams;
  const [settings, operators, players, playerOfWeeks, avatarRows, leagues] = await Promise.all([
    getSiteSettings(Object.values(SETTING_KEYS)),
    prisma.operatorIcon.findMany({ orderBy: { name: "asc" } }),
    prisma.player.findMany({ orderBy: { displayName: "asc" }, select: { id: true, displayName: true } }),
    prisma.playerOfWeek.findMany({
      include: { player: true },
      orderBy: { weekStart: "desc" },
      take: 12
    }),
    prisma.player.findMany({ select: { avatarUrl: true, discordId: true } }),
    prisma.league.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, shortName: true, logoUrl: true } })
  ]);

  const avatarCounts = avatarRows.reduce(
    (counts, row) => {
      if (!row.avatarUrl) counts.none += 1;
      else if (row.avatarUrl.startsWith("/player-avatars/")) counts.file += 1;
      else if (row.avatarUrl.startsWith("/api/player-avatars/")) counts.db += 1;
      else counts.remote += 1;
      return counts;
    },
    { file: 0, db: 0, remote: 0, none: 0 }
  );
  const hasBotToken = Boolean(process.env.DISCORD_BOT_TOKEN);
  const discordWebhookUrl = settings[SETTING_KEYS.discordWebhookUrl];
  const pingRoleId = settings[SETTING_KEYS.discordPingRoleId];
  const pingToggles = [
    { name: "pingOnMatches", key: SETTING_KEYS.pingOnMatches, label: "New match stats" },
    { name: "pingOnRecruitment", key: SETTING_KEYS.pingOnRecruitment, label: "Teams looking for a player" },
    { name: "pingOnSignings", key: SETTING_KEYS.pingOnSignings, label: "Teams looking to sign a player" }
  ];

  return (
    <div className="grid gap-5">
      <AdminStatusBanner searchParams={resolvedSearchParams} />

      <div className="grid gap-5 xl:grid-cols-2">
        <AdminForm
          title="Discord announcements"
          description="Match stats, recruitment posts and signing requests post here. Only the role below can ever be pinged; @everyone and @here are always blocked."
        >
          <form action={updateSiteSettingsAction} className="grid gap-3">
            <Field label="Webhook URL">
              <input className="input" name="discordWebhookUrl" type="url" defaultValue={discordWebhookUrl} placeholder="https://discord.com/api/webhooks/..." autoComplete="off" />
            </Field>
            <span className="form-hint">
              {discordWebhookUrl ? (
                <>
                  Current: <code>{maskWebhook(discordWebhookUrl)}</code>. Clear the box and save to turn announcements off.
                </>
              ) : (
                "Not set. Channel settings → Integrations → Webhooks → New Webhook → Copy URL."
              )}
            </span>
            <Field label="Role to ping (optional)">
              <input className="input" name="discordPingRoleId" defaultValue={pingRoleId} placeholder="e.g. 1234567890123456789" inputMode="numeric" autoComplete="off" />
            </Field>
            <span className="form-hint">
              In Discord: turn on Developer Mode (User Settings → Advanced), then Server Settings → Roles → right-click the role → Copy Role ID. The webhook can only ping a
              role that is set to &quot;Allow anyone to @mention this role&quot;.
            </span>
            <div className="grid gap-2">
              <span className="label">Ping the role for</span>
              {pingToggles.map((toggle) => (
                <label key={toggle.name} className="check-row">
                  <input type="checkbox" name={toggle.name} defaultChecked={settings[toggle.key] === "true"} />
                  {toggle.label}
                </label>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button className="button button-primary" type="submit">
                Save announcements
              </button>
              <button className="button" type="submit" formAction={testDiscordWebhookAction}>
                Send test message
              </button>
              <label className="check-row">
                <input type="checkbox" name="pingTest" />
                Ping the role in the test
              </label>
            </div>
          </form>
        </AdminForm>

        <AdminForm title="Player of the Week" description="Shown at the top of the homepage and on the player's profile.">
          <form action={setPlayerOfWeekAction} className="grid gap-3">
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Week starting">
                <input className="input" type="date" name="weekStart" defaultValue={mondayOfThisWeek()} required />
              </Field>
              <Field label="Player">
                <select className="input" name="playerId" required>
                  <option value="">Select player</option>
                  {players.map((player) => (
                    <option key={player.id} value={player.id}>
                      {player.displayName}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="Title">
              <input className="input" name="title" placeholder="e.g. 31 kills across two maps" />
            </Field>
            <Field label="Note (optional)">
              <textarea className="input min-h-20" name="note" placeholder="What they did this week" style={{ fontFamily: "inherit" }} />
            </Field>
            <span className="form-hint">Saving the same week again replaces that week&apos;s pick.</span>
            <button className="button button-primary w-fit" type="submit">
              Save Player of the Week
            </button>
          </form>
          {playerOfWeeks.length ? (
            <div className="mt-4 grid gap-2 border-t border-metal-line pt-4">
              {playerOfWeeks.map((award) => (
                <div key={award.id} className="feed-row">
                  <span>
                    {award.player.displayName}
                    <span className="ml-2 font-semibold text-metal-muted">{award.title || "Player of the Week"}</span>
                  </span>
                  <em>{formatDate(award.weekStart)}</em>
                  <form action={deletePlayerOfWeekAction.bind(null, award.id)}>
                    <ConfirmDeleteModal />
                  </form>
                </div>
              ))}
            </div>
          ) : null}
        </AdminForm>
      </div>

      <AdminForm title="Player avatars" description="Discord image links stop working when someone changes their avatar, so every photo is copied to site storage.">
        <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
          <div className="grid gap-3 sm:grid-cols-4">
            <div className="stat-tile">
              <p>Stored in public/</p>
              <strong>{avatarCounts.file}</strong>
            </div>
            <div className="stat-tile">
              <p>Stored in database</p>
              <strong>{avatarCounts.db}</strong>
            </div>
            <div className={`stat-tile${avatarCounts.remote ? " stat-tile-accent" : ""}`}>
              <p>Remote links</p>
              <strong>{avatarCounts.remote}</strong>
              <em>may expire</em>
            </div>
            <div className="stat-tile">
              <p>No avatar</p>
              <strong>{avatarCounts.none}</strong>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <form action={cachePlayerAvatarsAction}>
              <input type="hidden" name="mode" value="cache" />
              <button className="button button-primary" type="submit">
                Cache remote avatars
              </button>
            </form>
            <form action={cachePlayerAvatarsAction}>
              <input type="hidden" name="mode" value="refresh" />
              <button className="button" type="submit" disabled={!hasBotToken} title={hasBotToken ? undefined : "Needs DISCORD_BOT_TOKEN"}>
                Refresh all from Discord IDs
              </button>
            </form>
          </div>
        </div>
        <p className="form-hint mt-3">
          &quot;Cache&quot; downloads each stored link; if a link has already expired it looks the player up by Discord ID{hasBotToken ? "" : " (needs DISCORD_BOT_TOKEN, which isn't set)"}.
          On Netlify, files can&apos;t be written at runtime, so images go to the database and are served from <code>/api/player-avatars</code>. To keep them as
          files in <code>public/player-avatars/</code>, run <code>npm run avatars:cache</code> locally and deploy. Players also refresh their own avatar whenever
          they sign in.
        </p>
      </AdminForm>

      <AdminForm title="League logos" description="Shown on league pages and next to league games.">
        <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
          <form action={updateLeagueLogoAction} className="grid gap-3">
            <Field label="League">
              <select className="input" name="leagueId" required defaultValue={leagues[0]?.id || ""}>
                {leagues.map((league) => (
                  <option key={league.id} value={league.id}>
                    {league.shortName || league.name}
                  </option>
                ))}
              </select>
            </Field>
            <ImageUploadField label="New logo" name="logoFile" />
            <button className="button button-primary w-fit" type="submit">
              Upload league logo
            </button>
          </form>
          <div className="grid content-start gap-2">
            {leagues.map((league) => (
              <div key={league.id} className="operator-ban-chip">
                {league.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img alt="" src={league.logoUrl} />
                ) : (
                  <span>{(league.shortName || league.name).slice(0, 2)}</span>
                )}
                <span className="min-w-0">
                  <strong style={{ textDecoration: "none" }}>{league.name}</strong>
                  <em className="truncate">{league.logoUrl || "No logo"}</em>
                </span>
              </div>
            ))}
          </div>
        </div>
      </AdminForm>

      <div className="grid gap-5 xl:grid-cols-[420px_1fr]">
        <AdminForm title="Operator icons" description="Upload icons straight from your computer. They show on match pages next to operator bans.">
          <div className="grid gap-4">
            <form action={uploadOperatorIconsAction} className="grid gap-3">
              <ImageUploadField
                label="Upload several at once"
                name="iconFiles"
                multiple
                hint="Each icon is named after its file: Thermite.png → Thermite, Jager.png → Jager. Re-uploading a name replaces its icon. Keep one batch under about 4 MB."
              />
              <button className="button button-primary w-fit" type="submit">
                Upload icons
              </button>
            </form>

            <form action={upsertOperatorIconAction} className="form-section">
              <Field label="Operator">
                <input className="input" name="name" placeholder="Jäger" required />
              </Field>
              <ImageUploadField label="Icon" name="iconFile" hint="Use this when the name has accents or doesn't match the file name." />
              <Field label="…or icon path">
                <input className="input" name="iconPath" placeholder="/operator-icons/Thermite.png" />
              </Field>
              <button className="button w-fit" type="submit">
                Save operator
              </button>
            </form>

            <form action={bulkOperatorIconsAction} className="form-section">
              <Field label="Bulk mapping">
                <textarea className="input min-h-28" name="mappingsRaw" placeholder={"Thermite\nJäger | /operator-icons/Jager.png\nAsh"} />
              </Field>
              <span className="form-hint">
                One per line: <code>name | path</code>. Leave the path off to use <code>/operator-icons/Name.png</code>.
              </span>
              <button className="button w-fit" type="submit">
                Save all
              </button>
            </form>

            <form action={importOperatorIconsAction} className="form-section">
              <span className="form-hint">Scan the folder and map every image by file name (Thermite.png → Thermite). Works where the site can read its own files, e.g. local dev.</span>
              <button className="button w-fit" type="submit">
                Import from folder
              </button>
            </form>
          </div>
        </AdminForm>

        <section className="panel p-4">
          <div className="section-heading">
            <h2>Mapped operators</h2>
            <span className="label">{operators.length}</span>
          </div>
          {operators.length ? (
            <div className="operator-ban-grid">
              {operators.map((operator) => (
                <div key={operator.id} className="operator-ban-chip">
                  {operator.iconPath ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img alt="" src={operator.iconPath} />
                  ) : (
                    <span>{operator.name.slice(0, 2).toUpperCase()}</span>
                  )}
                  <span className="min-w-0 flex-1">
                    <strong style={{ textDecoration: "none" }}>{operator.name}</strong>
                    <em className="truncate">{operator.iconPath || "No icon"}</em>
                  </span>
                  <form action={deleteOperatorIconAction.bind(null, operator.id)}>
                    <ConfirmDeleteModal />
                  </form>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state">No operators mapped yet. Bans still show with initials until an icon is mapped.</div>
          )}
        </section>
      </div>
    </div>
  );
}
