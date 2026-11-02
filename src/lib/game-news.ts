import { MatchStatus, Prisma, TournamentStatus } from "@prisma/client";

import { formatDate, formatDecimal } from "@/lib/format";
import { getMatchSideName } from "@/lib/match-utils";
import { prisma } from "@/lib/prisma";
import { attachRegisteredTeams } from "@/lib/registered-teams";
import { calculateAggregateStats } from "@/lib/stats";

// The in-game News tile holds four articles plus its built-in "View More".
const MAX_ARTICLES = 4;

export type GameNewsArticle = {
  /** Identifies the banner too: potw-<id>, match-<id> or tournament-<id>. The game caches images by URL. */
  id: string;
  title: string;
  /** Short line shown over the banner image. */
  eyebrow: string;
  headline: string;
  body: string;
};

const matchInclude = {
  teamA: true,
  teamB: true,
  tournament: true,
  league: true,
  maps: { orderBy: { order: "asc" as const } },
  stats: { include: { player: true } }
};

async function latestPlayerOfWeek() {
  return prisma.playerOfWeek.findFirst({
    where: { weekStart: { lte: new Date() } },
    include: { player: { include: { currentTeam: true } } },
    orderBy: { weekStart: "desc" }
  });
}

function playerOfWeekArticle(entry: NonNullable<Awaited<ReturnType<typeof latestPlayerOfWeek>>>): GameNewsArticle {
  const team = entry.player.currentTeam?.name;
  const lines = [`${entry.player.displayName}${team ? ` of ${team}` : ""} is Player of the Week for ${formatDate(entry.weekStart)}.`];
  if (entry.note) lines.push(entry.note);
  return {
    id: `potw-${entry.id}`,
    title: "PLAYER OF THE WEEK",
    eyebrow: entry.title || "Player of the Week",
    headline: entry.player.displayName,
    body: lines.join("\n\n")
  };
}

type NewsMatch = Awaited<ReturnType<typeof loadMatches>>[number];

async function loadMatches(where: Prisma.MatchWhereInput, take: number) {
  const matches = await prisma.match.findMany({
    where,
    include: matchInclude,
    orderBy: [{ playedAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
    take
  });
  return attachRegisteredTeams(matches);
}

function matchArticle(match: NewsMatch): GameNewsArticle {
  const scoreline = `${getMatchSideName(match, "A")} ${match.scoreA}-${match.scoreB} ${getMatchSideName(match, "B")}`;
  const lines = [`${scoreline}${match.tournament ? ` in ${match.tournament.name}` : match.league ? ` in ${match.league.name}` : ""}.`];

  const maps = match.maps.map((map) => `${map.mapName} ${map.teamAScore}-${map.teamBScore}`);
  if (maps.length) lines.push(`Maps: ${maps.join(", ")}.`);
  if (match.playedAt) lines.push(`Played ${formatDate(match.playedAt)}.`);

  const byPlayer = new Map<string, { name: string; entries: typeof match.stats }>();
  for (const stat of match.stats) {
    const entry = byPlayer.get(stat.playerId) || { name: stat.player.displayName, entries: [] as typeof match.stats };
    entry.entries.push(stat);
    byPlayer.set(stat.playerId, entry);
  }
  const top = Array.from(byPlayer.values())
    .map((value) => ({ name: value.name, aggregate: calculateAggregateStats(value.entries) }))
    .sort((a, b) => b.aggregate.rating - a.aggregate.rating)[0];
  if (top) lines.push(`Top performer: ${top.name} with a ${formatDecimal(top.aggregate.rating)} rating and ${top.aggregate.kills} kills.`);

  return {
    id: `match-${match.id}`,
    title: scoreline,
    eyebrow: match.tournament?.name || match.league?.name || "Match result",
    headline: scoreline,
    body: lines.join("\n\n")
  };
}

type NewsTournament = NonNullable<Awaited<ReturnType<typeof latestTournament>>>;

async function latestTournament() {
  return prisma.tournament.findFirst({
    where: { OR: [{ status: TournamentStatus.ONGOING }, { featured: true }] },
    orderBy: [{ status: "asc" }, { startDate: "desc" }]
  });
}

function tournamentArticle(tournament: NewsTournament): GameNewsArticle {
  const lines = [tournament.description || `${tournament.name} is on throwbacktracker.com.`];
  if (tournament.startDate) lines.push(`Starts ${formatDate(tournament.startDate)}.`);
  if (tournament.prizePool) lines.push(`Prize pool: ${tournament.prizePool}.`);
  return {
    id: `tournament-${tournament.id}`,
    title: "TOURNAMENT",
    eyebrow: tournament.status === TournamentStatus.ONGOING ? "Happening now" : "Featured tournament",
    headline: tournament.name,
    body: lines.join("\n\n")
  };
}

export async function getGameNews(): Promise<GameNewsArticle[]> {
  const [playerOfWeek, tournament] = await Promise.all([latestPlayerOfWeek(), latestTournament()]);
  const articles: GameNewsArticle[] = [];
  if (playerOfWeek) articles.push(playerOfWeekArticle(playerOfWeek));
  if (tournament) articles.push(tournamentArticle(tournament));

  const matches = await loadMatches({ status: MatchStatus.COMPLETED }, MAX_ARTICLES - articles.length);
  return [...articles, ...matches.map(matchArticle)].slice(0, MAX_ARTICLES);
}

export async function getGameNewsArticle(id: string) {
  if (id.startsWith("potw-")) {
    const entry = await prisma.playerOfWeek.findUnique({
      where: { id: id.slice("potw-".length) },
      include: { player: { include: { currentTeam: true } } }
    });
    return entry ? playerOfWeekArticle(entry) : null;
  }
  if (id.startsWith("match-")) {
    const [match] = await loadMatches({ id: id.slice("match-".length), status: MatchStatus.COMPLETED }, 1);
    return match ? matchArticle(match) : null;
  }
  if (id.startsWith("tournament-")) {
    const tournament = await prisma.tournament.findUnique({ where: { id: id.slice("tournament-".length) } });
    return tournament ? tournamentArticle(tournament) : null;
  }
  return null;
}

// One article per block, split by a "---" line; the game mod reads this format.
// The game only loads image URLs that end in .png.
export function serializeGameNews(articles: GameNewsArticle[], origin: string) {
  const clean = (value: string) => value.replace(/\r/g, "").replace(/^-{3,}$/gm, "").trim();
  return articles
    .map((article) =>
      [`title: ${clean(article.title).replace(/\n/g, " ")}`, `image: ${origin}/api/game-news/banner/${encodeURIComponent(article.id)}.png`, clean(article.body)].join("\n")
    )
    .join("\n---\n");
}
