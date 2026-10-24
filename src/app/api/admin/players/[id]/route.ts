import { deletePlayer, updatePlayer } from "@/lib/mutations";
import { apiError, guardAdminRequest, jsonSuccess, parseJson } from "@/lib/api";
import { playerSchema } from "@/lib/validators";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const blocked = await guardAdminRequest(request);
  if (blocked) return blocked;

  try {
    const { id } = await params;
    const input = await parseJson(request, playerSchema);
    const player = await updatePlayer(id, input);
    return jsonSuccess(player);
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const blocked = await guardAdminRequest(request);
  if (blocked) return blocked;

  try {
    const { id } = await params;
    await deletePlayer(id);
    return jsonSuccess({ deleted: true });
  } catch (error) {
    return apiError(error);
  }
}
