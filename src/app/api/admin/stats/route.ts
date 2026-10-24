import { createStat } from "@/lib/mutations";
import { apiError, guardAdminRequest, jsonSuccess, parseJson } from "@/lib/api";
import { statSchema } from "@/lib/validators";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const blocked = await guardAdminRequest(request);
  if (blocked) return blocked;

  try {
    const input = await parseJson(request, statSchema);
    const stat = await createStat(input);
    return jsonSuccess(stat, 201);
  } catch (error) {
    return apiError(error);
  }
}
