import type { Metadata } from "next";

import { AiMatchHelperClient } from "@/components/admin/AiMatchHelperClient";
import { assertAdminUser } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "AI Match Helper"
};

export default async function AdminAiHelperPage() {
  await assertAdminUser();

  const [players, tournaments] = await Promise.all([
    prisma.player.findMany({
      orderBy: { displayName: "asc" },
      select: { id: true, displayName: true, aliases: true }
    }),
    prisma.tournament.findMany({
      orderBy: { startDate: "desc" },
      select: { id: true, name: true, status: true }
    })
  ]);

  return <AiMatchHelperClient players={players} tournaments={tournaments} />;
}
