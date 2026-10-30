import { prisma } from "@/lib/prisma";
import { calculatePlayerRank } from "@/lib/ranks";
import { absoluteSiteUrl } from "@/lib/site-settings";
import { calculateAggregateStats } from "@/lib/stats";

/**
 * Discord Game Stats Widget ("profile widget") integration.
 *
 * A player links once (OAuth scope application_identities.write); after that
 * the site pushes their stats with the app's bot token. Which numbers appear
 * where is set in the Developer Portal under Games → Widget, by typing the
 * keys listed in WIDGET_FIELDS into a field with Value Type "User Data".
 *
 * Docs: https://docs.discord.com/developers/social-layer/game-stats-widgets/overview
 */

const API = "https://discord.com/api/v10";

/** Keys available to the widget editor, shown in Admin Settings as a reference. */
export const WIDGET_FIELDS: Array<{ key: string; label: string; kind: "primary" | "dynamic"; type: "text" | "number" | "image" }> = [
  { key: "total_kills", label: "Kills", kind: "primary", type: "number" },
  { key: "total_deaths", label: "Deaths", kind: "primary", type: "number" },
  { key: "total_assists", label: "Assists", kind: "primary", type: "number" },
  { key: "total_games", label: "Matches played", kind: "primary", type: "number" },
  { key: "total_wins", label: "Matches won", kind: "primary", type: "number" },
  { key: "rank_name", label: "Rank (e.g. Emerald)", kind: "primary", type: "text" },
  { key: "rank_image", label: "Rank icon", kind: "primary", type: "image" },
  { key: "kd_ratio", label: "K/D ratio", kind: "dynamic", type: "number" },
  { key: "kd_diff", label: "K/D +/- (e.g. +77)", kind: "dynamic", type: "text" },
  { key: "kills_deaths", label: "Kills-deaths (e.g. 194-117)", kind: "dynamic", type: "text" },
  { key: "rating", label: "Rating", kind: "dynamic", type: "number" },
  { key: "mmr", label: "MMR", kind: "dynamic", type: "number" },
  { key: "maps_played", label: "Maps played", kind: "dynamic", type: "number" },
  { key: "rounds_played", label: "Rounds played", kind: "dynamic", type: "number" },
  { key: "headshot_pct", label: "Headshot %", kind: "dynamic", type: "number" },
  { key: "team", label: "Team (e.g. Player for Kanine APEXIS)", kind: "dynamic", type: "text" },
  { key: "team_logo", label: "Team logo", kind: "dynamic", type: "image" },
  { key: "nationality", label: "Nationality", kind: "dynamic", type: "text" },
  { key: "profile_url", label: "Link to OSCL profile", kind: "dynamic", type: "text" }
];

export function widgetBotToken() {
  return process.env.DISCORD_WIDGET_BOT_TOKEN || process.env.DISCORD_BOT_TOKEN || "";
}

export function widgetApplicationId() {
  return process.env.DISCORD_CLIENT_ID || "";
}

function round(value: number, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function media(url?: string | null) {
  const absolute = url ? absoluteSiteUrl(url.split("?")[0]) : undefined;
  return absolute && absolute.startsWith("https://") ? { url: absolute } : undefined;
}

function clip(value: string, max = 100) {
  return value.length > max ? value.slice(0, max) : value;
}

/** Builds the PATCH body for one player. Exported so admins can preview it. */
export async function buildWidgetProfile(playerId: string) {
  const player = await prisma.player.findUnique({
    where: { id: playerId },
    include: {
      currentTeam: true,
      stats: { include: { match: { select: { winnerSide: true } }, mapGame: { select: { winnerSide: true } } } }
    }
  });
  if (!player) return null;

  const aggregate = calculateAggregateStats(player.stats);
  const rank = calculatePlayerRank(player.stats);

  // A match counts as a win when the player's side won the series.
  const matchSides = new Map<string, { side: string | null; winner: string | null }>();
  for (const stat of player.stats) {
    const current = matchSides.get(stat.matchId);
    matchSides.set(stat.matchId, { side: current?.side || stat.side, winner: stat.match?.winnerSide ?? null });
  }
  const totalGames = matchSides.size;
  const totalWins = [...matchSides.values()].filter((entry) => entry.side && entry.winner && entry.side === entry.winner).length;

  const team = player.currentTeam;
  const rankImage = media(rank.image);
  const teamLogo = media(team?.logoUrl);
  const profileUrl = absoluteSiteUrl(`/players/${player.slug}`);

  const dynamic: Array<{ type: 1 | 2 | 3; name: string; value: string | number | { url: string } }> = [
    { type: 2, name: "kd_ratio", value: round(aggregate.kd) },
    { type: 1, name: "kd_diff", value: aggregate.kdDiff > 0 ? `+${aggregate.kdDiff}` : String(aggregate.kdDiff) },
    { type: 1, name: "kills_deaths", value: `${aggregate.kills}-${aggregate.deaths}` },
    { type: 2, name: "rating", value: round(aggregate.rating) },
    { type: 2, name: "mmr", value: rank.mmr },
    { type: 2, name: "maps_played", value: aggregate.maps },
    { type: 2, name: "rounds_played", value: aggregate.rounds },
    { type: 2, name: "headshot_pct", value: round(aggregate.hsPercent, 1) },
    { type: 1, name: "team", value: clip(team ? `Player for ${team.name}` : "Free agent") }
  ];
  if (teamLogo) dynamic.push({ type: 3, name: "team_logo", value: teamLogo });
  if (player.nationality) dynamic.push({ type: 1, name: "nationality", value: clip(player.nationality) });
  if (profileUrl) dynamic.push({ type: 1, name: "profile_url", value: clip(profileUrl) });

  return {
    player,
    body: {
      username: team?.tag ? `${player.displayName}.${team.tag}` : player.displayName,
      data: {
        primary: {
          rank_name: rank.name,
          ...(rankImage ? { rank_image: rankImage } : {}),
          total_kills: aggregate.kills,
          total_deaths: aggregate.deaths,
          total_assists: aggregate.assists,
          total_games: totalGames,
          total_wins: totalWins
        },
        dynamic
      }
    }
  };
}

export type WidgetSyncResult = { ok: boolean; status: number; message?: string };

/** Sends a linked player's current stats to their Discord profile widget. */
export async function pushPlayerWidget(playerId: string): Promise<WidgetSyncResult> {
  const token = widgetBotToken();
  const appId = widgetApplicationId();
  if (!token || !appId) return { ok: false, status: 0, message: "DISCORD_CLIENT_ID or the widget bot token isn't set." };

  const built = await buildWidgetProfile(playerId);
  if (!built?.player.discordId) return { ok: false, status: 0, message: "Player has no Discord ID." };

  const response = await fetch(`${API}/applications/${appId}/users/${built.player.discordId}/identities/${built.player.id}/profile`, {
    method: "PATCH",
    headers: { authorization: `Bot ${token}`, "content-type": "application/json" },
    body: JSON.stringify(built.body)
  }).catch((error: Error) => ({ ok: false, status: 0, text: async () => error.message }) as unknown as Response);

  if (!response.ok) {
    const message = (await response.text().catch(() => "")).slice(0, 300);
    return { ok: false, status: response.status, message: message || `Discord returned ${response.status}` };
  }

  await prisma.player.update({ where: { id: playerId }, data: { discordWidgetSyncedAt: new Date() } });
  return { ok: true, status: response.status };
}

/** Pushes every linked player in the list; never throws. */
export async function syncLinkedWidgets(playerIds?: string[]) {
  const players = await prisma.player.findMany({
    where: { discordWidgetLinkedAt: { not: null }, discordId: { not: null }, ...(playerIds ? { id: { in: playerIds } } : {}) },
    select: { id: true, displayName: true }
  });

  const failed: string[] = [];
  let synced = 0;
  for (const player of players) {
    try {
      const result = await pushPlayerWidget(player.id);
      if (result.ok) synced += 1;
      else failed.push(`${player.displayName} (${result.status || "error"})`);
    } catch {
      failed.push(player.displayName);
    }
  }
  return { linked: players.length, synced, failed };
}
