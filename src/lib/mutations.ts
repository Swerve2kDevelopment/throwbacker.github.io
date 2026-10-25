import type { MatchInput, PlayerInput, StatInput, TeamInput, TournamentInput } from "@/lib/validators";
import { MatchKind, type Match } from "@prisma/client";
import { cachePlayerAvatar } from "@/lib/avatar-cache";
import { getDiscordUserProfile } from "@/lib/discord-bot";
import { prisma } from "@/lib/prisma";
import { slugify } from "@/lib/format";
import { normalizeName, parseBulkStats, parseKeyMoments } from "@/lib/match-entry";
import { parseMapRows, selectedIds } from "@/lib/validators";

function cleanSlug(provided: string | undefined, fallback: string) {
  return slugify(provided?.trim() || fallback);
}

function uniqueIds(ids: string[]) {
  return [...new Set(ids.filter(Boolean))];
}

async function playerDiscordProfile(input: PlayerInput) {
  const fallback = {
    discordUsername: input.discordUsername || null,
    avatarUrl: input.avatarUrl || null
  };

  if (!input.discordId || (input.avatarUrl && input.discordUsername)) {
    return fallback;
  }

  try {
    const profile = await getDiscordUserProfile(input.discordId);
    return {
      discordUsername: input.discordUsername || profile.discordUsername || null,
      avatarUrl: input.avatarUrl || profile.avatarUrl || null
    };
  } catch {
    return fallback;
  }
}

export async function syncPlayerCurrentTeam(playerId: string, teamId?: string | null) {
  const now = new Date();

  await prisma.teamMembership.updateMany({
    where: {
      playerId,
      isCurrent: true,
      ...(teamId ? { teamId: { not: teamId } } : {})
    },
    data: {
      isCurrent: false,
      endDate: now
    }
  });

  if (teamId) {
    const currentMembership = await prisma.teamMembership.findFirst({
      where: {
        playerId,
        teamId,
        isCurrent: true
      },
      select: { id: true }
    });

    if (!currentMembership) {
      await prisma.teamMembership.create({
        data: {
          playerId,
          teamId,
          startDate: now,
          isCurrent: true
        }
      });
    }
  }

  return prisma.player.update({
    where: { id: playerId },
    data: { currentTeamId: teamId || null }
  });
}

export async function syncTeamRoster(teamId: string, playerIds: string[]) {
  const rosterIds = uniqueIds(playerIds);

  const currentPlayers = await prisma.player.findMany({
    where: { currentTeamId: teamId },
    select: { id: true }
  });

  for (const player of currentPlayers) {
    if (!rosterIds.includes(player.id)) {
      await syncPlayerCurrentTeam(player.id, null);
    }
  }

  for (const playerId of rosterIds) {
    await syncPlayerCurrentTeam(playerId, teamId);
  }
}

export async function syncTournamentTeams(tournamentId: string, teamIds: string[]) {
  const ids = uniqueIds(teamIds);

  await prisma.tournamentTeam.deleteMany({
    where: {
      tournamentId,
      teamId: {
        notIn: ids.length ? ids : ["__none__"]
      }
    }
  });

  for (const [index, teamId] of ids.entries()) {
    await prisma.tournamentTeam.upsert({
      where: {
        tournamentId_teamId: {
          tournamentId,
          teamId
        }
      },
      create: {
        tournamentId,
        teamId,
        seed: index + 1
      },
      update: {
        seed: index + 1
      }
    });
  }
}

export async function createPlayer(input: PlayerInput) {
  const discordProfile = await playerDiscordProfile(input);
  const player = await prisma.player.create({
    data: {
      displayName: input.displayName,
      slug: cleanSlug(input.slug, input.displayName),
      discordId: input.discordId || null,
      discordUsername: discordProfile.discordUsername,
      nationality: input.nationality || null,
      avatarUrl: discordProfile.avatarUrl,
      currentTeamId: input.currentTeamId || null,
      realName: input.realName || null,
      role: input.role || null,
      status: input.status || null,
      dateOfBirth: input.dateOfBirth || null,
      socialLinks: input.socialLinks,
      aliases: input.aliases,
      notes: input.notes || null
    }
  });

  if (input.currentTeamId) {
    await syncPlayerCurrentTeam(player.id, input.currentTeamId);
  }

  if (discordProfile.avatarUrl) {
    const avatarUrl = await cachePlayerAvatar(player.id, discordProfile.avatarUrl);
    return prisma.player.update({ where: { id: player.id }, data: { avatarUrl } });
  }

  return player;
}

export async function updatePlayer(id: string, input: PlayerInput) {
  const discordProfile = await playerDiscordProfile(input);
  const avatarUrl = await cachePlayerAvatar(id, discordProfile.avatarUrl);
  const player = await prisma.player.update({
    where: { id },
    data: {
      displayName: input.displayName,
      slug: cleanSlug(input.slug, input.displayName),
      discordId: input.discordId || null,
      discordUsername: discordProfile.discordUsername,
      nationality: input.nationality || null,
      avatarUrl,
      realName: input.realName || null,
      role: input.role || null,
      status: input.status || null,
      dateOfBirth: input.dateOfBirth || null,
      socialLinks: input.socialLinks,
      aliases: input.aliases,
      notes: input.notes || null
    }
  });

  await syncPlayerCurrentTeam(id, input.currentTeamId || null);
  return player;
}

export async function deletePlayer(id: string) {
  return prisma.player.delete({ where: { id } });
}

export async function createTeam(input: TeamInput) {
  const team = await prisma.team.create({
    data: {
      name: input.name,
      slug: cleanSlug(input.slug, input.name),
      tag: input.tag || null,
      logoUrl: input.logoUrl || null,
      themeColor: input.themeColor || null,
      region: input.region || null,
      description: input.description || null
    }
  });

  await syncTeamRoster(team.id, selectedIds(input.currentRosterIds, input.playerIds));
  return team;
}

export async function updateTeam(id: string, input: TeamInput) {
  const team = await prisma.team.update({
    where: { id },
    data: {
      name: input.name,
      slug: cleanSlug(input.slug, input.name),
      tag: input.tag || null,
      logoUrl: input.logoUrl || null,
      themeColor: input.themeColor || null,
      region: input.region || null,
      description: input.description || null
    }
  });

  await syncTeamRoster(id, selectedIds(input.currentRosterIds, input.playerIds));
  return team;
}

export async function deleteTeam(id: string) {
  return prisma.team.delete({ where: { id } });
}

export async function createTournament(input: TournamentInput) {
  const tournament = await prisma.tournament.create({
    data: {
      name: input.name,
      slug: cleanSlug(input.slug, input.name),
      description: input.description || null,
      status: input.status,
      startDate: input.startDate || null,
      endDate: input.endDate || null,
      prizePool: input.prizePool || null,
      logoUrl: input.logoUrl || null,
      bannerUrl: input.bannerUrl || null,
      bracketType: input.bracketType,
      mapVetoes: input.mapVetoes,
      operatorBans: input.operatorBans,
      mvpPlayerId: input.mvpPlayerId || null,
      featured: input.featured
    }
  });

  await syncTournamentTeams(tournament.id, selectedIds(input.selectedTeamIds, input.teamIds));
  return tournament;
}

export async function updateTournament(id: string, input: TournamentInput) {
  const tournament = await prisma.tournament.update({
    where: { id },
    data: {
      name: input.name,
      slug: cleanSlug(input.slug, input.name),
      description: input.description || null,
      status: input.status,
      startDate: input.startDate || null,
      endDate: input.endDate || null,
      prizePool: input.prizePool || null,
      logoUrl: input.logoUrl || null,
      bannerUrl: input.bannerUrl || null,
      bracketType: input.bracketType,
      mapVetoes: input.mapVetoes,
      operatorBans: input.operatorBans,
      mvpPlayerId: input.mvpPlayerId || null,
      featured: input.featured
    }
  });

  await syncTournamentTeams(id, selectedIds(input.selectedTeamIds, input.teamIds));
  return tournament;
}

export async function deleteTournament(id: string) {
  return prisma.tournament.delete({ where: { id } });
}

async function replaceMatchMaps(matchId: string, maps: NonNullable<MatchInput["maps"]>) {
  // Update maps in place by order so stat rows attached to a map survive edits.
  const existing = await prisma.mapGame.findMany({ where: { matchId }, orderBy: { order: "asc" } });
  const ordered = maps.map((map, index) => ({ ...map, order: map.order || index + 1 }));

  for (const [index, map] of ordered.entries()) {
    const current = existing.find((entry) => entry.order === map.order) || existing[index];
    const data = {
      mapName: map.mapName,
      teamAScore: map.teamAScore,
      teamBScore: map.teamBScore,
      winnerTeamId: map.winnerTeamId || null,
      winnerSide: map.winnerSide || null,
      order: map.order
    };

    if (current) {
      await prisma.mapGame.update({ where: { id: current.id }, data });
      existing.splice(existing.indexOf(current), 1);
    } else {
      await prisma.mapGame.create({ data: { ...data, matchId } });
    }
  }

  if (existing.length) {
    await prisma.mapGame.deleteMany({ where: { id: { in: existing.map((entry) => entry.id) } } });
  }
}

function mapsFromInput(input: MatchInput) {
  if (input.maps) return input.maps;
  return parseMapRows(input.mapsRaw);
}

async function syncMatchParticipants(matchId: string, teamAPlayerIds: string[], teamBPlayerIds: string[]) {
  await prisma.matchParticipant.deleteMany({ where: { matchId } });

  const sideA = uniqueIds(teamAPlayerIds).map((playerId) => ({
    matchId,
    playerId,
    side: "A" as const
  }));
  const sideB = uniqueIds(teamBPlayerIds).map((playerId) => ({
    matchId,
    playerId,
    side: "B" as const
  }));

  const data = [...sideA, ...sideB].filter((entry, index, entries) => entries.findIndex((item) => item.playerId === entry.playerId) === index);
  if (data.length) {
    await prisma.matchParticipant.createMany({ data });
  }
}

async function playerLookup() {
  const players = await prisma.player.findMany({
    select: { id: true, displayName: true, slug: true, aliases: true, discordUsername: true, currentTeamId: true }
  });
  const byName = new Map<string, string>();
  const teamById = new Map<string, string | null>();
  for (const player of players) {
    teamById.set(player.id, player.currentTeamId);
    for (const key of [player.id, player.slug, player.displayName, player.discordUsername || "", ...player.aliases]) {
      const normalized = normalizeName(key);
      if (normalized && !byName.has(normalized)) byName.set(normalized, player.id);
    }
  }
  return { byName, teamById };
}

export type MatchSaveResult = {
  match: Match;
  statsSaved: number;
  warnings: string[];
};

async function ensureMapForStats(matchId: string, input: MatchInput) {
  const maps = await prisma.mapGame.findMany({ where: { matchId }, orderBy: { order: "asc" } });
  if (maps.length) return maps;

  const created = await prisma.mapGame.create({
    data: {
      matchId,
      mapName: "Unlisted map",
      teamAScore: input.scoreA,
      teamBScore: input.scoreB,
      winnerSide: input.winnerSide || null,
      order: 1
    }
  });
  return [created];
}

async function syncBulkMatchStats(matchId: string, input: MatchInput, warnings: string[]) {
  const rows = parseBulkStats(input.bulkStatsRaw);
  if (!rows.length) return 0;

  const maps = await ensureMapForStats(matchId, input);
  const match = await prisma.match.findUnique({ where: { id: matchId }, select: { tournamentId: true, teamAId: true, teamBId: true } });
  const { byName, teamById } = await playerLookup();
  const sideA = new Set(input.teamAPlayerIds);
  const sideB = new Set(input.teamBPlayerIds);
  const unknown = new Set<string>();
  const unknownMaps = new Set<string>();
  const unsided = new Set<string>();
  const inferredA = new Set<string>();
  const inferredB = new Set<string>();
  const savedKeys = new Set<string>();
  let saved = 0;

  for (const row of rows) {
    const playerId = byName.get(normalizeName(row.name));
    if (!playerId) {
      unknown.add(row.name);
      continue;
    }

    const ref = row.mapRef;
    const mapGame = ref
      ? maps.find((map) => (ref.order ? map.order === ref.order : normalizeName(map.mapName) === normalizeName(ref.name || "")))
      : maps[0];
    if (!mapGame) {
      unknownMaps.add(ref?.name || `Map ${ref?.order}`);
      continue;
    }

    let side: "A" | "B" | null = sideA.has(playerId) ? "A" : sideB.has(playerId) ? "B" : null;
    if (!side) {
      const teamId = teamById.get(playerId);
      if (teamId && teamId === match?.teamAId) {
        side = "A";
        inferredA.add(playerId);
      } else if (teamId && teamId === match?.teamBId) {
        side = "B";
        inferredB.add(playerId);
      } else {
        unsided.add(row.name);
      }
    }

    const data = {
      tournamentId: match?.tournamentId || null,
      teamId: side === "A" ? match?.teamAId || null : side === "B" ? match?.teamBId || null : null,
      side,
      kills: row.kills,
      deaths: row.deaths,
      assists: row.assists,
      headshots: Math.min(row.headshots, row.kills),
      roundsPlayed: row.rounds ?? mapGame.teamAScore + mapGame.teamBScore,
      ratingOverride: row.rating
    };

    await prisma.playerMapStats.upsert({
      where: { playerId_mapGameId: { playerId, mapGameId: mapGame.id } },
      create: { ...data, playerId, matchId, mapGameId: mapGame.id },
      update: data
    });
    savedKeys.add(`${playerId}:${mapGame.id}`);
    saved += 1;
  }

  // The match builder sends the whole scoreboard, so anything it no longer
  // contains (a player removed from the grid) should go too.
  if (input.statsReplace && saved) {
    const existing = await prisma.playerMapStats.findMany({ where: { matchId }, select: { id: true, playerId: true, mapGameId: true } });
    const stale = existing.filter((stat) => !savedKeys.has(`${stat.playerId}:${stat.mapGameId}`)).map((stat) => stat.id);
    if (stale.length) await prisma.playerMapStats.deleteMany({ where: { id: { in: stale } } });
  }

  if (inferredA.size || inferredB.size) {
    await prisma.matchParticipant.createMany({
      data: [
        ...[...inferredA].map((playerId) => ({ matchId, playerId, side: "A" as const })),
        ...[...inferredB].map((playerId) => ({ matchId, playerId, side: "B" as const }))
      ],
      skipDuplicates: true
    });
  }

  if (unknown.size) warnings.push(`Skipped unknown players: ${[...unknown].join(", ")}. Add them or give them an alias, then save again.`);
  if (unknownMaps.size) warnings.push(`No map matched: ${[...unknownMaps].join(", ")}.`);
  if (unsided.size) warnings.push(`No side set for: ${[...unsided].join(", ")}. Pick them under Team A/B players so wins count toward MMR.`);

  return saved;
}

async function syncMatchKeyMoments(matchId: string, raw: string | undefined, warnings: string[]) {
  await prisma.playerKeyMoment.deleteMany({ where: { matchId } });
  const rows = parseKeyMoments(raw);
  if (!rows.length) return;

  const { byName } = await playerLookup();
  const unknown: string[] = [];
  const data = rows.flatMap((row) => {
    const playerId = byName.get(normalizeName(row.name));
    if (!playerId) {
      unknown.push(row.name);
      return [];
    }
    return [{ matchId, playerId, text: row.text }];
  });

  if (data.length) await prisma.playerKeyMoment.createMany({ data });
  if (unknown.length) warnings.push(`Key moments skipped for unknown players: ${unknown.join(", ")}.`);
}

function matchData(input: MatchInput) {
  return {
    tournamentId: input.tournamentId || null,
    leagueId: input.matchKind === MatchKind.LEAGUE ? input.leagueId || null : null,
    matchKind: input.matchKind,
    teamAId: input.teamAId || null,
    teamBId: input.teamBId || null,
    customTeamAName: input.customTeamAName || null,
    customTeamBName: input.customTeamBName || null,
    format: input.format,
    scoreA: input.scoreA,
    scoreB: input.scoreB,
    winnerTeamId: input.winnerTeamId || null,
    winnerSide: input.winnerSide || null,
    status: input.status,
    playedAt: input.playedAt || null,
    mapVetoes: input.mapVetoes,
    operatorBans: input.operatorBans,
    title: input.title || null,
    bracketStage: input.tournamentId ? input.bracketStage || null : null,
    bracketRound: input.tournamentId ? input.bracketRound ?? null : null,
    bracketPosition: input.tournamentId ? input.bracketPosition ?? null : null
  };
}

export async function createMatch(input: MatchInput): Promise<MatchSaveResult> {
  const warnings: string[] = [];
  const match = await prisma.match.create({ data: matchData(input) });

  await replaceMatchMaps(match.id, mapsFromInput(input));
  await syncMatchParticipants(match.id, input.teamAPlayerIds, input.teamBPlayerIds);
  const statsSaved = await syncBulkMatchStats(match.id, input, warnings);
  await syncMatchKeyMoments(match.id, input.keyMomentsRaw, warnings);
  return { match, statsSaved, warnings };
}

export async function updateMatch(id: string, input: MatchInput): Promise<MatchSaveResult> {
  const warnings: string[] = [];
  const match = await prisma.match.update({ where: { id }, data: matchData(input) });

  if (input.maps || input.mapsRaw?.trim()) {
    await replaceMatchMaps(id, mapsFromInput(input));
  }

  await syncMatchParticipants(id, input.teamAPlayerIds, input.teamBPlayerIds);
  const statsSaved = await syncBulkMatchStats(id, input, warnings);
  if (input.keyMomentsRaw !== undefined) {
    await syncMatchKeyMoments(id, input.keyMomentsRaw, warnings);
  }
  return { match, statsSaved, warnings };
}

export async function deleteMatch(id: string) {
  return prisma.match.delete({ where: { id } });
}

export async function createStat(input: StatInput) {
  return prisma.playerMapStats.upsert({
    where: {
      playerId_mapGameId: {
        playerId: input.playerId,
        mapGameId: input.mapGameId
      }
    },
    create: {
      ...input,
      teamId: input.teamId || null,
      tournamentId: input.tournamentId || null,
      side: input.side || null,
      ratingOverride: input.ratingOverride ?? null
    },
    update: {
      teamId: input.teamId || null,
      tournamentId: input.tournamentId || null,
      matchId: input.matchId,
      side: input.side || null,
      kills: input.kills,
      deaths: input.deaths,
      assists: input.assists,
      headshots: input.headshots,
      plants: input.plants,
      defuses: input.defuses,
      oneVX: input.oneVX,
      openingKills: input.openingKills,
      openingDeaths: input.openingDeaths,
      roundsPlayed: input.roundsPlayed,
      kostRounds: input.kostRounds,
      ratingOverride: input.ratingOverride ?? null
    }
  });
}

export async function updateStat(id: string, input: StatInput) {
  return prisma.playerMapStats.update({
    where: { id },
    data: {
      ...input,
      teamId: input.teamId || null,
      tournamentId: input.tournamentId || null,
      side: input.side || null,
      ratingOverride: input.ratingOverride ?? null
    }
  });
}

export async function deleteStat(id: string) {
  return prisma.playerMapStats.delete({ where: { id } });
}
