import { createTournament } from "@/lib/mutations";
import { apiError, guardAdminRequest, jsonSuccess, parseJson } from "@/lib/api";
import { tournamentSchema } from "@/lib/validators";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const blocked = await guardAdminRequest(request);
  if (blocked) return blocked;

  try {
    const input = await parseJson(request, tournamentSchema);
    const tournament = await createTournament(input);
    return jsonSuccess(tournament, 201);
  } catch (error) {
    return apiError(error);
  }
}
