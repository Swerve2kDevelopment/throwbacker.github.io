import { z } from "zod";

import { normalizeName } from "@/lib/match-entry";

/**
 * Round-by-round data from a match replay, as sent by the replay tracker
 * (scripts/replay-tracker) and stored on MapGame.replay. Player names are
 * in-game names; they are matched to site players when shown or saved.
 */

const name = z.string().trim().min(1).max(64);
const clock = z.string().max(8).nullable();
const side = z.enum(["A", "B"]);

const actionSchema = z.object({ player: name.nullable(), time: clock, room: z.string().max(64).nullable() }).nullable();

export const replayRoundSchema = z.object({
  number: z.number().int().min(1).max(40),
  winner: side.nullable(),
  attackers: side.nullable(),
  endReason: z.enum(["elimination", "time", "defuse", "detonation"]).nullable(),
  site: z.string().max(140).nullable(),
  plant: actionSchema,
  defuse: actionSchema,
  kills: z
    .array(
      z.object({
        time: clock,
        killer: name.nullable(),
        victim: name,
        headshot: z.boolean(),
        teamKill: z.boolean(),
        postPlant: z.boolean()
      })
    )
    .max(40),
  operators: z
    .array(z.object({ player: name, side, operator: z.string().max(40).nullable(), operatorId: z.string().max(32).nullable() }))
    .max(16)
});

export const replayRoundsSchema = z.array(replayRoundSchema).max(40);

export type ReplayRound = z.infer<typeof replayRoundSchema>;
export type ReplayKill = ReplayRound["kills"][number];

export const endReasonLabels: Record<NonNullable<ReplayRound["endReason"]>, string> = {
  elimination: "Team eliminated",
  time: "Time ran out",
  defuse: "Defuser disabled",
  detonation: "Defuser detonated"
};

/** Parses whatever is stored on MapGame.replay; bad or missing data reads as no rounds. */
export function readReplay(value: unknown): ReplayRound[] {
  const parsed = replayRoundsSchema.safeParse(value);
  return parsed.success ? parsed.data : [];
}

function seconds(time: string | null) {
  const match = time?.match(/^(\d+):(\d{2})$/);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

const TRADE_WINDOW = 10;

export type RoundInsight = {
  openingKill: ReplayKill | null;
  clutch: { player: string; versus: number; won: boolean } | null;
  /** Victims whose death was traded (their killer died to a teammate within 10s). */
  traded: Set<string>;
};

/** Opening duel, clutch and trades for one round. */
export function roundInsight(round: ReplayRound): RoundInsight {
  const sideOf = new Map(round.operators.map((entry) => [entry.player, entry.side]));
  const alive = { A: new Set<string>(), B: new Set<string>() };
  for (const entry of round.operators) alive[entry.side].add(entry.player);

  let clutch: RoundInsight["clutch"] = null;
  const traded = new Set<string>();
  round.kills.forEach((kill, index) => {
    const victimSide = sideOf.get(kill.victim);
    if (victimSide) alive[victimSide].delete(kill.victim);

    // A kill on the victim's killer within the window, by the victim's team, trades them.
    const t = seconds(kill.time);
    for (const earlier of round.kills.slice(0, index)) {
      const gap = seconds(earlier.time);
      if (earlier.killer === kill.victim && !kill.teamKill && earlier.postPlant === kill.postPlant && t !== null && gap !== null && gap - t <= TRADE_WINDOW) {
        traded.add(earlier.victim);
      }
    }

    if (!clutch) {
      for (const team of ["A", "B"] as const) {
        const other = team === "A" ? "B" : "A";
        if (alive[team].size === 1 && alive[other].size > 0) {
          clutch = { player: [...alive[team]][0], versus: alive[other].size, won: round.winner === team };
        }
      }
    }
  });

  return { openingKill: round.kills.find((kill) => kill.killer && !kill.teamKill) || null, clutch, traded };
}

export type DerivedStats = {
  openingKills: number;
  openingDeaths: number;
  oneVX: number;
  teamKills: number;
  defuses: number;
  kostRounds: number;
};

/** Per in-game name: the stats that need the whole round to work out. */
export function deriveReplayStats(rounds: ReplayRound[]) {
  const stats = new Map<string, DerivedStats>();
  const statFor = (player: string) => {
    if (!stats.has(player)) stats.set(player, { openingKills: 0, openingDeaths: 0, oneVX: 0, teamKills: 0, defuses: 0, kostRounds: 0 });
    return stats.get(player)!;
  };

  for (const round of rounds) {
    const insight = roundInsight(round);
    if (insight.openingKill?.killer) {
      statFor(insight.openingKill.killer).openingKills++;
      statFor(insight.openingKill.victim).openingDeaths++;
    }
    if (insight.clutch?.won) statFor(insight.clutch.player).oneVX++;
    if (round.defuse?.player) statFor(round.defuse.player).defuses++;

    const dead = new Set(round.kills.map((kill) => kill.victim));
    for (const kill of round.kills) if (kill.killer && kill.teamKill) statFor(kill.killer).teamKills++;
    // KOST: a kill, an objective (plant/defuse), survived, or traded.
    for (const { player } of round.operators) {
      const kill = round.kills.some((entry) => entry.killer === player && !entry.teamKill);
      const objective = round.plant?.player === player || round.defuse?.player === player;
      if (kill || objective || !dead.has(player) || insight.traded.has(player)) statFor(player).kostRounds++;
    }
  }
  return stats;
}

/** Operator name for a round entry: the replay's own name, else the admin/header-learned id table. */
export function operatorName(entry: { operator: string | null; operatorId: string | null } | undefined, idTable: Map<string, string>) {
  if (!entry) return null;
  return entry.operator || (entry.operatorId ? idTable.get(entry.operatorId) || null : null);
}

/** Title-cases header names like "TUBARÃO" or "JÄGER" for display. */
export function displayOperator(value: string) {
  return value.length > 3 && value === value.toUpperCase() ? value.charAt(0) + value.slice(1).toLowerCase() : value;
}

export function nameKeys(player: { displayName: string; inGameName?: string | null; aliases?: string[]; discordUsername?: string | null }) {
  return [player.inGameName || "", player.displayName, player.discordUsername || "", ...(player.aliases || [])].map(normalizeName).filter(Boolean);
}
