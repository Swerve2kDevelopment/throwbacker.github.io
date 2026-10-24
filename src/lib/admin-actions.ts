"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ZodError, type ZodType } from "zod";

import {
  createMatch,
  createPlayer,
  createStat,
  createTeam,
  createTournament,
  deleteMatch,
  deletePlayer,
  deleteStat,
  deleteTeam,
  deleteTournament,
  updateMatch,
  updatePlayer,
  updateStat,
  updateTeam,
  updateTournament
} from "@/lib/mutations";
import { getDiscordUserProfile, sendDiscordDm } from "@/lib/discord-bot";
import { assertAdminUser } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import {
  adminDmSchema,
  adminUserSchema,
  bracketPlacementSchema,
  operatorIconBulkSchema,
  formDataToObject,
  liftPlayerBanSchema,
  matchSchema,
  operatorIconSchema,
  playerBanSchema,
  playerOfWeekSchema,
  playerSchema,
  siteSettingsSchema,
  statSchema,
  teamSchema,
  tournamentSchema
} from "@/lib/validators";
import { readdir } from "fs/promises";
import path from "path";

import { cachePlayerAvatar, refreshPlayerAvatar, type AvatarRefreshResult } from "@/lib/avatar-cache";
import { announceMatchStats } from "@/lib/match-announcements";
import { OSCL_EMBED_COLOR, SETTING_KEYS, getSiteSetting, sendDiscordWebhook, setSiteSetting } from "@/lib/site-settings";

function mutationError(error: unknown) {
  if (error instanceof ZodError) {
    return error.issues.map((issue) => issue.message).join(" ");
  }

  if (error instanceof Error) {
    if (error.message.includes("Unique constraint failed")) {
      return "That slug or unique field already exists.";
    }
    return error.message;
  }

  return "Something went wrong.";
}

function actorLabel(session: Awaited<ReturnType<typeof assertAdminUser>>) {
  return session.user.discordId || session.user.username || session.user.name || session.user.id;
}

function refreshAll() {
  revalidatePath("/");
  revalidatePath("/players");
  revalidatePath("/teams");
  revalidatePath("/tournaments");
  revalidatePath("/leaderboards");
  revalidatePath("/leagues");
  revalidatePath("/leagues/oscl");
  revalidatePath("/admin");
}

function withNotice(target: string, notice?: string | null) {
  if (!notice) return target;
  return `${target}${target.includes("?") ? "&" : "?"}notice=${encodeURIComponent(notice)}`;
}

async function runFormMutation<T>(
  formData: FormData,
  schema: ZodType<T, any, any>,
  action: (input: T) => Promise<unknown>,
  redirectPath: string
) {
  await assertAdminUser();

  let target = `${redirectPath}?saved=1`;
  try {
    const input = schema.parse(formDataToObject(formData));
    const result = await action(input);
    if (result && typeof result === "object" && "notice" in result && typeof result.notice === "string") {
      target = withNotice(target, result.notice);
    }
    refreshAll();
  } catch (error) {
    target = `${redirectPath}?error=${encodeURIComponent(mutationError(error))}`;
  }

  redirect(target);
}

async function runDelete(action: () => Promise<unknown>, redirectPath: string) {
  await assertAdminUser();

  let target = `${redirectPath}?deleted=1`;
  try {
    await action();
    refreshAll();
  } catch (error) {
    target = `${redirectPath}?error=${encodeURIComponent(mutationError(error))}`;
  }

  redirect(target);
}

export async function createPlayerAction(formData: FormData) {
  await runFormMutation(formData, playerSchema, createPlayer, "/admin/players");
}

export async function updatePlayerAction(id: string, formData: FormData) {
  await runFormMutation(formData, playerSchema, (input) => updatePlayer(id, input), "/admin/players");
}

export async function syncPlayerDiscordProfileAction(id: string) {
  await assertAdminUser();

  let target = `/admin/players/${id}?saved=1`;
  try {
    const player = await prisma.player.findUnique({ where: { id }, select: { discordId: true, slug: true } });
    if (!player?.discordId) throw new Error("This player does not have a Discord ID.");

    const profile = await getDiscordUserProfile(player.discordId);
    const avatarUrl = await cachePlayerAvatar(id, profile.avatarUrl);
    await prisma.player.update({
      where: { id },
      data: {
        discordUsername: profile.discordUsername,
        avatarUrl
      }
    });

    refreshAll();
    revalidatePath(`/players/${player.slug}`);
  } catch (error) {
    target = `/admin/players/${id}?error=${encodeURIComponent(mutationError(error))}`;
  }

  redirect(target);
}

export async function createPlayerBanAction(playerId: string, formData: FormData) {
  const session = await assertAdminUser();

  let target = `/admin/players/${playerId}?saved=1`;
  try {
    const input = playerBanSchema.parse({
      ...formDataToObject(formData),
      playerId
    });
    const player = await prisma.player.findUnique({ where: { id: input.playerId }, select: { slug: true } });
    if (!player) throw new Error("Player not found.");

    await prisma.playerBan.create({
      data: {
        playerId: input.playerId,
        reason: input.reason,
        matchText: input.matchText,
        issuedBy: actorLabel(session)
      }
    });
    refreshAll();
    revalidatePath(`/players/${player.slug}`);
  } catch (error) {
    target = `/admin/players/${playerId}?error=${encodeURIComponent(mutationError(error))}`;
  }

  redirect(target);
}

export async function liftPlayerBanAction(banId: string, formData: FormData) {
  const session = await assertAdminUser();

  let target = "/admin/players?saved=1";
  try {
    const input = liftPlayerBanSchema.parse(formDataToObject(formData));
    const ban = await prisma.playerBan.findUnique({
      where: { id: banId },
      include: { player: { select: { id: true, slug: true } } }
    });
    if (!ban) throw new Error("Ban not found.");
    target = `/admin/players/${ban.player.id}?saved=1`;

    await prisma.playerBan.update({
      where: { id: banId },
      data: {
        liftedAt: new Date(),
        liftedBy: actorLabel(session),
        liftReason: input.liftReason || null
      }
    });
    refreshAll();
    revalidatePath(`/players/${ban.player.slug}`);
  } catch (error) {
    target = `${target.split("?")[0]}?error=${encodeURIComponent(mutationError(error))}`;
  }

  redirect(target);
}

export async function deletePlayerAction(id: string) {
  await runDelete(() => deletePlayer(id), "/admin/players");
}

export async function createTeamAction(formData: FormData) {
  await runFormMutation(formData, teamSchema, createTeam, "/admin/teams");
}

export async function updateTeamAction(id: string, formData: FormData) {
  await runFormMutation(formData, teamSchema, (input) => updateTeam(id, input), "/admin/teams");
}

export async function updateTeamManagersAction(teamId: string, formData: FormData) {
  await assertAdminUser();

  let target = `/admin/teams/${teamId}?saved=1`;
  try {
    const raw = String(formData.get("managerDiscordIds") || "");
    const discordIds = [...new Set(raw.split(/[\n,]/).map((id) => id.trim()).filter(Boolean))];
    const users = discordIds.length
      ? await prisma.user.findMany({
          where: { discordId: { in: discordIds } },
          select: { id: true, discordId: true }
        })
      : [];
    const userByDiscordId = new Map(users.map((user) => [user.discordId, user.id]));

    await prisma.teamManager.deleteMany({
      where: {
        teamId,
        discordId: {
          notIn: discordIds.length ? discordIds : ["__none__"]
        }
      }
    });

    for (const discordId of discordIds) {
      await prisma.teamManager.upsert({
        where: {
          teamId_discordId: {
            teamId,
            discordId
          }
        },
        create: {
          teamId,
          discordId,
          userId: userByDiscordId.get(discordId) || null
        },
        update: {
          userId: userByDiscordId.get(discordId) || null
        }
      });
    }

    refreshAll();
  } catch (error) {
    target = `/admin/teams/${teamId}?error=${encodeURIComponent(mutationError(error))}`;
  }

  redirect(target);
}

export async function deleteTeamAction(id: string) {
  await runDelete(() => deleteTeam(id), "/admin/teams");
}

export async function createTournamentAction(formData: FormData) {
  await runFormMutation(formData, tournamentSchema, createTournament, "/admin/tournaments");
}

export async function updateTournamentAction(id: string, formData: FormData) {
  await runFormMutation(formData, tournamentSchema, (input) => updateTournament(id, input), "/admin/tournaments");
}

export async function deleteTournamentAction(id: string) {
  await runDelete(() => deleteTournament(id), "/admin/tournaments");
}

export async function updateTournamentPlacementsAction(tournamentId: string, formData: FormData) {
  await assertAdminUser();

  let target = `/admin/tournaments/${tournamentId}?saved=1`;
  try {
    const updates = Array.from(formData.entries())
      .filter(([key]) => key.startsWith("placement:") || key.startsWith("seed:"))
      .reduce<Record<string, { seed?: number | null; finalPlacement?: number | null }>>((acc, [key, value]) => {
        const [field, id] = key.split(":");
        if (!id || typeof value !== "string") return acc;
        const parsed = value.trim() ? Number(value) : null;
        const numeric = typeof parsed === "number" && Number.isFinite(parsed) ? parsed : null;
        acc[id] = acc[id] || {};
        if (field === "seed") acc[id].seed = numeric;
        if (field === "placement") acc[id].finalPlacement = numeric;
        return acc;
      }, {});

    await Promise.all(
      Object.entries(updates).map(([id, data]) =>
        prisma.tournamentTeam.update({
          where: { id },
          data
        })
      )
    );
    refreshAll();
  } catch (error) {
    target = `/admin/tournaments/${tournamentId}?error=${encodeURIComponent(mutationError(error))}`;
  }

  redirect(target);
}

async function matchNotice(result: Awaited<ReturnType<typeof createMatch>>, announce: boolean, kind: "new" | "updated") {
  const notes = [...result.warnings];
  if (result.statsSaved) notes.unshift(`${result.statsSaved} stat line${result.statsSaved === 1 ? "" : "s"} saved.`);
  if (announce && result.statsSaved) {
    const announcement = await announceMatchStats(result.match.id, kind);
    notes.push(announcement.sent ? "Posted to Discord." : `Discord post skipped: ${announcement.reason}`);
  }
  return notes.join(" ");
}

export async function createMatchAction(formData: FormData) {
  await runFormMutation(
    formData,
    matchSchema,
    async (input) => {
      const result = await createMatch(input);
      return { notice: await matchNotice(result, input.announce, "new") };
    },
    "/admin/matches"
  );
}

export async function updateMatchAction(id: string, formData: FormData) {
  await assertAdminUser();

  let target = `/admin/matches/${id}?saved=1`;
  try {
    const input = matchSchema.parse(formDataToObject(formData));
    const result = await updateMatch(id, input);
    target = withNotice(target, await matchNotice(result, input.announce, "updated"));
    refreshAll();
    revalidatePath(`/matches/${id}`);
  } catch (error) {
    target = `/admin/matches/${id}?error=${encodeURIComponent(mutationError(error))}`;
  }

  redirect(target);
}

export async function updateMatchBracketAction(matchId: string, tournamentId: string, formData: FormData) {
  await assertAdminUser();

  let target = `/admin/tournaments/${tournamentId}?saved=1`;
  try {
    const input = bracketPlacementSchema.parse(formDataToObject(formData));
    await prisma.match.update({
      where: { id: matchId },
      data: {
        bracketStage: input.bracketStage || null,
        bracketRound: input.bracketRound ?? null,
        bracketPosition: input.bracketPosition ?? null
      }
    });
    refreshAll();
  } catch (error) {
    target = `/admin/tournaments/${tournamentId}?error=${encodeURIComponent(mutationError(error))}`;
  }

  redirect(target);
}

export async function announceMatchAction(matchId: string) {
  await assertAdminUser();

  const result = await announceMatchStats(matchId, "updated");
  const target = result.sent
    ? `/admin/matches/${matchId}?saved=1&notice=${encodeURIComponent("Posted to Discord.")}`
    : `/admin/matches/${matchId}?error=${encodeURIComponent(`Discord post failed: ${result.reason}`)}`;
  redirect(target);
}

export async function deleteMatchAction(id: string) {
  await runDelete(() => deleteMatch(id), "/admin/matches");
}

export async function createStatAction(formData: FormData) {
  await assertAdminUser();

  let target = "/admin/stats?saved=1";
  try {
    const input = statSchema.parse(formDataToObject(formData));
    await createStat(input);
    refreshAll();
    if (formData.get("announce") === "on") {
      const announcement = await announceMatchStats(input.matchId, "updated");
      target = withNotice(target, announcement.sent ? "Posted to Discord." : `Discord post skipped: ${announcement.reason}`);
    }
  } catch (error) {
    target = `/admin/stats?error=${encodeURIComponent(mutationError(error))}`;
  }

  redirect(target);
}

export async function updateStatAction(id: string, formData: FormData) {
  await runFormMutation(formData, statSchema, (input) => updateStat(id, input), "/admin/stats");
}

export async function deleteStatAction(id: string) {
  await runDelete(() => deleteStat(id), "/admin/stats");
}

export async function createAdminUserAction(formData: FormData) {
  const session = await assertAdminUser();

  let target = "/admin/admin-users?saved=1";
  try {
    const input = adminUserSchema.parse(formDataToObject(formData));
    await prisma.adminUser.upsert({
      where: { discordId: input.discordId },
      create: {
        discordId: input.discordId,
        addedBy: session.user.discordId || session.user.id
      },
      update: {}
    });
    refreshAll();
  } catch (error) {
    target = `/admin/admin-users?error=${encodeURIComponent(mutationError(error))}`;
  }

  redirect(target);
}

export async function sendAdminDmAction(formData: FormData) {
  await assertAdminUser();

  let target = "/admin/admin-users?dm=sent";
  try {
    if (!process.env.DISCORD_BOT_TOKEN) {
      throw new Error("DISCORD_BOT_TOKEN is not configured.");
    }

    const input = adminDmSchema.parse(formDataToObject(formData));
    const recipients: string[] = input.sendToAllAdmins
      ? (await prisma.adminUser.findMany({ orderBy: { createdAt: "desc" } })).map((admin) => admin.discordId)
      : input.targetDiscordId
        ? [input.targetDiscordId]
        : [];

    if (!recipients.length) {
      throw new Error("No recipients selected.");
    }

    const failed: string[] = [];
    for (const discordId of recipients) {
      try {
        await sendDiscordDm(discordId, input.message);
      } catch (error) {
        failed.push(`${discordId}: ${mutationError(error)}`);
      }
    }

    const sentCount = recipients.length - failed.length;
    target = `/admin/admin-users?dm=${sentCount}&failed=${encodeURIComponent(failed.join(","))}`;
  } catch (error) {
    target = `/admin/admin-users?error=${encodeURIComponent(mutationError(error))}`;
  }

  redirect(target);
}

export async function deleteAdminUserAction(id: string) {
  await runDelete(() => prisma.adminUser.delete({ where: { id } }), "/admin/admin-users");
}

export async function updateSiteSettingsAction(formData: FormData) {
  await assertAdminUser();

  let target = "/admin/settings?saved=1";
  try {
    const input = siteSettingsSchema.parse(formDataToObject(formData));
    await setSiteSetting(SETTING_KEYS.discordWebhookUrl, input.discordWebhookUrl || null);
    refreshAll();
  } catch (error) {
    target = `/admin/settings?error=${encodeURIComponent(mutationError(error))}`;
  }

  redirect(target);
}

export async function testDiscordWebhookAction(formData: FormData) {
  const session = await assertAdminUser();

  let target = "/admin/settings?saved=1";
  try {
    const typed = String(formData.get("discordWebhookUrl") || "").trim();
    const parsed = siteSettingsSchema.parse({ discordWebhookUrl: typed || (await getSiteSetting(SETTING_KEYS.discordWebhookUrl)) });
    if (!parsed.discordWebhookUrl) throw new Error("Add a webhook URL first.");

    await sendDiscordWebhook(
      {
        embeds: [
          {
            title: "OSCL webhook connected",
            description: `Match stat announcements will post here. Test sent by ${actorLabel(session)}.`,
            color: OSCL_EMBED_COLOR,
            footer: { text: "Old Siege: Challengers League" },
            timestamp: new Date().toISOString()
          }
        ]
      },
      parsed.discordWebhookUrl
    );
    target = withNotice(target, "Test message sent.");
  } catch (error) {
    target = `/admin/settings?error=${encodeURIComponent(mutationError(error))}`;
  }

  redirect(target);
}

export async function cachePlayerAvatarsAction(formData: FormData) {
  await assertAdminUser();

  let target = "/admin/settings?saved=1";
  try {
    const fromDiscord = formData.get("mode") === "refresh";
    const allPlayers = await prisma.player.findMany({
      where: fromDiscord ? { discordId: { not: null } } : undefined,
      select: { id: true, displayName: true, discordId: true, avatarUrl: true },
      // Least recently touched first, so repeated clicks work through the list.
      orderBy: { updatedAt: "asc" }
    });
    const players = fromDiscord ? allPlayers : allPlayers.filter((player) => player.avatarUrl && !player.avatarUrl.startsWith("/"));

    const results: AvatarRefreshResult[] = [];
    const startedAt = Date.now();
    let processed = 0;
    // Small batches keep Discord rate limits happy; the time budget keeps the
    // request under serverless timeouts. Anything left is picked up next click.
    while (processed < players.length && Date.now() - startedAt < 7000) {
      const batch = players.slice(processed, processed + 5);
      results.push(...(await Promise.all(batch.map((player) => refreshPlayerAvatar(player, { fromDiscord })))));
      processed += batch.length;
    }
    const remaining = players.length - processed;

    const count = (status: string) => results.filter((result) => result.status === status).length;
    const failed = results.filter((result) => result.status === "failed");
    const summary = `Avatars: ${count("refreshed")} refreshed from Discord, ${count("cached")} cached, ${count("skipped")} skipped, ${failed.length} failed.`;
    const failedNames = failed.length ? ` Failed: ${failed.slice(0, 8).map((result) => result.displayName).join(", ")}${failed.length > 8 ? "..." : ""}.` : "";
    const tokenHint = failed.length && !process.env.DISCORD_BOT_TOKEN ? " Set DISCORD_BOT_TOKEN to recover expired links from Discord IDs." : "";
    const more = remaining ? ` ${remaining} left, click again to continue.` : "";
    target = withNotice(target, (players.length ? summary : "Nothing to cache, every avatar is already stored locally.") + failedNames + tokenHint + more);
    refreshAll();
  } catch (error) {
    target = `/admin/settings?error=${encodeURIComponent(mutationError(error))}`;
  }

  redirect(target);
}

export async function refreshPlayerAvatarAction(id: string) {
  await assertAdminUser();

  const player = await prisma.player.findUnique({
    where: { id },
    select: { id: true, slug: true, displayName: true, discordId: true, avatarUrl: true }
  });
  if (!player) redirect(`/admin/players?error=${encodeURIComponent("Player not found.")}`);

  const result = await refreshPlayerAvatar(player, { fromDiscord: true });
  refreshAll();
  revalidatePath(`/players/${player.slug}`);
  redirect(
    result.status === "failed"
      ? `/admin/players/${id}?error=${encodeURIComponent(`Avatar refresh failed: ${result.detail}`)}`
      : `/admin/players/${id}?saved=1&notice=${encodeURIComponent(result.status === "refreshed" ? "Avatar refreshed from Discord." : "Avatar cached.")}`
  );
}

export async function bulkOperatorIconsAction(formData: FormData) {
  await assertAdminUser();

  let target = "/admin/settings?saved=1";
  try {
    const input = operatorIconBulkSchema.parse(formDataToObject(formData));
    const rows = input.mappingsRaw
      .split(/\r?\n/)
      .map((line) => line.split("|").map((part) => part.trim()))
      .filter(([name]) => name);

    for (const [name, iconPath] of rows) {
      const resolvedPath = iconPath || `/operator-icons/${name}.png`;
      await prisma.operatorIcon.upsert({
        where: { name },
        create: { name, iconPath: resolvedPath },
        update: { iconPath: resolvedPath }
      });
    }
    target = withNotice(target, `${rows.length} operator${rows.length === 1 ? "" : "s"} mapped.`);
    refreshAll();
  } catch (error) {
    target = `/admin/settings?error=${encodeURIComponent(mutationError(error))}`;
  }

  redirect(target);
}

export async function importOperatorIconsAction() {
  await assertAdminUser();

  let target = "/admin/settings?saved=1";
  try {
    const directory = path.join(process.cwd(), "public", "operator-icons");
    const files = (await readdir(directory).catch(() => [] as string[])).filter((file) => /\.(png|webp|jpg|jpeg|svg)$/i.test(file));
    if (!files.length) {
      throw new Error("No icon files found in public/operator-icons on this server. Use the bulk mapping box instead.");
    }

    for (const file of files) {
      const name = file.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim();
      await prisma.operatorIcon.upsert({
        where: { name },
        create: { name, iconPath: `/operator-icons/${file}` },
        update: { iconPath: `/operator-icons/${file}` }
      });
    }
    target = withNotice(target, `${files.length} icon${files.length === 1 ? "" : "s"} imported from the folder.`);
    refreshAll();
  } catch (error) {
    target = `/admin/settings?error=${encodeURIComponent(mutationError(error))}`;
  }

  redirect(target);
}

export async function upsertOperatorIconAction(formData: FormData) {
  await assertAdminUser();

  let target = "/admin/settings?saved=1";
  try {
    const input = operatorIconSchema.parse(formDataToObject(formData));
    await prisma.operatorIcon.upsert({
      where: { name: input.name },
      create: {
        name: input.name,
        iconPath: input.iconPath || null
      },
      update: {
        iconPath: input.iconPath || null
      }
    });
    refreshAll();
  } catch (error) {
    target = `/admin/settings?error=${encodeURIComponent(mutationError(error))}`;
  }

  redirect(target);
}

export async function deleteOperatorIconAction(id: string) {
  await runDelete(() => prisma.operatorIcon.delete({ where: { id } }), "/admin/settings");
}

export async function setPlayerOfWeekAction(formData: FormData) {
  await assertAdminUser();

  let target = "/admin/settings?saved=1";
  try {
    const input = playerOfWeekSchema.parse(formDataToObject(formData));
    await prisma.playerOfWeek.upsert({
      where: { weekStart: input.weekStart },
      create: {
        playerId: input.playerId,
        weekStart: input.weekStart,
        title: input.title || null,
        note: input.note || null
      },
      update: {
        playerId: input.playerId,
        title: input.title || null,
        note: input.note || null
      }
    });
    refreshAll();
  } catch (error) {
    target = `/admin/settings?error=${encodeURIComponent(mutationError(error))}`;
  }

  redirect(target);
}

export async function deletePlayerOfWeekAction(id: string) {
  await runDelete(() => prisma.playerOfWeek.delete({ where: { id } }), "/admin/settings");
}
