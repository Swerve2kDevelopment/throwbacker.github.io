import { MatchKind, MatchStatus } from "@prisma/client";

import { apiError, guardAdminRequest, jsonError, jsonSuccess } from "@/lib/api";
import { aiMatchDraftSchema, repairAiDraftPlayerIds } from "@/lib/ai-match-helper";
import { announceMatchStats } from "@/lib/match-announcements";
import { createMatch, createStat } from "@/lib/mutations";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const blocked = await guardAdminRequest(request);
  if (blocked) return blocked;

  try {
    const body = await request.json().catch(() => ({}));
    const parsedDraft = aiMatchDraftSchema.parse(body.draft);
    const players = await prisma.player.findMany({
      select: {
        id: true,
        displayName: true,
        aliases: true,
        discordId: true,
        discordUsername: true
      }
    });
    const draft = repairAiDraftPlayerIds(parsedDraft, players);

    const knownPlayerIds = new Set(players.map((player) => player.id));
    const unknownPlayers = [...draft.teamAPlayerIds, ...draft.teamBPlayerIds, ...draft.stats.map((stat) => stat.playerId)].filter(
      (id) => !knownPlayerIds.has(id)
    );
    if (unknownPlayers.length) {
      return jsonError(`Unknown player IDs: ${[...new Set(unknownPlayers)].join(", ")}`, 422);
    }

    if (draft.tournamentId) {
      const tournament = await prisma.tournament.findUnique({ where: { id: draft.tournamentId }, select: { id: true } });
      if (!tournament) return jsonError("Selected tournament was not found.", 422);
    }

    const defaultLeague = draft.format >= 4 ? await prisma.league.findUnique({ where: { slug: "oscl" }, select: { id: true } }) : null;

    const { match } = await createMatch({
      tournamentId: draft.tournamentId,
      leagueId: defaultLeague?.id || null,
      matchKind: defaultLeague ? MatchKind.LEAGUE : MatchKind.FUN,
      teamAId: null,
      teamBId: null,
      customTeamAName: draft.customTeamAName,
      customTeamBName: draft.customTeamBName,
      format: draft.format,
      teamAPlayerIds: draft.teamAPlayerIds,
      teamBPlayerIds: draft.teamBPlayerIds,
      scoreA: draft.scoreA,
      scoreB: draft.scoreB,
      winnerTeamId: null,
      winnerSide: draft.winnerSide,
      status: draft.status || MatchStatus.COMPLETED,
      playedAt: draft.playedAt ? new Date(draft.playedAt) : new Date(),
      mapVetoes: [],
      operatorBans: [],
      announce: false,
      maps: draft.maps.map((map, index) => ({
        mapName: map.mapName,
        teamAScore: map.teamAScore,
        teamBScore: map.teamBScore,
        winnerTeamId: null,
        winnerSide: map.winnerSide,
        order: index + 1
      }))
    });

    const maps = await prisma.mapGame.findMany({
      where: { matchId: match.id },
      select: { id: true, mapName: true }
    });
    const mapByName = new Map(maps.map((map) => [map.mapName, map]));

    for (const stat of draft.stats) {
      const map = mapByName.get(stat.mapName);
      if (!map) continue;
      await createStat({
        playerId: stat.playerId,
        teamId: null,
        tournamentId: draft.tournamentId,
        matchId: match.id,
        mapGameId: map.id,
        side: stat.side,
        kills: stat.kills,
        deaths: stat.deaths,
        assists: stat.assists,
        headshots: stat.headshots,
        plants: stat.plants,
        defuses: stat.defuses,
        oneVX: stat.oneVX,
        openingKills: stat.openingKills,
        openingDeaths: stat.openingDeaths,
        roundsPlayed: stat.roundsPlayed,
        kostRounds: stat.kostRounds,
        ratingOverride: stat.ratingOverride
      });
    }

    await announceMatchStats(match.id);

    return jsonSuccess({ matchId: match.id, matchUrl: `/matches/${match.id}` }, 201);
  } catch (error) {
    return apiError(error);
  }
}
