"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { TransferRequestStatus } from "@prisma/client";

import { getAuthSession } from "@/lib/permissions";
import { sendDiscordDm } from "@/lib/discord-bot";
import { syncPlayerCurrentTeam } from "@/lib/mutations";
import { prisma } from "@/lib/prisma";
import { pushPlayerWidget } from "@/lib/discord-widget";
import { announceRecruitmentPost, announceSigningRequest } from "@/lib/team-announcements";
import { recruitmentPostSchema } from "@/lib/validators";

async function requireTeamManager(teamId: string) {
  const session = await getAuthSession();
  if (!session?.user?.id || !session.user.discordId) {
    redirect("/login?callbackUrl=/account");
  }

  const manager = await prisma.teamManager.findUnique({
    where: {
      teamId_discordId: {
        teamId,
        discordId: session.user.discordId
      }
    },
    include: { team: true }
  });

  if (!manager) {
    redirect("/account?transfer=denied");
  }

  return { session, manager };
}

function refreshTransfers(teamSlug?: string, playerSlug?: string) {
  revalidatePath("/account");
  revalidatePath("/teams");
  revalidatePath("/");
  if (teamSlug) revalidatePath(`/teams/${teamSlug}`);
  if (playerSlug) revalidatePath(`/players/${playerSlug}`);
}

function siteUrl() {
  return (process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXTAUTH_URL || "https://throwbacktracker.com").replace(/\/$/, "");
}

export async function toggleFavoritePlayerAction(playerId: string, slug: string) {
  const session = await getAuthSession();
  if (!session?.user?.id) {
    redirect(`/login?callbackUrl=/players/${slug}`);
  }

  const existing = await prisma.favoritePlayer.findUnique({
    where: {
      userId_playerId: {
        userId: session.user.id,
        playerId
      }
    }
  });

  if (existing) {
    await prisma.favoritePlayer.delete({ where: { id: existing.id } });
  } else {
    await prisma.favoritePlayer.create({
      data: {
        userId: session.user.id,
        playerId
      }
    });
  }

  revalidatePath(`/players/${slug}`);
  revalidatePath("/account");
  redirect(`/players/${slug}`);
}

export async function toggleFavoriteTournamentAction(tournamentId: string, slug: string) {
  const session = await getAuthSession();
  if (!session?.user?.id) {
    redirect(`/login?callbackUrl=/tournaments/${slug}`);
  }

  const existing = await prisma.favoriteTournament.findUnique({
    where: {
      userId_tournamentId: {
        userId: session.user.id,
        tournamentId
      }
    }
  });

  if (existing) {
    await prisma.favoriteTournament.delete({ where: { id: existing.id } });
  } else {
    await prisma.favoriteTournament.create({
      data: {
        userId: session.user.id,
        tournamentId
      }
    });
  }

  revalidatePath(`/tournaments/${slug}`);
  revalidatePath("/account");
  redirect(`/tournaments/${slug}`);
}

export async function sendTransferRequestAction(teamId: string, formData: FormData) {
  const { session, manager } = await requireTeamManager(teamId);
  const playerId = String(formData.get("playerId") || "");
  const note = String(formData.get("note") || "").trim() || null;

  const player = await prisma.player.findUnique({ where: { id: playerId }, select: { id: true, slug: true, displayName: true, discordId: true } });
  if (!player?.discordId) redirect("/account?transfer=no-discord");

  const existing = await prisma.transferRequest.findFirst({
    where: {
      teamId,
      playerId,
      status: TransferRequestStatus.PENDING
    },
    select: { id: true }
  });
  if (existing) redirect("/account?transfer=already-pending");

  await prisma.transferRequest.create({
    data: {
      teamId,
      playerId,
      requestedById: session.user.id,
      note
    }
  });

  if (process.env.DISCORD_BOT_TOKEN) {
    try {
      await sendDiscordDm(
        player.discordId,
        `${manager.team.name} are looking to sign ${player.displayName} in OSCL.\n\nOpen ${siteUrl()}/account to accept or decline the request.${note ? `\n\nManager note: ${note}` : ""}`
      );
    } catch {
      // The in-app request is the source of truth; Discord may block DMs based on the user's privacy settings.
    }
  }

  await announceSigningRequest(manager.team, player);

  refreshTransfers(manager.team.slug, player.slug);
  redirect("/account?transfer=requested");
}

export async function respondTransferRequestAction(requestId: string, decision: "accept" | "decline") {
  const session = await getAuthSession();
  if (!session?.user?.id || !session.user.discordId) redirect("/login?callbackUrl=/account");

  const request = await prisma.transferRequest.findUnique({
    where: { id: requestId },
    include: { player: true, team: true }
  });

  if (!request || request.status !== TransferRequestStatus.PENDING || request.player.discordId !== session.user.discordId) {
    redirect("/account?transfer=invalid");
  }

  if (decision === "decline") {
    await prisma.transferRequest.update({
      where: { id: request.id },
      data: { status: TransferRequestStatus.DECLINED, respondedAt: new Date() }
    });
    refreshTransfers(request.team.slug, request.player.slug);
    redirect("/account?transfer=declined");
  }

  await prisma.$transaction(async (tx) => {
    await tx.transferRequest.update({
      where: { id: request.id },
      data: { status: TransferRequestStatus.ACCEPTED, respondedAt: new Date() }
    });
    await tx.player.update({
      where: { id: request.playerId },
      data: { status: "Active" }
    });
    await tx.transferEvent.create({
      data: {
        teamId: request.teamId,
        playerId: request.playerId,
        actorId: session.user.id,
        type: "JOINED",
        note: request.note
      }
    });
  });

  await syncPlayerCurrentTeam(request.playerId, request.teamId);
  refreshTransfers(request.team.slug, request.player.slug);
  redirect("/account?transfer=accepted");
}

export async function releasePlayerAction(teamId: string, playerId: string) {
  const { session, manager } = await requireTeamManager(teamId);
  const player = await prisma.player.findUnique({ where: { id: playerId }, select: { slug: true, currentTeamId: true } });
  if (!player || player.currentTeamId !== teamId) redirect("/account?transfer=invalid");

  await syncPlayerCurrentTeam(playerId, null);
  await prisma.player.update({ where: { id: playerId }, data: { status: "Free Agent" } });
  await prisma.transferEvent.create({
    data: {
      teamId,
      playerId,
      actorId: session.user.id,
      type: "LEFT"
    }
  });

  refreshTransfers(manager.team.slug, player.slug);
  redirect("/account?transfer=released");
}

export async function benchPlayerAction(teamId: string, playerId: string) {
  const { session, manager } = await requireTeamManager(teamId);
  const player = await prisma.player.findUnique({ where: { id: playerId }, select: { slug: true, currentTeamId: true } });
  if (!player || player.currentTeamId !== teamId) redirect("/account?transfer=invalid");

  await prisma.player.update({ where: { id: playerId }, data: { status: "Benched" } });
  await prisma.transferEvent.create({
    data: {
      teamId,
      playerId,
      actorId: session.user.id,
      type: "BENCHED"
    }
  });

  refreshTransfers(manager.team.slug, player.slug);
  redirect("/account?transfer=benched");
}

export async function createRecruitmentPostAction(teamId: string, formData: FormData) {
  const { session, manager } = await requireTeamManager(teamId);

  const parsed = recruitmentPostSchema.safeParse({ role: formData.get("role"), note: formData.get("note") });
  if (!parsed.success) redirect(`/account?recruit=${encodeURIComponent(parsed.error.issues[0]?.message || "invalid")}`);
  const { role, note } = parsed.data;

  // One open post per role keeps the channel from being spammed.
  const duplicate = await prisma.teamRecruitmentPost.findFirst({
    where: { teamId, closedAt: null, role: role ?? null },
    select: { id: true }
  });
  if (duplicate) redirect("/account?recruit=already-open");

  const postedBy = session.user.name || session.user.username || null;
  await prisma.teamRecruitmentPost.create({
    data: { teamId, role: role ?? null, note: note ?? null, postedBy }
  });

  const announcement = await announceRecruitmentPost(manager.team, { role: role ?? null, note: note ?? null, postedBy });

  refreshTransfers(manager.team.slug);
  redirect(`/account?recruit=${announcement.sent ? "posted" : "posted-not-announced"}`);
}

export async function closeRecruitmentPostAction(postId: string) {
  const post = await prisma.teamRecruitmentPost.findUnique({ where: { id: postId }, select: { teamId: true } });
  if (!post) redirect("/account?recruit=invalid");

  const { manager } = await requireTeamManager(post.teamId);
  await prisma.teamRecruitmentPost.update({ where: { id: postId }, data: { closedAt: new Date() } });

  refreshTransfers(manager.team.slug);
  redirect("/account?recruit=closed");
}

async function requireLinkedPlayer() {
  const session = await getAuthSession();
  if (!session?.user?.discordId) redirect("/login?callbackUrl=/account");
  const player = await prisma.player.findFirst({ where: { discordId: session.user.discordId }, select: { id: true } });
  if (!player) redirect("/account?widget=no-player");
  return player;
}

export async function refreshMyWidgetAction() {
  const player = await requireLinkedPlayer();
  const result = await pushPlayerWidget(player.id);
  redirect(`/account?widget=${result.ok ? "refreshed" : `sync-failed-${result.status}`}`);
}

export async function unlinkMyWidgetAction() {
  const player = await requireLinkedPlayer();
  await prisma.player.update({ where: { id: player.id }, data: { discordWidgetLinkedAt: null } });
  redirect("/account?widget=unlinked");
}
