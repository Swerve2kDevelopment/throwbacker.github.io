import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function getAuthSession() {
  return getServerSession(authOptions);
}

export async function isDiscordIdApprovedAdmin(discordId?: string | null) {
  if (!discordId) return false;

  const admin = await prisma.adminUser.findUnique({
    where: { discordId },
    select: { id: true }
  });

  return Boolean(admin);
}

export async function isCurrentUserAdmin() {
  const session = await getAuthSession();
  if (!session?.user) return false;
  if (session.user.role === "ADMIN" || session.user.isAdmin) return true;
  return isDiscordIdApprovedAdmin(session.user.discordId);
}

export async function assertAdminUser() {
  const session = await getAuthSession();

  if (!session?.user) {
    redirect("/login?callbackUrl=/admin");
  }

  const isAdmin =
    session.user.role === "ADMIN" ||
    session.user.isAdmin ||
    (await isDiscordIdApprovedAdmin(session.user.discordId));

  if (!isAdmin) {
    redirect("/account?admin=denied");
  }

  return session;
}

export async function requireAdminRequest(request: Request) {
  const expectedKey = process.env.BOT_API_KEY;
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.match(/^Bearer\s+(.+)$/i)?.[1];

  if (expectedKey && token && token === expectedKey) {
    return { ok: true as const, actor: "bot" as const };
  }

  const session = await getAuthSession();

  if (!session?.user) {
    return {
      ok: false as const,
      status: 401,
      message: "Authentication required."
    };
  }

  const isAdmin =
    session.user.role === "ADMIN" ||
    session.user.isAdmin ||
    (await isDiscordIdApprovedAdmin(session.user.discordId));

  if (!isAdmin) {
    return {
      ok: false as const,
      status: 403,
      message: "Admin access required."
    };
  }

  return { ok: true as const, actor: "admin" as const, session };
}
