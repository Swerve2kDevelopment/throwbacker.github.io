import { getMatchSideName, getMatchTitle } from "@/lib/match-utils";
import { prisma } from "@/lib/prisma";
import { calculateAggregateStats } from "@/lib/stats";
import { OSCL_EMBED_COLOR, sendDiscordWebhook, type WebhookEmbed } from "@/lib/site-settings";

function siteUrl() {
  return (process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXTAUTH_URL || "").replace(/\/$/, "");
}

// Player names are user-supplied; keep them from breaking Discord markdown.
function clean(value: string) {
  return value.replace(/([*_`~|>\\])/g, "\\$1").replace(/@/g, "@\u200b");
}

function truncate(value: string, max: number) {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

/**
 * Builds the stats announcement for a match: result, maps and every player's
 * K/D/A with rating, grouped by side. Nothing in it can mention anyone.
 */
export async function buildMatchAnnouncement(matchId: string, kind: "new" | "updated" = "new"): Promise<WebhookEmbed | null> {
  const match = await prisma.match.findUnique({
    where: { id: matchId },
    include: {
      teamA: true,
      teamB: true,
      tournament: true,
      league: true,
      maps: { orderBy: { order: "asc" } },
      stats: { include: { player: true } }
    }
  });
  if (!match || !match.stats.length) return null;

  const teamAName = getMatchSideName(match, "A");
  const teamBName = getMatchSideName(match, "B");
  const title = match.title || getMatchTitle(match);
  const winner = match.winnerSide === "A" ? teamAName : match.winnerSide === "B" ? teamBName : null;
  const competition = match.tournament?.name || (match.league ? match.league.shortName || match.league.name : match.matchKind === "LEAGUE" ? "League game" : "Fun game");

  const byPlayer = new Map<string, { name: string; side: string | null; entries: typeof match.stats }>();
  for (const stat of match.stats) {
    const row = byPlayer.get(stat.playerId) || { name: stat.player.displayName, side: stat.side, entries: [] as typeof match.stats };
    row.entries.push(stat);
    row.side = row.side || stat.side;
    byPlayer.set(stat.playerId, row);
  }

  const lineFor = (row: { name: string; entries: typeof match.stats }) => {
    const aggregate = calculateAggregateStats(row.entries);
    return `**${clean(row.name)}** ${aggregate.kills}/${aggregate.deaths}/${aggregate.assists} · ${aggregate.rating.toFixed(2)}`;
  };
  const sorted = [...byPlayer.values()].sort(
    (a, b) => calculateAggregateStats(b.entries).rating - calculateAggregateStats(a.entries).rating
  );
  const sideField = (side: "A" | "B" | null, label: string) => {
    const rows = sorted.filter((row) => row.side === side);
    return rows.length ? [{ name: truncate(label, 256), value: truncate(rows.map(lineFor).join("\n"), 1024), inline: side !== null }] : [];
  };

  const maps = match.maps.length
    ? match.maps.map((map) => `${clean(map.mapName)} ${map.teamAScore}-${map.teamBScore}`).join(" · ")
    : "Not listed";
  const url = siteUrl() ? `${siteUrl()}/matches/${match.id}` : undefined;

  return {
    title: truncate(`${kind === "updated" ? "Stats updated" : "New stats"}: ${title}`, 256),
    url,
    color: OSCL_EMBED_COLOR,
    description: [
      `**${clean(teamAName)} ${match.scoreA} - ${match.scoreB} ${clean(teamBName)}**`,
      winner ? `${clean(winner)} win` : null,
      `${clean(competition)} · ${match.format}v${match.format}`
    ]
      .filter(Boolean)
      .join("\n"),
    fields: [
      { name: match.maps.length === 1 ? "Map" : "Maps", value: truncate(maps, 1024), inline: false },
      ...sideField("A", `${teamAName} (K/D/A · Rating)`),
      ...sideField("B", `${teamBName} (K/D/A · Rating)`),
      ...sideField(null, "Players (K/D/A · Rating)")
    ].slice(0, 25),
    footer: { text: "Old Siege: Challengers League" },
    timestamp: (match.playedAt || new Date()).toISOString()
  };
}

/** Sends the announcement; never throws so a Discord outage can't block a save. */
export async function announceMatchStats(matchId: string, kind: "new" | "updated" = "new") {
  try {
    const embed = await buildMatchAnnouncement(matchId, kind);
    if (!embed) return { sent: false as const, reason: "No stats on this match yet." };
    const sent = await sendDiscordWebhook({ embeds: [embed] }, { event: "match" });
    return sent ? { sent: true as const } : { sent: false as const, reason: "No webhook configured." };
  } catch (error) {
    return { sent: false as const, reason: error instanceof Error ? error.message : "Webhook failed." };
  }
}
