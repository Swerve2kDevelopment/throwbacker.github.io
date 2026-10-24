import { createPlayer } from "@/lib/mutations";
import { apiError, guardAdminRequest, jsonSuccess, parseJson } from "@/lib/api";
import { playerSchema } from "@/lib/validators";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const blocked = await guardAdminRequest(request);
  if (blocked) return blocked;

  try {
    const input = await parseJson(request, playerSchema);
    const player = await createPlayer(input);
    return jsonSuccess(player, 201);
  } catch (error) {
    return apiError(error);
  }
}
