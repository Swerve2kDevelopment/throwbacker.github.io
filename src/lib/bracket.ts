import type { BracketStage, BracketType } from "@prisma/client";

import { getMatchSideName } from "@/lib/match-utils";

/**
 * Builds a displayable bracket from seeded teams plus the tournament's games.
 *
 * A game lands in a slot either because an admin placed it (bracketStage,
 * bracketRound, bracketPosition) or, failing that, because it was played
 * between the two teams the bracket expects in that slot. Winners advance
 * automatically, losers drop to the lower bracket for double elimination.
 */

export type BracketTeam = {
  id: string;
  name: string;
  slug: string;
  tag: string | null;
  logoUrl: string | null;
};

export type BracketEntry = { seed: number | null; team: BracketTeam };

export type BracketMatchInput = {
  id: string;
  title?: string | null;
  status: string;
  teamAId: string | null;
  teamBId: string | null;
  customTeamAName: string | null;
  customTeamBName: string | null;
  teamA: BracketTeam | null;
  teamB: BracketTeam | null;
  scoreA: number;
  scoreB: number;
  winnerSide: string | null;
  winnerTeamId: string | null;
  bracketStage: BracketStage | null;
  bracketRound: number | null;
  bracketPosition: number | null;
  playedAt: Date | null;
};

export type SlotView = {
  label: string;
  team: BracketTeam | null;
  seed: number | null;
  score: number | null;
  isWinner: boolean;
  isPlaceholder: boolean;
};

export type MatchView = {
  key: string;
  label: string;
  matchId: string | null;
  status: string | null;
  top: SlotView;
  bottom: SlotView;
};

export type RoundView = { name: string; matches: MatchView[] };
export type StageView = { key: "UPPER" | "LOWER" | "GRAND_FINAL"; title: string; rounds: RoundView[] };

type Participant = { team: BracketTeam | null; label: string; seed: number | null };
type Resolved = { winner: Participant | null; loser: Participant | null };

function nextPowerOfTwo(value: number) {
  let power = 2;
  while (power < value) power *= 2;
  return power;
}

/** Standard seed order so 1 and 2 can only meet in the final (1v8, 4v5, 2v7, 3v6...). */
function seedOrder(size: number): number[] {
  let order = [1, 2];
  while (order.length < size) {
    const total = order.length * 2 + 1;
    order = order.flatMap((seed) => [seed, total - seed]);
  }
  return order;
}

function roundName(stage: "UPPER" | "LOWER", round: number, total: number) {
  if (stage === "LOWER") return round === total ? "Lower final" : `Lower round ${round}`;
  const remaining = total - round;
  if (remaining === 0) return total === 1 ? "Final" : "Upper final";
  if (remaining === 1) return "Semifinals";
  if (remaining === 2) return "Quarterfinals";
  return `Round ${round}`;
}

class BracketBuilder {
  private used = new Set<string>();
  private placed = new Map<string, BracketMatchInput>();

  constructor(private matches: BracketMatchInput[]) {
    for (const match of matches) {
      if (match.bracketStage && match.bracketRound && match.bracketPosition) {
        this.placed.set(`${match.bracketStage}:${match.bracketRound}:${match.bracketPosition}`, match);
        this.used.add(match.id);
      }
    }
  }

  private findMatch(stage: string, round: number, position: number, a: Participant, b: Participant) {
    const explicit = this.placed.get(`${stage}:${round}:${position}`);
    if (explicit) return explicit;
    if (!a.team || !b.team) return null;

    const ids = new Set([a.team.id, b.team.id]);
    const found = this.matches
      .filter((match) => !this.used.has(match.id) && (!match.bracketStage || match.bracketStage === stage))
      .find((match) => match.teamA && match.teamB && ids.has(match.teamA.id) && ids.has(match.teamB.id) && match.teamA.id !== match.teamB.id);
    if (found) this.used.add(found.id);
    return found || null;
  }

  resolve(stage: string, round: number, position: number, label: string, a: Participant, b: Participant): { view: MatchView; result: Resolved } {
    const match = this.findMatch(stage, round, position, a, b);
    let top: Participant = a;
    let bottom: Participant = b;
    let topScore: number | null = null;
    let bottomScore: number | null = null;
    let winnerKey: "top" | "bottom" | null = null;

    if (match) {
      const sideA: Participant = match.teamA
        ? { team: match.teamA, label: match.teamA.name, seed: a.team?.id === match.teamA.id ? a.seed : b.team?.id === match.teamA.id ? b.seed : null }
        : { team: null, label: getMatchSideName(match, "A"), seed: null };
      const sideB: Participant = match.teamB
        ? { team: match.teamB, label: match.teamB.name, seed: a.team?.id === match.teamB.id ? a.seed : b.team?.id === match.teamB.id ? b.seed : null }
        : { team: null, label: getMatchSideName(match, "B"), seed: null };

      // Keep the expected top/bottom order when the game lists teams the other way round.
      const flipped = Boolean(a.team && match.teamB && a.team.id === match.teamB.id);
      top = flipped ? sideB : sideA;
      bottom = flipped ? sideA : sideB;
      topScore = flipped ? match.scoreB : match.scoreA;
      bottomScore = flipped ? match.scoreA : match.scoreB;

      const winnerSide = match.winnerSide || (match.winnerTeamId ? (match.winnerTeamId === match.teamA?.id ? "A" : match.winnerTeamId === match.teamB?.id ? "B" : null) : null);
      if (winnerSide) winnerKey = (winnerSide === "A") !== flipped ? "top" : "bottom";
    } else if (!a.team && !b.team && a.label === "BYE" && b.label === "BYE") {
      winnerKey = "top";
    } else if (a.team && !b.team && b.label === "BYE") {
      winnerKey = "top";
    } else if (b.team && !a.team && a.label === "BYE") {
      winnerKey = "bottom";
    }

    const slot = (participant: Participant, score: number | null, isWinner: boolean): SlotView => ({
      label: participant.team?.name || participant.label,
      team: participant.team,
      seed: participant.seed,
      score,
      isWinner,
      isPlaceholder: !participant.team && !match
    });

    return {
      view: {
        key: `${stage}-${round}-${position}`,
        label,
        matchId: match?.id || null,
        status: match?.status || null,
        top: slot(top, topScore, winnerKey === "top"),
        bottom: slot(bottom, bottomScore, winnerKey === "bottom")
      },
      result: {
        winner: winnerKey === "top" ? top : winnerKey === "bottom" ? bottom : null,
        loser: winnerKey === "top" ? bottom : winnerKey === "bottom" ? top : null
      }
    };
  }

  unplaced() {
    return this.matches.filter((match) => !this.used.has(match.id));
  }
}

const tbd = (label: string): Participant => ({ team: null, label, seed: null });

export function buildEliminationBracket(entries: BracketEntry[], matches: BracketMatchInput[], type: BracketType) {
  const seeded = [...entries].sort((a, b) => (a.seed || 999) - (b.seed || 999) || a.team.name.localeCompare(b.team.name));
  const size = nextPowerOfTwo(Math.max(seeded.length, 2));
  const upperRounds = Math.log2(size);
  const builder = new BracketBuilder(matches);
  const stages: StageView[] = [];

  const order = seedOrder(size);
  let current: Participant[] = order.map((seed) => {
    const entry = seeded[seed - 1];
    return entry ? { team: entry.team, label: entry.team.name, seed: entry.seed || seed } : { team: null, label: "BYE", seed: null };
  });

  const upperLosers: Participant[][] = [];
  const upper: RoundView[] = [];
  for (let round = 1; round <= upperRounds; round += 1) {
    const views: MatchView[] = [];
    const next: Participant[] = [];
    const losers: Participant[] = [];
    for (let position = 1; position <= current.length / 2; position += 1) {
      const a = current[(position - 1) * 2];
      const b = current[(position - 1) * 2 + 1];
      const { view, result } = builder.resolve("UPPER", round, position, `${round === upperRounds ? "F" : `R${round}`} · M${position}`, a, b);
      views.push(view);
      next.push(result.winner || tbd(`Winner ${round === upperRounds ? "final" : `R${round} M${position}`}`));
      losers.push(result.loser || tbd(`Loser R${round} M${position}`));
    }
    upper.push({ name: roundName("UPPER", round, upperRounds), matches: views });
    upperLosers.push(losers);
    current = next;
  }
  stages.push({ key: "UPPER", title: type === "DOUBLE_ELIMINATION" ? "Upper bracket" : "Bracket", rounds: upper });
  const upperChampion = current[0];

  if (type === "DOUBLE_ELIMINATION" && upperRounds >= 2) {
    const lowerRoundCount = 2 * (upperRounds - 1);
    const lower: RoundView[] = [];
    let survivors: Participant[] = [];

    for (let round = 1; round <= lowerRoundCount; round += 1) {
      let pairs: Array<[Participant, Participant]> = [];
      if (round === 1) {
        const dropped = upperLosers[0];
        for (let index = 0; index < dropped.length; index += 2) pairs.push([dropped[index], dropped[index + 1]]);
      } else if (round % 2 === 0) {
        // Lower-bracket survivors meet the teams dropping from the next upper round.
        const dropping = upperLosers[round / 2] || [];
        pairs = survivors.map((survivor, index) => [survivor, dropping[dropping.length - 1 - index] || tbd("Upper loser")]);
      } else {
        for (let index = 0; index < survivors.length; index += 2) pairs.push([survivors[index], survivors[index + 1]]);
      }

      const views: MatchView[] = [];
      const next: Participant[] = [];
      pairs.forEach(([a, b], index) => {
        const position = index + 1;
        const { view, result } = builder.resolve("LOWER", round, position, `LB R${round} · M${position}`, a, b);
        views.push(view);
        next.push(result.winner || tbd(`Winner LB R${round} M${position}`));
      });
      lower.push({ name: roundName("LOWER", round, lowerRoundCount), matches: views });
      survivors = next;
    }
    stages.push({ key: "LOWER", title: "Lower bracket", rounds: lower });

    const final = builder.resolve("GRAND_FINAL", 1, 1, "Grand final", upperChampion, survivors[0] || tbd("Lower bracket winner"));
    stages.push({ key: "GRAND_FINAL", title: "Grand final", rounds: [{ name: "Grand final", matches: [final.view] }] });
  }

  return { stages, unplaced: builder.unplaced() };
}

export type StandingRow = {
  team: BracketTeam;
  seed: number | null;
  played: number;
  wins: number;
  losses: number;
  mapsWon: number;
  mapsLost: number;
};

/** League-style table for round robin, Swiss and group-stage events. */
export function buildStandings(entries: BracketEntry[], matches: Array<BracketMatchInput & { maps: Array<{ winnerSide: string | null }> }>) {
  const rows = new Map<string, StandingRow>(
    entries.map((entry) => [entry.team.id, { team: entry.team, seed: entry.seed, played: 0, wins: 0, losses: 0, mapsWon: 0, mapsLost: 0 }])
  );

  for (const match of matches) {
    if (match.status !== "COMPLETED") continue;
    const sides = [
      { id: match.teamA?.id, side: "A" },
      { id: match.teamB?.id, side: "B" }
    ];
    for (const { id, side } of sides) {
      const row = id ? rows.get(id) : null;
      if (!row) continue;
      row.played += 1;
      const winner = match.winnerSide || (match.winnerTeamId === match.teamA?.id ? "A" : match.winnerTeamId === match.teamB?.id ? "B" : null);
      if (winner === side) row.wins += 1;
      else if (winner) row.losses += 1;
      for (const map of match.maps) {
        if (map.winnerSide === side) row.mapsWon += 1;
        else if (map.winnerSide) row.mapsLost += 1;
      }
    }
  }

  return [...rows.values()].sort(
    (a, b) => b.wins - a.wins || a.losses - b.losses || b.mapsWon - b.mapsLost - (a.mapsWon - a.mapsLost) || (a.seed || 999) - (b.seed || 999)
  );
}
