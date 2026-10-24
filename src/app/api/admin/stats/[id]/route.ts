import { deleteStat, updateStat } from "@/lib/mutations";
import { apiError, guardAdminRequest, jsonSuccess, parseJson } from "@/lib/api";
import { statSchema } from "@/lib/validators";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const blocked = await guardAdminRequest(request);
  if (blocked) return blocked;

  try {
    const { id } = await params;
    const input = await parseJson(request, statSchema);
    const stat = await updateStat(id, input);
    return jsonSuccess(stat);
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const blocked = await guardAdminRequest(request);
  if (blocked) return blocked;

  try {
    const { id } = await params;
    await deleteStat(id);
    return jsonSuccess({ deleted: true });
  } catch (error) {
    return apiError(error);
  }
}
