import { deleteTournament, updateTournament } from "@/lib/mutations";
import { apiError, guardAdminRequest, jsonSuccess, parseJson } from "@/lib/api";
import { tournamentSchema } from "@/lib/validators";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const blocked = await guardAdminRequest(request);
  if (blocked) return blocked;

  try {
    const { id } = await params;
    const input = await parseJson(request, tournamentSchema);
    const tournament = await updateTournament(id, input);
    return jsonSuccess(tournament);
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const blocked = await guardAdminRequest(request);
  if (blocked) return blocked;

  try {
    const { id } = await params;
    await deleteTournament(id);
    return jsonSuccess({ deleted: true });
  } catch (error) {
    return apiError(error);
  }
}
