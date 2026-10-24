import { apiError, jsonError, jsonSuccess } from "@/lib/api";
import { formatDecimal, formatKdDiff, formatPercent } from "@/lib/format";
import { getMatchTitle } from "@/lib/match-utils";
import { prisma } from "@/lib/prisma";
import { calculateAggregateStats } from "@/lib/stats";

export const dynamic = "force-dynamic";

type ChatHistoryMessage = {
  role?: unknown;
  content?: unknown;
};

function modelPreference(model: string) {
  const id = model.toLowerCase();
  if (id.includes("haiku")) return 0;
  if (id.includes("sonnet")) return 1;
  if (id.includes("opus")) return 2;
  return 3;
}

function safeHistory(value: unknown) {
  if (!Array.isArray(value)) return [];

  return value
    .filter((message: ChatHistoryMessage) => message.role === "user" || message.role === "assistant")
    .map((message) => ({
      role: message.role as "user" | "assistant",
      content: String(message.content || "").slice(0, 800)
    }))
    .filter((message) => message.content.trim())
    .slice(-6);
}

async function getAnthropicModelsToTry(apiKey: string) {
  const configuredModel = process.env["ANTHROPIC_MODEL"]?.trim();

  const modelsResponse = await fetch("https://api.anthropic.com/v1/models?limit=100", {
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01"
    }
  });

  if (!modelsResponse.ok) {
    throw new Error(`Anthropic model list failed: ${await modelsResponse.text()}`);
  }

  const modelList = await modelsResponse.json();
  const availableModels = Array.isArray(modelList?.data)
    ? modelList.data.map((entry: { id?: string }) => entry.id).filter((id: unknown): id is string => typeof id === "string" && id.length > 0)
    : [];

  const preferredAvailableModels = [...availableModels].sort((a, b) => modelPreference(a) - modelPreference(b) || a.localeCompare(b));
  const modelsToTry = [configuredModel, ...preferredAvailableModels].filter(
    (model, index, models): model is string => Boolean(model) && models.indexOf(model) === index
  );

  if (!modelsToTry.length) throw new Error("Anthropic returned an empty model list.");
  return modelsToTry;
}

export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return jsonError("ANTHROPIC_API_KEY is not configured.", 500);
  }

  try {
    const { slug } = await params;
    const body = await request.json().catch(() => ({}));
    const question = String(body.question || "").trim();
    if (question.length < 2) return jsonError("Question is required.", 422);
    if (question.length > 500) return jsonError("Question is too long.", 422);

    const player = await prisma.player.findUnique({
      where: { slug },
      include: {
        currentTeam: true,
        memberships: {
          include: { team: true },
          orderBy: [{ isCurrent: "desc" }, { startDate: "desc" }]
        },
        stats: {
          include: {
            tournament: true,
            match: {
              include: {
                teamA: true,
                teamB: true
              }
            },
            mapGame: true,
            team: true
          },
          orderBy: { updatedAt: "desc" }
        }
      }
    });

    if (!player) return jsonError("Player was not found.", 404);

    const aggregate = calculateAggregateStats(player.stats);
    const matchRows = Array.from(
      player.stats.reduce((map, stat) => {
        const existing = map.get(stat.matchId) || {
          match: stat.match,
          entries: [] as typeof player.stats
        };
        existing.entries.push(stat);
        map.set(stat.matchId, existing);
        return map;
      }, new Map<string, { match: (typeof player.stats)[number]["match"]; entries: typeof player.stats }>())
    ).map(([matchId, value]) => ({
      matchId,
      title: getMatchTitle(value.match),
      playedAt: value.match.playedAt?.toISOString() || null,
      maps: value.entries.length,
      stats: calculateAggregateStats(value.entries)
    }));

    const matchCount = matchRows.length;
    const perMatch = {
      kdDiff: matchCount ? aggregate.kdDiff / matchCount : 0,
      kills: matchCount ? aggregate.kills / matchCount : 0,
      deaths: matchCount ? aggregate.deaths / matchCount : 0,
      maps: matchCount ? aggregate.maps / matchCount : 0
    };

    const context = {
      player: {
        name: player.displayName,
        nationality: player.nationality,
        currentTeam: player.currentTeam?.name || null,
        aliases: player.aliases,
        teams: player.memberships.map((membership) => membership.team.name)
      },
      aggregate: {
        rating: formatDecimal(aggregate.rating),
        kills: aggregate.kills,
        deaths: aggregate.deaths,
        assists: aggregate.assists,
        kd: formatDecimal(aggregate.kd),
        kdDiff: formatKdDiff(aggregate.kdDiff),
        maps: aggregate.maps,
        rounds: aggregate.rounds,
        kost: formatPercent(aggregate.kostPercent),
        headshotPercent: formatPercent(aggregate.hsPercent),
        openingDiff: formatKdDiff(aggregate.entryDiff)
      },
      averages: {
        matches: matchCount,
        kdDiffPerMatch: formatDecimal(perMatch.kdDiff),
        killsPerMatch: formatDecimal(perMatch.kills),
        deathsPerMatch: formatDecimal(perMatch.deaths),
        mapsPerMatch: formatDecimal(perMatch.maps)
      },
      recentMatches: matchRows.slice(0, 12).map((row) => ({
        title: row.title,
        date: row.playedAt,
        maps: row.maps,
        rating: formatDecimal(row.stats.rating),
        kills: row.stats.kills,
        deaths: row.stats.deaths,
        kdDiff: formatKdDiff(row.stats.kdDiff)
      }))
    };

    const system = [
      "You answer questions about a Rainbow Six Siege player using only the supplied database context.",
      "Be concise, direct, and numeric when the question asks for a calculation.",
      "If the user says KD gain per game, interpret it as average K-D +/- per match unless they clearly ask per map.",
      "Mention when the sample size is small. Do not invent stats that are not in the context."
    ].join("\n");

    const history = safeHistory(body.history);
    const user = JSON.stringify(
      {
        question,
        history,
        context
      },
      null,
      2
    );

    const modelsToTry = await getAnthropicModelsToTry(apiKey);
    let response: Response | null = null;
    let model = modelsToTry[0];
    const modelErrors: string[] = [];

    for (const candidate of modelsToTry) {
      const candidateResponse = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01"
        },
        body: JSON.stringify({
          model: candidate,
          max_tokens: 650,
          system,
          messages: [{ role: "user", content: user }]
        })
      });

      if (candidateResponse.ok) {
        response = candidateResponse;
        model = candidate;
        break;
      }

      const errorText = await candidateResponse.text();
      modelErrors.push(`${candidate}: ${errorText}`);

      if (!errorText.includes("not_found_error")) {
        return jsonError(`Anthropic API error using ${candidate}: ${errorText}`, candidateResponse.status);
      }
    }

    if (!response) {
      return jsonError(
        `Anthropic could not find any configured fallback model. Tried: ${modelErrors.join(" | ")}. Set ANTHROPIC_MODEL to an exact model ID from your Anthropic model list.`,
        404
      );
    }

    const result = await response.json();
    const answer = result.content?.find((block: { type: string; text?: string }) => block.type === "text")?.text?.trim();
    if (!answer) return jsonError("The AI returned no answer.", 502);

    return jsonSuccess({ answer, model });
  } catch (error) {
    return apiError(error);
  }
}
