import { ImageResponse } from "next/og";

import { getGameNewsArticle } from "@/lib/game-news";
import { squarePngDataUrl } from "@/lib/og-image";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// The game draws images at their native size, and its news image area is about this big.
const size = { width: 720, height: 256 };

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [article, logo] = await Promise.all([getGameNewsArticle(decodeURIComponent(id).replace(/\.png$/, "")), squarePngDataUrl("/league-logos/OSCL.png", 170)]);

  if (!article) {
    return new Response("Not found", { status: 404 });
  }

  return new ImageResponse(
    (
      <div
        style={{
          position: "relative",
          display: "flex",
          height: "100%",
          width: "100%",
          overflow: "hidden",
          alignItems: "center",
          padding: "20px 36px 20px 42px",
          gap: 20,
          background: "linear-gradient(135deg, #050605 0%, #0b1206 55%, #15230a 100%)",
          color: "#fff",
          fontFamily: "Arial, Helvetica, sans-serif"
        }}
      >
        <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 8, background: "#b6ff2e" }} />
        <div style={{ display: "flex", flex: 1, flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", color: "#d6ff8a", fontSize: 16, fontWeight: 800, letterSpacing: 2, textTransform: "uppercase" }}>{article.eyebrow}</div>
          <div style={{ display: "flex", color: "#f1f5ec", fontSize: article.headline.length > 28 ? 30 : 40, fontWeight: 900, lineHeight: 1.05 }}>{article.headline}</div>
        </div>
        {logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logo} alt="" width={150} height={150} style={{ width: 150, height: 150, objectFit: "contain" }} />
        ) : null}
      </div>
    ),
    {
      ...size,
      headers: { "cache-control": "public, max-age=300, stale-while-revalidate=3600" }
    }
  );
}
