import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const image = await prisma.uploadedImage.findUnique({ where: { id } });

  if (!image) {
    return new Response("Not found", { status: 404 });
  }

  return new Response(new Uint8Array(image.data), {
    headers: {
      "content-type": image.contentType,
      // Every upload gets a fresh id, so a given URL never changes content.
      "cache-control": "public, max-age=31536000, immutable"
    }
  });
}
