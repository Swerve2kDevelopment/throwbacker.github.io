import { BracketStage, BracketType, MatchKind, MatchSide, MatchStatus, TournamentStatus } from "@prisma/client";
import { z } from "zod";

const webhookPattern = /^https:\/\/(?:(?:canary|ptb)\.)?discord(?:app)?\.com\/api\/webhooks\/\d+\/[\w-]+$/;

export function isDiscordWebhookUrl(value: string) {
  return webhookPattern.test(value.trim());
}

const emptyToUndefined = (value: unknown) => {
  if (typeof value === "string" && value.trim() === "") return undefined;
  return value;
};

const emptyToNull = (value: unknown) => {
  if (typeof value === "string" && value.trim() === "") return null;
  return value;
};

const optionalString = z.preprocess(emptyToUndefined, z.string().trim().optional());
const nullableString = z.preprocess(emptyToNull, z.string().trim().nullable().optional());
const nullableId = z.preprocess(emptyToNull, z.string().trim().nullable().optional());
const nullableSide = z.preprocess(emptyToNull, z.nativeEnum(MatchSide).nullable().optional());
const requiredId = z.string().trim().min(1, "Required");
const optionalNumber = z.preprocess(emptyToUndefined, z.coerce.number().optional());
const defaultInt = z.preprocess(emptyToUndefined, z.coerce.number().int().min(0).default(0));
const optionalInt = z.preprocess(emptyToUndefined, z.coerce.number().int().min(0).optional());
const nullableInt = z.preprocess(emptyToNull, z.coerce.number().int().min(0).nullable().optional());
const checkbox = z.preprocess((value) => value === "on" || value === true || value === "true", z.boolean().default(false));

const nullableDate = z.preprocess((value) => {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" && value.trim() === "") return null;
  return new Date(String(value));
}, z.date().nullable().optional());

const stringArray = z.preprocess((value) => {
  if (Array.isArray(value)) {
    return value.flatMap((entry) =>
      String(entry)
        .split(/[\n,]/)
        .map((item) => item.trim())
        .filter(Boolean)
    );
  }

  if (typeof value === "string") {
    return value
      .split(/[\n,]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
}, z.array(z.string().min(1)).default([]));

export function formDataToObject(formData: FormData) {
  const output: Record<string, unknown> = {};

  for (const [key, value] of formData.entries()) {
    if (typeof value !== "string") continue;
    if (Object.prototype.hasOwnProperty.call(output, key)) {
      const existing = output[key];
      output[key] = Array.isArray(existing) ? [...existing, value] : [existing, value];
    } else {
      output[key] = value;
    }
  }

  return output;
}

export const playerSchema = z.object({
  displayName: z.string().trim().min(1, "Display name is required."),
  slug: optionalString,
  discordId: nullableString,
  discordUsername: nullableString,
  nationality: nullableString,
  avatarUrl: nullableString,
  currentTeamId: nullableId,
  realName: nullableString,
  role: nullableString,
  status: nullableString,
  dateOfBirth: nullableDate,
  socialLinks: stringArray,
  aliases: stringArray,
  notes: nullableString
});

export const teamSchema = z.object({
  name: z.string().trim().min(1, "Team name is required."),
  slug: optionalString,
  tag: nullableString,
  logoUrl: nullableString,
  themeColor: nullableString,
  region: nullableString,
  description: nullableString,
  currentRosterIds: stringArray,
  playerIds: stringArray
});

export const tournamentSchema = z.object({
  name: z.string().trim().min(1, "Tournament name is required."),
  slug: optionalString,
  description: nullableString,
  status: z.nativeEnum(TournamentStatus).default(TournamentStatus.UPCOMING),
  startDate: nullableDate,
  endDate: nullableDate,
  prizePool: nullableString,
  logoUrl: nullableString,
  bannerUrl: nullableString,
  bracketType: z.nativeEnum(BracketType).default(BracketType.SINGLE_ELIMINATION),
  mapVetoes: stringArray,
  operatorBans: stringArray,
  mvpPlayerId: nullableId,
  featured: z.preprocess((value) => value === "on" || value === true || value === "true", z.boolean().default(false)),
  selectedTeamIds: stringArray,
  teamIds: stringArray
});

export const mapInputSchema = z.object({
  mapName: z.string().trim().min(1, "Map name is required."),
  teamAScore: defaultInt,
  teamBScore: defaultInt,
  winnerTeamId: nullableId,
  winnerSide: nullableSide,
  order: z.preprocess(emptyToUndefined, z.coerce.number().int().min(1).default(1))
});

export const matchSchema = z.object({
  tournamentId: nullableId,
  leagueId: nullableId,
  matchKind: z.nativeEnum(MatchKind).default(MatchKind.FUN),
  teamAId: nullableId,
  teamBId: nullableId,
  customTeamAName: nullableString,
  customTeamBName: nullableString,
  format: z.preprocess(emptyToUndefined, z.coerce.number().int().min(1).max(5).default(5)),
  teamAPlayerIds: stringArray,
  teamBPlayerIds: stringArray,
  scoreA: defaultInt,
  scoreB: defaultInt,
  winnerTeamId: nullableId,
  winnerSide: nullableSide,
  status: z.nativeEnum(MatchStatus).default(MatchStatus.SCHEDULED),
  playedAt: nullableDate,
  mapVetoes: stringArray,
  operatorBans: z.preprocess((value) => {
    const lines = Array.isArray(value) ? value.map(String) : typeof value === "string" ? [value] : [];
    return lines.flatMap((entry) => entry.split(/\r?\n/)).map((entry) => entry.trim()).filter(Boolean);
  }, z.array(z.string().min(1)).default([])),
  title: nullableString,
  bracketStage: z.preprocess(emptyToNull, z.nativeEnum(BracketStage).nullable().optional()),
  bracketRound: nullableInt,
  bracketPosition: nullableInt,
  announce: checkbox,
  // Set by the match builder: the scoreboard is complete, so stat lines it no longer lists are removed.
  statsReplace: checkbox,
  mapsRaw: z.preprocess(emptyToUndefined, z.string().optional()),
  bulkStatsRaw: z.preprocess(emptyToUndefined, z.string().optional()),
  // Kept as "" when the field is submitted empty so the editor can clear moments.
  keyMomentsRaw: z.string().optional(),
  maps: z.array(mapInputSchema).optional()
}).superRefine((value, ctx) => {
  if (value.matchKind === MatchKind.LEAGUE && !value.leagueId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["leagueId"],
      message: "Choose a league for league games."
    });
  }

  if (!value.teamAId && !value.customTeamAName) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["teamAId"],
      message: "Choose Team A or enter a custom Team A name."
    });
  }

  if (!value.teamBId && !value.customTeamBName) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["teamBId"],
      message: "Choose Team B or enter a custom Team B name."
    });
  }

  if (value.teamAPlayerIds.length > value.format || value.teamBPlayerIds.length > value.format) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["format"],
      message: `A ${value.format}v${value.format} match cannot have more than ${value.format} players on either side.`
    });
  }
});

export const statSchema = z.object({
  playerId: requiredId,
  teamId: nullableId,
  tournamentId: nullableId,
  matchId: requiredId,
  mapGameId: requiredId,
  side: nullableSide,
  kills: defaultInt,
  deaths: defaultInt,
  assists: defaultInt,
  headshots: defaultInt,
  roundsPlayed: defaultInt,
  // Legacy fields: no longer edited in the admin UI, but still accepted from
  // the bot API. Left undefined so editing a stat row never wipes old data.
  plants: optionalInt,
  defuses: optionalInt,
  oneVX: optionalInt,
  openingKills: optionalInt,
  openingDeaths: optionalInt,
  kostRounds: optionalInt,
  ratingOverride: z.preprocess(emptyToNull, optionalNumber.nullable())
});

export const siteSettingsSchema = z.object({
  discordWebhookUrl: nullableString.refine((value) => !value || isDiscordWebhookUrl(value), {
    message: "Webhook URL must look like https://discord.com/api/webhooks/<id>/<token>."
  }),
  discordPingRoleId: z.preprocess(
    (value) => (typeof value === "string" ? value.trim().replace(/^<@&(\d+)>$/, "$1") : value),
    nullableString.refine((value) => !value || /^\d{17,20}$/.test(value), {
      message: "Role ID must be the 17-20 digit number from Discord (right-click the role → Copy Role ID)."
    })
  ),
  pingOnMatches: checkbox,
  pingOnRecruitment: checkbox,
  pingOnSignings: checkbox
});

export const RECRUITMENT_ROLES = ["Entry Fragger", "Support", "Flex", "IGL", "Anchor", "Roamer", "Hard Breacher", "Substitute"] as const;

export const recruitmentPostSchema = z.object({
  role: z.preprocess(emptyToNull, z.enum(RECRUITMENT_ROLES).nullable().optional()),
  note: z.preprocess(emptyToNull, z.string().trim().max(400, "Keep the note under 400 characters.").nullable().optional())
});

export const bracketPlacementSchema = z.object({
  bracketStage: z.preprocess(emptyToNull, z.nativeEnum(BracketStage).nullable().optional()),
  bracketRound: nullableInt,
  bracketPosition: nullableInt
});

export const operatorIconBulkSchema = z.object({
  mappingsRaw: z.string().trim().min(1, "Add at least one operator line.")
});

export const operatorIconSchema = z.object({
  name: z.string().trim().min(1, "Operator name is required."),
  iconPath: nullableString
});

export const playerOfWeekSchema = z.object({
  playerId: requiredId,
  weekStart: z.preprocess((value) => {
    const date = typeof value === "string" && value.trim() ? new Date(`${value.trim().slice(0, 10)}T00:00:00.000Z`) : new Date();
    date.setUTCHours(0, 0, 0, 0);
    return date;
  }, z.date()),
  title: nullableString,
  note: nullableString
});

export const adminUserSchema = z.object({
  discordId: z.string().trim().min(1, "Discord ID is required.")
});

export const adminDmSchema = z.object({
  targetDiscordId: z.preprocess(emptyToUndefined, z.string().trim().optional()),
  sendToAllAdmins: z.preprocess((value) => value === "on" || value === true || value === "true", z.boolean().default(false)),
  message: z.string().trim().min(1, "Message is required.").max(1900, "Discord messages must be under 1900 characters.")
}).superRefine((value, ctx) => {
  if (!value.sendToAllAdmins && !value.targetDiscordId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["targetDiscordId"],
      message: "Enter a Discord user ID or choose all approved admins."
    });
  }
});

export const playerBanSchema = z.object({
  playerId: requiredId,
  reason: z.string().trim().min(1, "Ban reason is required."),
  matchText: z.string().trim().min(1, "Match is required.")
});

export const liftPlayerBanSchema = z.object({
  liftReason: nullableString
});

export type PlayerInput = z.infer<typeof playerSchema>;
export type TeamInput = z.infer<typeof teamSchema>;
export type TournamentInput = z.infer<typeof tournamentSchema>;
export type MatchInput = z.infer<typeof matchSchema>;
export type StatInput = z.infer<typeof statSchema>;
export type AdminDmInput = z.infer<typeof adminDmSchema>;
export type PlayerBanInput = z.infer<typeof playerBanSchema>;
export type LiftPlayerBanInput = z.infer<typeof liftPlayerBanSchema>;
export type SiteSettingsInput = z.infer<typeof siteSettingsSchema>;
export type OperatorIconInput = z.infer<typeof operatorIconSchema>;
export type PlayerOfWeekInput = z.infer<typeof playerOfWeekSchema>;
export type BracketPlacementInput = z.infer<typeof bracketPlacementSchema>;

export function selectedIds(primary: string[], fallback: string[] = []) {
  return primary.length ? primary : fallback;
}

export function parseMapRows(raw: string | undefined) {
  if (!raw?.trim()) return [];

  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const [mapName, rawA = "0", rawB = "0", winner = ""] = line.split(/[|,]/).map((part) => part.trim());
      const winnerToken = winner.toLowerCase();
      const winnerSide = winnerToken === "a" || winnerToken === "teama" ? MatchSide.A : winnerToken === "b" || winnerToken === "teamb" ? MatchSide.B : null;

      return mapInputSchema.parse({
        mapName,
        teamAScore: rawA,
        teamBScore: rawB,
        winnerTeamId: winnerSide ? null : winner || null,
        winnerSide,
        order: index + 1
      });
    });
}
