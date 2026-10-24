// Suggestions only; any map name can be entered.
export const COMMON_MAPS = [
  "Border",
  "Bank",
  "Chalet",
  "Oregon",
  "Outback",
  "Clubhouse",
  "Kafe Dostoyevsky",
  "Nighthaven Labs",
  "Skyscraper",
  "Consulate",
  "Coastline",
  "Hereford Base",
  "House",
  "Kanal",
  "Theme Park",
  "Villa",
  "Yacht"
] as const;

export type MatchWithSides = {
  customTeamAName?: string | null;
  customTeamBName?: string | null;
  teamA?: { name: string; tag?: string | null } | null;
  teamB?: { name: string; tag?: string | null } | null;
};

export function getMatchSideName(match: MatchWithSides, side: "A" | "B") {
  if (side === "A") return match.customTeamAName || match.teamA?.name || "Team A";
  return match.customTeamBName || match.teamB?.name || "Team B";
}

export function getMatchSideTag(match: MatchWithSides, side: "A" | "B") {
  if (side === "A") return match.teamA?.tag || match.customTeamAName || match.teamA?.name || "Team A";
  return match.teamB?.tag || match.customTeamBName || match.teamB?.name || "Team B";
}

export function getMatchTitle(match: MatchWithSides & { title?: string | null }) {
  if (match.title) return match.title;
  return `${getMatchSideName(match, "A")} vs ${getMatchSideName(match, "B")}`;
}
