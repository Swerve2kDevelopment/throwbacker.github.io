import { announceMatchStats } from "@/lib/match-announcements";
import { deleteMatch, updateMatch } from "@/lib/mutations";
import { apiError, guardAdminRequest, jsonSuccess, parseJson } from "@/lib/api";
import { matchSchema } from "@/lib/validators";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const blocked = await guardAdminRequest(request);
  if (blocked) return blocked;

  try {
    const { id } = await params;
    const input = await parseJson(request, matchSchema);
    const result = await updateMatch(id, input);
    if (input.announce && result.statsSaved) await announceMatchStats(id, "updated");
    return jsonSuccess({ ...result.match, statsSaved: result.statsSaved, warnings: result.warnings });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const blocked = await guardAdminRequest(request);
  if (blocked) return blocked;

  try {
    const { id } = await params;
    await deleteMatch(id);
    return jsonSuccess({ deleted: true });
  } catch (error) {
    return apiError(error);
  }
}
