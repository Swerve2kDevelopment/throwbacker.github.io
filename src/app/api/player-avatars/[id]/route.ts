import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const image = await prisma.playerAvatarImage.findUnique({ where: { playerId: id } });

  if (!image) {
    return new Response("Not found", { status: 404 });
  }

  return new Response(new Uint8Array(image.data), {
    headers: {
      "content-type": image.contentType,
      "cache-control": "public, max-age=86400, stale-while-revalidate=604800"
    }
  });
}
