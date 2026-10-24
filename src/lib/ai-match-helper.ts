import { MatchSide, MatchStatus } from "@prisma/client";
import { z } from "zod";


const nullableSide = z.nativeEnum(MatchSide).nullable();
const numberInt = z.coerce.number().int().min(0);
const nullableNumber = z.preprocess((value) => {
  if (value === "" || value === undefined) return null;
  return value;
}, z.coerce.number().min(0).nullable());
const stringList = z.preprocess((value) => {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    return value
      .split(/[\n,]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}, z.array(z.string()));

function coerceStringList(value: unknown) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .split(/[\n,]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
}

function inferFormatFromDraft(value: Record<string, unknown>) {
  const teamAPlayerIds = coerceStringList(value.teamAPlayerIds);
  const teamBPlayerIds = coerceStringList(value.teamBPlayerIds);
  const sideAStatPlayers = new Set<string>();
  const sideBStatPlayers = new Set<string>();

  if (Array.isArray(value.stats)) {
    for (const stat of value.stats) {
      if (!stat || typeof stat !== "object") continue;

      const entry = stat as Record<string, unknown>;
      const side = typeof entry.side === "string" ? entry.side.toUpperCase() : "";
      const playerId = typeof entry.playerId === "string" ? entry.playerId.trim() : "";
      if (!playerId) continue;

      if (side === MatchSide.A) sideAStatPlayers.add(playerId);
      if (side === MatchSide.B) sideBStatPlayers.add(playerId);
    }
  }

  const inferred = Math.max(teamAPlayerIds.length, teamBPlayerIds.length, sideAStatPlayers.size, sideBStatPlayers.size);
  return inferred >= 1 && inferred <= 5 ? inferred : 5;
}

function normalizeAiMatchDraft(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;

  const draft = { ...(value as Record<string, unknown>) };
  const format = Number(draft.format);
  if (!Number.isInteger(format) || format < 1 || format > 5) {
    draft.format = inferFormatFromDraft(draft);
  }

  return draft;
}

const mapName = z.string().trim().min(1).max(60);

export const aiMapDraftSchema = z.object({
  mapName,
  teamAScore: numberInt,
  teamBScore: numberInt,
  winnerSide: nullableSide
});

export const aiStatDraftSchema = z.object({
  playerId: z.string().min(1),
  side: z.nativeEnum(MatchSide),
  mapName,
  kills: numberInt.default(0),
  deaths: numberInt.default(0),
  assists: numberInt.default(0),
  headshots: numberInt.default(0),
  plants: numberInt.default(0),
  defuses: numberInt.default(0),
  oneVX: numberInt.default(0),
  openingKills: numberInt.default(0),
  openingDeaths: numberInt.default(0),
  roundsPlayed: numberInt.default(0),
  kostRounds: numberInt.default(0),
  ratingOverride: nullableNumber.default(null)
});

export const aiMatchDraftSchema = z.preprocess(
  normalizeAiMatchDraft,
  z.object({
    tournamentId: z.string().nullable().default(null),
    customTeamAName: z.string().min(1),
    customTeamBName: z.string().min(1),
    format: z.coerce.number().int().min(1).max(5),
    scoreA: numberInt,
    scoreB: numberInt,
    winnerSide: nullableSide,
    status: z.nativeEnum(MatchStatus).default(MatchStatus.COMPLETED),
    playedAt: z.string().nullable().default(null),
    teamAPlayerIds: stringList.default([]),
    teamBPlayerIds: stringList.default([]),
    maps: z.array(aiMapDraftSchema).min(1),
    stats: z.array(aiStatDraftSchema).default([]),
    notes: stringList.default([])
  })
);

export type AiMatchDraft = z.infer<typeof aiMatchDraftSchema>;

export type AiKnownPlayer = {
  id: string;
  displayName: string;
  aliases: string[];
  discordId?: string | null;
  discordUsername?: string | null;
};

function playerTokens(player: AiKnownPlayer) {
  return [player.id, player.displayName, player.discordId, player.discordUsername, ...player.aliases]
    .filter((value): value is string => Boolean(value))
    .map(normalizePlayerName)
    .filter(Boolean);
}

function replacePlayerId(draft: AiMatchDraft, unknownId: string, knownId: string) {
  draft.teamAPlayerIds = draft.teamAPlayerIds.map((id) => (id === unknownId ? knownId : id));
  draft.teamBPlayerIds = draft.teamBPlayerIds.map((id) => (id === unknownId ? knownId : id));
  draft.stats = draft.stats.map((stat) => ({
    ...stat,
    playerId: stat.playerId === unknownId ? knownId : stat.playerId
  }));
}

export function repairAiDraftPlayerIds(draft: AiMatchDraft, players: AiKnownPlayer[]) {
  const repaired: AiMatchDraft = {
    ...draft,
    teamAPlayerIds: [...draft.teamAPlayerIds],
    teamBPlayerIds: [...draft.teamBPlayerIds],
    stats: draft.stats.map((stat) => ({ ...stat })),
    notes: [...draft.notes]
  };
  const knownIds = new Set(players.map((player) => player.id));
  const tokenToId = new Map<string, string>();

  for (const player of players) {
    for (const token of playerTokens(player)) {
      tokenToId.set(token, player.id);
    }
  }

  const draftPlayerIds = new Set([
    ...repaired.teamAPlayerIds,
    ...repaired.teamBPlayerIds,
    ...repaired.stats.map((stat) => stat.playerId)
  ]);

  for (const id of draftPlayerIds) {
    if (knownIds.has(id)) continue;

    const directMatch = tokenToId.get(normalizePlayerName(id));
    if (directMatch) {
      replacePlayerId(repaired, id, directMatch);
      continue;
    }

    const matchingPlayers = players.filter((player) => {
      const tokens = playerTokens(player);
      return repaired.notes.some((note) => tokens.some((token) => token && normalizePlayerName(note).includes(token)));
    });

    if (matchingPlayers.length === 1) {
      replacePlayerId(repaired, id, matchingPlayers[0].id);
      repaired.notes = repaired.notes.filter((note) => !normalizePlayerName(note).includes("couldnotbematched"));
    }
  }

  return repaired;
}

export function extractJsonObject(text: string) {
  const trimmed = text.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) return trimmed;

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) return fenced[1].trim();

  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  if (first >= 0 && last > first) return trimmed.slice(first, last + 1);

  throw new Error("Claude did not return a JSON object.");
}

export function normalizePlayerName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}
