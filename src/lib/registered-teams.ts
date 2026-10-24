import type { Team } from "@prisma/client";

import { normalizeName } from "@/lib/match-entry";
import { prisma } from "@/lib/prisma";

type SidedMatch = {
  customTeamAName?: string | null;
  customTeamBName?: string | null;
  teamA?: Team | null;
  teamB?: Team | null;
};

/**
 * Many games are logged with typed side names instead of a linked team. When a
 * typed name exactly matches a registered team's name or tag, treat that side
 * as the team for display (logo, link). Partial matches are ignored on purpose
 * so "Team APEXIS" never borrows Kanine APEXIS's badge.
 */
export async function attachRegisteredTeams<T extends SidedMatch>(matches: T[]): Promise<T[]> {
  if (!matches.some((match) => (!match.teamA && match.customTeamAName) || (!match.teamB && match.customTeamBName))) return matches;

  const teams = await prisma.team.findMany();
  const byName = new Map<string, Team>();
  for (const team of teams) {
    for (const key of [team.name, team.tag]) {
      const normalized = key ? normalizeName(key) : "";
      if (normalized && !byName.has(normalized)) byName.set(normalized, team);
    }
  }

  const lookup = (name?: string | null) => (name ? byName.get(normalizeName(name)) || null : null);
  return matches.map((match) => ({
    ...match,
    teamA: match.teamA || lookup(match.customTeamAName),
    teamB: match.teamB || lookup(match.customTeamBName)
  }));
}

export async function attachRegisteredTeam<T extends SidedMatch>(match: T): Promise<T> {
  const [result] = await attachRegisteredTeams([match]);
  return result;
}
