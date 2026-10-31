import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { prisma } from "@/lib/prisma";
import { authenticateHost, ingestPayloadSchema, summarizePayload, unmatchedNames } from "@/lib/stats-ingest";

export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 64 * 1024;
const MAX_PENDING_PER_HOUR = 30;

function unauthorized() {
  return NextResponse.json({ error: "Missing, invalid or revoked host key." }, { status: 401 });
}

/** Lets a tracker check its key without sending a match. */
export async function GET(request: Request) {
  const hostKey = await authenticateHost(request);
  if (!hostKey) return unauthorized();
  return NextResponse.json({ ok: true, host: hostKey.label });
}

export async function POST(request: Request) {
  const hostKey = await authenticateHost(request);
  if (!hostKey) return unauthorized();

  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) return NextResponse.json({ error: "Payload too large." }, { status: 413 });

  const recent = await prisma.statsSubmission.count({
    where: { hostKeyId: hostKey.id, createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) } }
  });
  if (recent >= MAX_PENDING_PER_HOUR) return NextResponse.json({ error: "Too many uploads this hour." }, { status: 429 });

  let payload;
  try {
    payload = ingestPayloadSchema.parse(JSON.parse(text));
  } catch (error) {
    const detail = error instanceof ZodError ? error.issues.map((issue) => `${issue.path.join(".") || "body"}: ${issue.message}`) : ["Body must be JSON."];
    return NextResponse.json({ error: "Invalid payload.", detail }, { status: 400 });
  }

  const [submission, unmatched] = await Promise.all([
    prisma.statsSubmission.create({
      data: { hostKeyId: hostKey.id, payload: JSON.parse(JSON.stringify(payload)), summary: summarizePayload(payload) }
    }),
    unmatchedNames(payload),
    prisma.hostApiKey.update({ where: { id: hostKey.id }, data: { lastUsedAt: new Date() } })
  ]);

  return NextResponse.json({ id: submission.id, status: "pending_review", unmatched }, { status: 201 });
}
