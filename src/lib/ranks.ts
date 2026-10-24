import type { MatchSide } from "@prisma/client";

import { calculateMapRating, type RatingInput } from "@/lib/rating";

type RankStatEntry = RatingInput & {
  side?: MatchSide | null;
  match?: {
    winnerSide?: MatchSide | null;
  } | null;
  mapGame?: {
    winnerSide?: MatchSide | null;
  } | null;
};

export type PlayerRank = {
  name: string;
  mmr: number;
  color: string;
  image: string;
  nextRank?: string;
  nextMmr?: number;
};

// Emerald and Diamond shared 4100-5000 in the original brief; Diamond now
// starts at 4500 so every MMR value maps to exactly one rank.
export const rankBands = [
  { name: "Copper", min: 1100, max: 1599, color: "#7f1d1d", image: "/ranks/Copper.png" },
  { name: "Bronze", min: 1600, max: 2099, color: "#8b5a2b", image: "/ranks/Bronze.png" },
  { name: "Silver", min: 2100, max: 2599, color: "#9ca3af", image: "/ranks/Silver.png" },
  { name: "Gold", min: 2600, max: 3199, color: "#facc15", image: "/ranks/Gold.png" },
  { name: "Platinum", min: 3200, max: 4099, color: "#22d3ee", image: "/ranks/Platinum.png" },
  { name: "Emerald", min: 4100, max: 4499, color: "#86efac", image: "/ranks/Emerald.png" },
  { name: "Diamond", min: 4500, max: 4999, color: "#c4b5fd", image: "/ranks/Diamond.png" },
  { name: "Champions", min: 5000, max: Infinity, color: "#f472b6", image: "/ranks/Champion.png" }
] as const;

function didWin(entry: RankStatEntry) {
  const winnerSide = entry.mapGame?.winnerSide || entry.match?.winnerSide || null;
  return Boolean(entry.side && winnerSide && entry.side === winnerSide);
}

export function calculatePlayerMmr(entries: RankStatEntry[]) {
  const mmr = entries.reduce((total, entry) => {
    const won = didWin(entry);
    let change = won ? 125 : 0;

    if (calculateMapRating(entry) >= 1.9) change += 175;
    if (entry.kills >= 10) change += 75;
    if (entry.deaths > entry.kills) change -= won ? 35 : 95;

    return Math.max(1100, total + change);
  }, 1100);

  return Math.round(mmr);
}

export function getRankForMmr(mmr: number): PlayerRank {
  const bandIndex = Math.max(0, rankBands.findIndex((rank) => mmr >= rank.min && mmr <= rank.max));
  const band = rankBands[bandIndex] || rankBands[0];
  const next = rankBands[bandIndex + 1];

  return {
    name: band.name,
    mmr,
    color: band.color,
    image: band.image,
    nextRank: next?.name,
    nextMmr: next?.min
  };
}

export function calculatePlayerRank(entries: RankStatEntry[]) {
  return getRankForMmr(calculatePlayerMmr(entries));
}
