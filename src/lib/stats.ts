import type { Player, PlayerMapStats, Team } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { calculatePlayerRank, type PlayerRank } from "@/lib/ranks";
import { calculateMapRating } from "@/lib/rating";

type StatEntry = Pick<
  PlayerMapStats,
  | "kills"
  | "deaths"
  | "assists"
  | "headshots"
  | "plants"
  | "defuses"
  | "oneVX"
  | "openingKills"
  | "openingDeaths"
  | "roundsPlayed"
  | "kostRounds"
  | "ratingOverride"
>;

export type AggregateStats = {
  rating: number;
  kills: number;
  deaths: number;
  assists: number;
  kd: number;
  kdDiff: number;
  maps: number;
  rounds: number;
  kostPercent: number;
  oneVX: number;
  plants: number;
  defuses: number;
  headshots: number;
  hsPercent: number;
  openingKills: number;
  openingDeaths: number;
  entryDiff: number;
};

export type PlayerWithStats = Player & {
  currentTeam: Team | null;
  aggregate: AggregateStats;
  rank: PlayerRank;
};

export type LeaderboardMetric = "mmr" | "rating" | "kd" | "kdDiff" | "kills" | "hsPercent" | "maps";

export const leaderboardLabels: Record<LeaderboardMetric, string> = {
  mmr: "Ranked MMR",
  rating: "Rating",
  kd: "KD",
  kdDiff: "KD +/-",
  kills: "Kills",
  hsPercent: "HS%",
  maps: "Maps"
};

function calculatedMapRating(entry: StatEntry) {
  return calculateMapRating(entry);
}

export function emptyAggregateStats(): AggregateStats {
  return {
    rating: 0,
    kills: 0,
    deaths: 0,
    assists: 0,
    kd: 0,
    kdDiff: 0,
    maps: 0,
    rounds: 0,
    kostPercent: 0,
    oneVX: 0,
    plants: 0,
    defuses: 0,
    headshots: 0,
    hsPercent: 0,
    openingKills: 0,
    openingDeaths: 0,
    entryDiff: 0
  };
}

export function calculateAggregateStats(entries: StatEntry[]): AggregateStats {
  if (!entries.length) return emptyAggregateStats();

  const totals = entries.reduce(
    (acc, entry) => {
      acc.kills += entry.kills;
      acc.deaths += entry.deaths;
      acc.assists += entry.assists;
      acc.headshots += entry.headshots;
      acc.plants += entry.plants;
      acc.defuses += entry.defuses;
      acc.oneVX += entry.oneVX;
      acc.openingKills += entry.openingKills;
      acc.openingDeaths += entry.openingDeaths;
      acc.rounds += entry.roundsPlayed;
      acc.kostRounds += entry.kostRounds;
      acc.rating += calculatedMapRating(entry);
      return acc;
    },
    {
      kills: 0,
      deaths: 0,
      assists: 0,
      headshots: 0,
      plants: 0,
      defuses: 0,
      oneVX: 0,
      openingKills: 0,
      openingDeaths: 0,
      rounds: 0,
      kostRounds: 0,
      rating: 0
    }
  );

  return {
    rating: totals.rating / entries.length,
    kills: totals.kills,
    deaths: totals.deaths,
    assists: totals.assists,
    kd: totals.deaths === 0 ? totals.kills : totals.kills / totals.deaths,
    kdDiff: totals.kills - totals.deaths,
    maps: entries.length,
    rounds: totals.rounds,
    kostPercent: totals.rounds ? (totals.kostRounds / totals.rounds) * 100 : 0,
    oneVX: totals.oneVX,
    plants: totals.plants,
    defuses: totals.defuses,
    headshots: totals.headshots,
    hsPercent: totals.kills ? (totals.headshots / totals.kills) * 100 : 0,
    openingKills: totals.openingKills,
    openingDeaths: totals.openingDeaths,
    entryDiff: totals.openingKills - totals.openingDeaths
  };
}

export async function getPlayerAggregateStats(
  playerId: string,
  filter: { tournamentId?: string; matchId?: string; teamId?: string } = {}
) {
  const entries = await prisma.playerMapStats.findMany({
    where: {
      playerId,
      tournamentId: filter.tournamentId,
      matchId: filter.matchId,
      teamId: filter.teamId
    }
  });

  return calculateAggregateStats(entries);
}

export async function getPlayersWithAggregateStats(filter: { tournamentId?: string } = {}) {
  const players = await prisma.player.findMany({
    include: {
      currentTeam: true,
      stats: {
        where: {
          tournamentId: filter.tournamentId
        },
        include: {
          match: {
            select: { winnerSide: true }
          },
          mapGame: {
            select: { winnerSide: true }
          }
        }
      }
    },
    orderBy: { displayName: "asc" }
  });

  return players.map(({ stats, ...player }) => ({
    ...player,
    aggregate: calculateAggregateStats(stats),
    rank: calculatePlayerRank(stats)
  })) as PlayerWithStats[];
}

export async function getLeaderboardRows(tournamentId?: string | null) {
  const rows = await getPlayersWithAggregateStats({
    tournamentId: tournamentId || undefined
  });

  return rows.filter((row) => row.aggregate.maps > 0);
}

export function sortPlayersByMetric(players: PlayerWithStats[], metric: LeaderboardMetric, direction: "asc" | "desc" = "desc") {
  const multiplier = direction === "asc" ? 1 : -1;
  return [...players].sort((a, b) => {
    const aValue = metric === "mmr" ? a.rank.mmr : a.aggregate[metric];
    const bValue = metric === "mmr" ? b.rank.mmr : b.aggregate[metric];
    if (aValue === bValue) return a.displayName.localeCompare(b.displayName);
    return (aValue - bValue) * multiplier;
  });
}

export async function getTournamentLeaders(tournamentId: string, limit = 5) {
  const players = await getPlayersWithAggregateStats({ tournamentId });
  return sortPlayersByMetric(
    players.filter((player) => player.aggregate.maps > 0),
    "rating"
  ).slice(0, limit);
}

export type TeamSummaryStats = {
  rating: number;
  kills: number;
  deaths: number;
  assists: number;
  kd: number;
  mapsPlayed: number;
  mapsWon: number;
  matchesPlayed: number;
  matchesWon: number;
};

type TeamStatEntry = StatEntry & {
  mapGameId: string;
  matchId: string;
  side?: string | null;
  match?: { winnerSide: string | null } | null;
  mapGame?: { winnerSide: string | null } | null;
};
type TeamMatchEntry = {
  id: string;
  teamAId: string | null;
  teamBId: string | null;
  winnerSide: string | null;
  winnerTeamId: string | null;
  maps: Array<{ id: string; winnerSide: string | null; winnerTeamId: string | null }>;
};

/**
 * Team-level numbers built from real stat rows instead of tournament totals.
 * Rating is the average map rating across every stat row the roster logged,
 * K/D is summed kills over summed deaths, and maps are counted once per map
 * (not once per player). Most games are logged with typed side names rather
 * than a linked team, so the roster's side in each game is read from its
 * players' stat rows to work out wins.
 */
export function calculateTeamSummary(teamId: string, entries: TeamStatEntry[], matches: TeamMatchEntry[]): TeamSummaryStats {
  const aggregate = calculateAggregateStats(entries);
  const sideByMatch = new Map<string, string>();
  const winnerByMatch = new Map<string, string | null>();
  const maps = new Map<string, { matchId: string; winnerSide: string | null }>();

  for (const match of matches) {
    const side = match.teamAId === teamId ? "A" : match.teamBId === teamId ? "B" : null;
    if (side) sideByMatch.set(match.id, side);
    const winner = match.winnerSide || (match.winnerTeamId === match.teamAId ? "A" : match.winnerTeamId === match.teamBId ? "B" : null);
    winnerByMatch.set(match.id, winner);
    for (const map of match.maps) {
      maps.set(map.id, { matchId: match.id, winnerSide: map.winnerSide || (map.winnerTeamId === teamId ? side : null) });
    }
  }

  const sideVotes = new Map<string, { A: number; B: number }>();
  for (const entry of entries) {
    if (!winnerByMatch.has(entry.matchId)) winnerByMatch.set(entry.matchId, entry.match?.winnerSide ?? null);
    if (!maps.has(entry.mapGameId)) maps.set(entry.mapGameId, { matchId: entry.matchId, winnerSide: entry.mapGame?.winnerSide ?? null });
    if (entry.side === "A" || entry.side === "B") {
      const votes = sideVotes.get(entry.matchId) || { A: 0, B: 0 };
      votes[entry.side] += 1;
      sideVotes.set(entry.matchId, votes);
    }
  }
  for (const [matchId, votes] of sideVotes) {
    if (!sideByMatch.has(matchId) && votes.A !== votes.B) sideByMatch.set(matchId, votes.A > votes.B ? "A" : "B");
  }

  let matchesWon = 0;
  for (const [matchId, winner] of winnerByMatch) {
    if (winner && sideByMatch.get(matchId) === winner) matchesWon += 1;
  }
  let mapsWon = 0;
  for (const map of maps.values()) {
    if (map.winnerSide && sideByMatch.get(map.matchId) === map.winnerSide) mapsWon += 1;
  }

  return {
    rating: aggregate.rating,
    kills: aggregate.kills,
    deaths: aggregate.deaths,
    assists: aggregate.assists,
    kd: aggregate.kd,
    mapsPlayed: maps.size,
    mapsWon,
    matchesPlayed: winnerByMatch.size,
    matchesWon
  };
}
