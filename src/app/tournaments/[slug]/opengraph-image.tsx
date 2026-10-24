import { ImageResponse } from "next/og";
import { notFound } from "next/navigation";

import { formatDate, formatDecimal } from "@/lib/format";
import { pngDataUrl, squarePngDataUrl } from "@/lib/og-image";
import { prisma } from "@/lib/prisma";
import { calculateAggregateStats } from "@/lib/stats";

export const runtime = "nodejs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function TournamentOpenGraphImage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const tournament = await prisma.tournament.findUnique({
    where: { slug },
    include: {
      tournamentTeams: true,
      mvpPlayer: true,
      stats: true
    }
  });

  if (!tournament) notFound();
  const aggregate = calculateAggregateStats(tournament.stats);
  const logoUrl = await squarePngDataUrl(tournament.logoUrl, 512);
  const bannerUrl = await pngDataUrl(tournament.bannerUrl, 1200, 630, "cover");

  return new ImageResponse(
    (
      <div
        style={{
          width: "1200px",
          height: "630px",
          display: "flex",
          background: "#050605",
          color: "#f8fafc",
          fontFamily: "Arial",
          position: "relative",
          overflow: "hidden"
        }}
      >
        {bannerUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={bannerUrl} alt="" width="1200" height="630" style={{ position: "absolute", inset: 0, width: "1200px", height: "630px", objectFit: "cover", opacity: 0.22 }} />
        ) : null}
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(135deg, rgba(24, 38, 8, .96) 0%, rgba(8, 9, 11, .98) 54%, rgba(182, 255, 46, .26) 100%)" }} />
        <div style={{ position: "absolute", left: 0, top: 0, width: "100%", height: "18px", background: "#b6ff2e" }} />
        <div style={{ display: "flex", width: "100%", padding: "66px", gap: "42px", position: "relative", alignItems: "center" }}>
          <div style={{ width: "230px", height: "230px", display: "flex", alignItems: "center", justifyContent: "center", background: "#0e110c", border: "2px solid #2e3829" }}>
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt="" style={{ maxWidth: "190px", maxHeight: "190px", objectFit: "contain" }} />
            ) : (
              <div style={{ fontSize: "80px", fontWeight: 900, display: "flex" }}>TT</div>
            )}
          </div>
          <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
            <div style={{ color: "#b6ff2e", fontSize: "28px", fontWeight: 900, textTransform: "uppercase", display: "flex" }}>Tournament</div>
            <div style={{ fontSize: "74px", fontWeight: 900, lineHeight: 1.02, display: "flex" }}>{tournament.name}</div>
            <div style={{ marginTop: "22px", color: "#cbd5e1", fontSize: "28px", display: "flex" }}>
              {`${formatDate(tournament.startDate)} ${tournament.endDate ? `- ${formatDate(tournament.endDate)}` : ""} | ${tournament.prizePool || "Prize pool TBD"}`}
            </div>
            <div style={{ display: "flex", gap: "18px", marginTop: "38px" }}>
              {[
                ["Teams", tournament.tournamentTeams.length],
                ["Maps", aggregate.maps],
                ["Avg Rating", formatDecimal(aggregate.rating)],
                ["MVP", tournament.mvpPlayer?.displayName || "TBD"]
              ].map(([label, value]) => (
                <div key={label} style={{ minWidth: "150px", background: "#0e110c", border: "1px solid #2e3829", padding: "18px", display: "flex", flexDirection: "column" }}>
                  <div style={{ color: "#94a3b8", fontSize: "18px", fontWeight: 900, display: "flex" }}>{label}</div>
                  <div style={{ marginTop: "6px", fontSize: typeof value === "string" && value.length > 10 ? "24px" : "34px", fontWeight: 900, display: "flex" }}>{value}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    ),
    size
  );
}
