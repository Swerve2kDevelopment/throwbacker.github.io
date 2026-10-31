import { createHash, randomBytes } from "node:crypto";

import { z } from "zod";

import type { MatchBuilderInitial, StatCell } from "@/components/admin/MatchBuilder";
import { normalizeName } from "@/lib/match-entry";
import { prisma } from "@/lib/prisma";

/**
 * Scoreboards sent by a host's in-game stats tracker. Only hosts get an API
 * key, and every upload lands in a review inbox: nothing reaches the public
 * stats until an admin opens it in the match builder and saves it.
 */

const KEY_PREFIX = "oscl_host_";

export function hashHostKey(key: string) {
  return createHash("sha256").update(key).digest("hex");
}

export function generateHostKey() {
  const key = `${KEY_PREFIX}${randomBytes(24).toString("base64url")}`;
  return { key, keyHash: hashHostKey(key), keyPrefix: key.slice(0, KEY_PREFIX.length + 6) };
}

/** Resolves the bearer key on a request to an active host key, or null. */
export async function authenticateHost(request: Request) {
  const header = request.headers.get("authorization") || "";
  const key = header.match(/^Bearer\s+(\S+)$/i)?.[1] || request.headers.get("x-oscl-key") || "";
  if (!key.startsWith(KEY_PREFIX)) return null;

  const hostKey = await prisma.hostApiKey.findUnique({ where: { keyHash: hashHostKey(key) } });
  if (!hostKey || hostKey.revokedAt) return null;
  return hostKey;
}

const stat = z.coerce.number().int().min(0).max(999).default(0);

const playerSchema = z.object({
  name: z.string().trim().min(1).max(64),
  side: z.enum(["A", "B"]),
  kills: stat,
  deaths: stat,
  assists: stat,
  headshots: stat,
  plants: stat,
  rounds: z.coerce.number().int().min(0).max(99).optional()
});

const mapSchema = z.object({
  name: z.string().trim().min(1).max(64),
  scoreA: z.coerce.number().int().min(0).max(99),
  scoreB: z.coerce.number().int().min(0).max(99),
  players: z.array(playerSchema).min(1).max(16)
});

export const ingestPayloadSchema = z.object({
  build: z.string().trim().max(64).optional(),
  playedAt: z.coerce.date().optional(),
  teamA: z.object({ name: z.string().trim().max(64) }).optional(),
  teamB: z.object({ name: z.string().trim().max(64) }).optional(),
  maps: z.array(mapSchema).min(1).max(7)
});

export type IngestPayload = z.infer<typeof ingestPayloadSchema>;

export function summarizePayload(payload: IngestPayload) {
  const a = payload.teamA?.name || "Team A";
  const b = payload.teamB?.name || "Team B";
  const maps = payload.maps.map((map) => `${map.name} ${map.scoreA}-${map.scoreB}`).join(", ");
  return `${a} vs ${b} · ${maps}`;
}

type LookupPlayer = { id: string; displayName: string; inGameName: string | null; discordUsername: string | null; aliases: string[] };

function nameIndex(players: LookupPlayer[]) {
  const byName = new Map<string, string>();
  for (const player of players) {
    for (const key of [player.inGameName || "", player.displayName, player.discordUsername || "", ...player.aliases]) {
      const normalized = normalizeName(key);
      if (normalized && !byName.has(normalized)) byName.set(normalized, player.id);
    }
  }
  return byName;
}

export async function unmatchedNames(payload: IngestPayload) {
  const players = await prisma.player.findMany({ select: { id: true, displayName: true, inGameName: true, discordUsername: true, aliases: true } });
  const byName = nameIndex(players);
  const names = new Set(payload.maps.flatMap((map) => map.players.map((player) => player.name)));
  return [...names].filter((name) => !byName.has(normalizeName(name)));
}

/** Turns a submission into the match builder's starting state. */
export async function submissionToBuilder(payload: IngestPayload) {
  const [players, teams] = await Promise.all([
    prisma.player.findMany({ select: { id: true, displayName: true, inGameName: true, discordUsername: true, aliases: true } }),
    prisma.team.findMany({ select: { id: true, name: true, tag: true } })
  ]);
  const byName = nameIndex(players);
  const teamFor = (name?: string) => {
    const key = name ? normalizeName(name) : "";
    return key ? teams.find((team) => normalizeName(team.name) === key || (team.tag && normalizeName(team.tag) === key)) : undefined;
  };

  const roster: Record<"A" | "B", string[]> = { A: [], B: [] };
  const unknown = new Set<string>();
  const stats: Record<string, Record<string, StatCell>> = {};
  const maps = payload.maps.map((map, index) => {
    const key = `upload-${index + 1}`;
    stats[key] = {};
    for (const row of map.players) {
      const id = byName.get(normalizeName(row.name));
      if (!id) {
        unknown.add(row.name);
        continue;
      }
      if (!roster.A.includes(id) && !roster.B.includes(id)) roster[row.side].push(id);
      stats[key][id] = {
        k: String(row.kills),
        d: String(row.deaths),
        a: String(row.assists),
        hs: String(Math.min(row.headshots, row.kills)),
        plants: String(row.plants),
        rating: "",
        rounds: row.rounds === undefined ? "" : String(row.rounds)
      };
    }
    return { key, name: map.name, a: String(map.scoreA), b: String(map.scoreB) };
  });

  const teamA = teamFor(payload.teamA?.name);
  const teamB = teamFor(payload.teamB?.name);
  const largestSide = Math.max(...payload.maps.flatMap((map) => (["A", "B"] as const).map((side) => map.players.filter((p) => p.side === side).length)));
  const mapWins = payload.maps.reduce((sum, map) => ({ a: sum.a + Number(map.scoreA > map.scoreB), b: sum.b + Number(map.scoreB > map.scoreA) }), { a: 0, b: 0 });

  const builder: Partial<MatchBuilderInitial> = {
    format: largestSide <= 4 ? 4 : 5,
    teamAId: teamA?.id || "",
    teamBId: teamB?.id || "",
    customTeamAName: teamA ? "" : payload.teamA?.name || "",
    customTeamBName: teamB ? "" : payload.teamB?.name || "",
    teamAPlayerIds: roster.A,
    teamBPlayerIds: roster.B,
    maps,
    stats,
    scoreA: mapWins.a,
    scoreB: mapWins.b,
    winnerSide: mapWins.a > mapWins.b ? "A" : mapWins.b > mapWins.a ? "B" : ""
  };

  return { builder, unknown: [...unknown] };
}
