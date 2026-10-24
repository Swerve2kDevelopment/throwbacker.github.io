import { apiError, guardAdminRequest, jsonError, jsonSuccess } from "@/lib/api";
import { aiMatchDraftSchema, extractJsonObject, repairAiDraftPlayerIds } from "@/lib/ai-match-helper";
import { COMMON_MAPS } from "@/lib/match-utils";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function modelPreference(model: string) {
  const id = model.toLowerCase();
  if (id.includes("haiku")) return 0;
  if (id.includes("sonnet")) return 1;
  if (id.includes("opus")) return 2;
  return 3;
}

export async function POST(request: Request) {
  const blocked = await guardAdminRequest(request);
  if (blocked) return blocked;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return jsonError("ANTHROPIC_API_KEY is not configured.", 500);
  }

  try {
    const body = await request.json().catch(() => ({}));
    const recap = String(body.recap || "").trim();
    if (!recap) return jsonError("Match recap is required.", 422);

    const [players, tournaments] = await Promise.all([
      prisma.player.findMany({
        orderBy: { displayName: "asc" },
        select: {
          id: true,
          displayName: true,
          aliases: true,
          discordId: true,
          discordUsername: true,
          currentTeam: { select: { name: true, tag: true } }
        }
      }),
      prisma.tournament.findMany({
        orderBy: { startDate: "desc" },
        select: { id: true, name: true, status: true }
      })
    ]);

    const system = [
      "You convert Rainbow Six Siege match recaps into strict JSON for an admin CMS.",
      "Return only JSON. No Markdown. No commentary.",
      "Use only exact player IDs from the provided player list. Never invent or alter player IDs.",
      "Match players by displayName, aliases, discordId, or discordUsername. If a Discord ID or username matches a known player, use that known player's id.",
      "If a player is not found, omit them and add a note.",
      "Use the map name the user wrote. Prefer these spellings when they match: " + COMMON_MAPS.join(", ") + ".",
      "If a stat is missing, use 0. If rating is missing, use null.",
      "format is the number of players per side from 1 to 5. Use 5 for a 5v5 or ten-man match. Never use 0 or 10.",
      "Winner side must be A, B, or null.",
      "Status should usually be COMPLETED for played matches.",
      "playedAt should be ISO-8601 if the user gives a date/time; otherwise null.",
      "Schema: { tournamentId, customTeamAName, customTeamBName, format, scoreA, scoreB, winnerSide, status, playedAt, teamAPlayerIds, teamBPlayerIds, maps, stats, notes }.",
      "Map item: { mapName, teamAScore, teamBScore, winnerSide }.",
      "Stat item: { playerId, side, mapName, kills, deaths, assists, headshots, roundsPlayed, ratingOverride }. roundsPlayed is the map's total rounds when known, else 0."
    ].join("\n");

    const user = JSON.stringify(
      {
        recap,
        knownPlayers: players,
        knownTournaments: tournaments,
        currentDate: new Date().toISOString()
      },
      null,
      2
    );

    const configuredModel = process.env["ANTHROPIC_MODEL"]?.trim();
    const modelsResponse = await fetch("https://api.anthropic.com/v1/models?limit=100", {
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01"
      }
    });
    const modelList = modelsResponse.ok ? await modelsResponse.json() : null;
    const availableModels = Array.isArray(modelList?.data)
      ? modelList.data.map((entry: { id?: string }) => entry.id).filter((id: unknown): id is string => typeof id === "string" && id.length > 0)
      : [];
    const preferredAvailableModels = [...availableModels].sort((a, b) => modelPreference(a) - modelPreference(b) || a.localeCompare(b));

    const modelsToTry = [configuredModel, ...preferredAvailableModels].filter(
      (model, index, models): model is string => Boolean(model) && models.indexOf(model) === index
    );

    if (!modelsToTry.length) {
      const modelListError = modelsResponse.ok ? "Anthropic returned an empty model list." : await modelsResponse.text();
      return jsonError(`Anthropic model list failed: ${modelListError}`, modelsResponse.ok ? 404 : modelsResponse.status);
    }

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
          max_tokens: 4000,
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
        `Anthropic could not find any configured fallback model. Tried: ${modelErrors.join(" | ")}. In Anthropic, open your API model list and set ANTHROPIC_MODEL to an exact available model ID.`,
        404
      );
    }

    const result = await response.json();
    const text = result.content?.find((block: { type: string; text?: string }) => block.type === "text")?.text;
    if (!text) return jsonError("Claude returned no text.", 502);

    const parsed = aiMatchDraftSchema.parse(JSON.parse(extractJsonObject(text)));
    const repaired = repairAiDraftPlayerIds(parsed, players);
    return jsonSuccess({ draft: repaired, model });
  } catch (error) {
    return apiError(error);
  }
}
