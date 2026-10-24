export type RatingInput = {
  kills: number;
  deaths: number;
  assists?: number;
  roundsPlayed?: number;
  kostRounds?: number;
  openingKills?: number;
  openingDeaths?: number;
  oneVX?: number;
  plants?: number;
  ratingOverride?: number | null;
};

const DEFAULT_ROUNDS = 12;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

/**
 * Per-map rating. An admin-entered rating always wins. Older rows that carry
 * KOST/entry data keep the original formula so historic numbers do not move;
 * newer K/D/A-only rows use a simpler model tuned so an even 1:1 map is ~1.00.
 */
export function calculateMapRating(entry: RatingInput) {
  if (entry.ratingOverride !== null && entry.ratingOverride !== undefined) {
    return entry.ratingOverride;
  }

  const rounds = entry.roundsPlayed && entry.roundsPlayed > 0 ? entry.roundsPlayed : DEFAULT_ROUNDS;
  const kpr = entry.kills / rounds;
  const dpr = entry.deaths / rounds;
  const hasLegacyData = Boolean(entry.kostRounds || entry.openingKills || entry.openingDeaths || entry.oneVX || entry.plants);

  if (hasLegacyData) {
    const kost = (entry.kostRounds || 0) / rounds;
    const entryDiff = (entry.openingKills || 0) - (entry.openingDeaths || 0);
    return clamp(
      0.28 + kpr * 0.9 - dpr * 0.28 + kost * 0.45 + entryDiff * 0.04 + (entry.oneVX || 0) * 0.03 + (entry.plants || 0) * 0.015,
      0,
      2.5
    );
  }

  const apr = (entry.assists || 0) / rounds;
  return clamp(0.62 + kpr * 0.9 - dpr * 0.35 + apr * 0.3, 0, 2.5);
}
