import { ImageResponse } from "next/og";
import { notFound } from "next/navigation";

import { formatDecimal } from "@/lib/format";
import { squarePngDataUrl } from "@/lib/og-image";
import { prisma } from "@/lib/prisma";
import { calculateTeamSummary } from "@/lib/stats";

export const runtime = "nodejs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function TeamOpenGraphImage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const team = await prisma.team.findUnique({
    where: { slug },
    include: {
      currentPlayers: { include: { stats: { include: { match: { select: { winnerSide: true } }, mapGame: { select: { winnerSide: true } } } } } },
      teamAMatches: { select: { id: true, teamAId: true, teamBId: true, winnerSide: true, winnerTeamId: true, maps: { select: { id: true, winnerSide: true, winnerTeamId: true } } } },
      teamBMatches: { select: { id: true, teamAId: true, teamBId: true, winnerSide: true, winnerTeamId: true, maps: { select: { id: true, winnerSide: true, winnerTeamId: true } } } }
    }
  });

  if (!team) notFound();
  const aggregate = calculateTeamSummary(
    team.id,
    team.currentPlayers.flatMap((player) => player.stats),
    [...team.teamAMatches, ...team.teamBMatches]
  );
  const logoUrl = await squarePngDataUrl(team.logoUrl, 512);

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
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(135deg, #132008 0%, #050605 52%, #1d300a 100%)" }} />
        <div style={{ position: "absolute", left: 0, top: 0, width: "100%", height: "18px", background: "#b6ff2e" }} />
        <div style={{ display: "flex", width: "100%", padding: "70px", gap: "48px", position: "relative", alignItems: "center" }}>
          <div style={{ width: "260px", height: "260px", display: "flex", alignItems: "center", justifyContent: "center", background: "#0e110c", border: "2px solid #2e3829" }}>
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt="" style={{ maxWidth: "220px", maxHeight: "220px", objectFit: "contain" }} />
            ) : (
              <div style={{ fontSize: "80px", fontWeight: 900 }}>{team.tag || team.name.slice(0, 2).toUpperCase()}</div>
            )}
          </div>
          <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
            <div style={{ color: "#b6ff2e", fontSize: "28px", fontWeight: 900, textTransform: "uppercase" }}>Team Profile</div>
            <div style={{ fontSize: "82px", fontWeight: 900, lineHeight: 1.02 }}>{team.name}</div>
            <div style={{ marginTop: "22px", color: "#cbd5e1", fontSize: "30px" }}>
              {[team.tag, team.region, `${team.currentPlayers.length} current players`].filter(Boolean).join(" | ")}
            </div>
            <div style={{ display: "flex", gap: "18px", marginTop: "42px" }}>
              {[
                ["Rating", formatDecimal(aggregate.rating)],
                ["Maps", aggregate.mapsPlayed],
                ["K/D", formatDecimal(aggregate.kd)],
                ["Record", `${aggregate.matchesWon}-${aggregate.matchesPlayed - aggregate.matchesWon}`]
              ].map(([label, value]) => (
                <div key={label} style={{ minWidth: "150px", background: "#0e110c", border: "1px solid #2e3829", padding: "18px", display: "flex", flexDirection: "column" }}>
                  <div style={{ color: "#94a3b8", fontSize: "18px", fontWeight: 900 }}>{label}</div>
                  <div style={{ marginTop: "6px", fontSize: "34px", fontWeight: 900 }}>{value}</div>
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
