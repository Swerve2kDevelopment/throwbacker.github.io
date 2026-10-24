import { ZodError, type ZodType } from "zod";

import { requireAdminRequest } from "@/lib/permissions";

export function jsonError(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}

export function jsonSuccess<T>(data: T, status = 200) {
  return Response.json({ data }, { status });
}

export async function parseJson<T>(request: Request, schema: ZodType<T, any, any>) {
  const body = await request.json().catch(() => ({}));
  return schema.parse(body);
}

function formatZodIssue(issue: ZodError["issues"][number]) {
  const path = issue.path.join(".");
  return path ? `${path}: ${issue.message}` : issue.message;
}

export function apiError(error: unknown) {
  if (error instanceof ZodError) {
    return jsonError(error.issues.map(formatZodIssue).join(" "), 422);
  }

  if (error instanceof Error) {
    if (error.message.includes("Unique constraint failed")) {
      return jsonError("A unique field already exists.", 409);
    }
    return jsonError(error.message, 400);
  }

  return jsonError("Something went wrong.", 400);
}

export async function guardAdminRequest(request: Request) {
  const result = await requireAdminRequest(request);
  if (result.ok) return null;
  return jsonError(result.message, result.status);
}
