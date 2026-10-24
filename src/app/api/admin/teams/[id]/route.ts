import { deleteTeam, updateTeam } from "@/lib/mutations";
import { apiError, guardAdminRequest, jsonSuccess, parseJson } from "@/lib/api";
import { teamSchema } from "@/lib/validators";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const blocked = await guardAdminRequest(request);
  if (blocked) return blocked;

  try {
    const { id } = await params;
    const input = await parseJson(request, teamSchema);
    const team = await updateTeam(id, input);
    return jsonSuccess(team);
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const blocked = await guardAdminRequest(request);
  if (blocked) return blocked;

  try {
    const { id } = await params;
    await deleteTeam(id);
    return jsonSuccess({ deleted: true });
  } catch (error) {
    return apiError(error);
  }
}
