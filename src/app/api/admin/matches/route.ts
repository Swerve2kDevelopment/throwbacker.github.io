import { announceMatchStats } from "@/lib/match-announcements";
import { createMatch } from "@/lib/mutations";
import { apiError, guardAdminRequest, jsonSuccess, parseJson } from "@/lib/api";
import { matchSchema } from "@/lib/validators";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const blocked = await guardAdminRequest(request);
  if (blocked) return blocked;

  try {
    const input = await parseJson(request, matchSchema);
    const result = await createMatch(input);
    if (input.announce && result.statsSaved) await announceMatchStats(result.match.id);
    return jsonSuccess({ ...result.match, statsSaved: result.statsSaved, warnings: result.warnings }, 201);
  } catch (error) {
    return apiError(error);
  }
}
