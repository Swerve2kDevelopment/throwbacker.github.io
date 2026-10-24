import { ImageResponse } from "next/og";
import { notFound } from "next/navigation";

import { avatarFallback, formatDecimal, formatKdDiff, formatPercent } from "@/lib/format";
import { pngDataUrl } from "@/lib/og-image";
import { prisma } from "@/lib/prisma";
import { calculateAggregateStats } from "@/lib/stats";

export const alt = "Player profile";
export const size = {
  width: 1200,
  height: 630
};
export const contentType = "image/png";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function infoText({
  team,
  nationality,
  maps,
  kdDiff
}: {
  team?: string | null;
  nationality?: string | null;
  maps: number;
  kdDiff: number;
}) {
  const teamText = team ? `Current team: ${team}` : "Free agent";
  const nationalityText = nationality ? `Nationality: ${nationality}` : "Nationality not set";
  const mapsText = maps ? `${maps} maps logged` : "No official maps logged yet";
  return `${teamText} | ${nationalityText} | ${mapsText} | KD +/- ${formatKdDiff(kdDiff)}`;
}

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const player = await prisma.player.findUnique({
    where: { slug },
    include: {
      currentTeam: true,
      stats: true
    }
  });

  if (!player) notFound();

  const aggregate = calculateAggregateStats(player.stats);
  const avatarUrl = await pngDataUrl(player.avatarUrl, 720, 720, "cover");
  const teamName = player.currentTeam?.tag || player.currentTeam?.name || null;
  const subtitle = infoText({
    team: teamName,
    nationality: player.nationality,
    maps: aggregate.maps,
    kdDiff: aggregate.kdDiff
  });

  return new ImageResponse(
    (
      <div
        style={{
          position: "relative",
          display: "flex",
          height: "100%",
          width: "100%",
          overflow: "hidden",
          background: "#050605",
          color: "#fff",
          fontFamily: "Arial, Helvetica, sans-serif"
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "radial-gradient(circle at 15% 15%, rgba(182, 255, 46, 0.30), transparent 30%), radial-gradient(circle at 90% 60%, rgba(80, 125, 15, 0.40), transparent 34%), linear-gradient(135deg, #060806 0%, #0f1806 48%, #1b2c09 100%)"
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage:
              "linear-gradient(90deg, rgba(255,255,255,0.045) 1px, transparent 1px), linear-gradient(0deg, rgba(255,255,255,0.04) 1px, transparent 1px)",
            backgroundSize: "42px 42px"
          }}
        />
        <div
          style={{
            position: "absolute",
            right: 0,
            top: 0,
            bottom: 0,
            width: 454,
            background: "linear-gradient(180deg, rgba(182,255,46,0.14), rgba(0,0,0,0.35))"
          }}
        />

        <div
          style={{
            position: "relative",
            display: "flex",
            width: "100%",
            padding: 54,
            gap: 44
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              flex: 1,
              minWidth: 0
            }}
          >
            <div style={{ display: "flex", flexDirection: "column" }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  color: "#d6ff8a",
                  fontSize: 26,
                  fontWeight: 900,
                  textTransform: "uppercase"
                }}
              >
                <span style={{ display: "flex", height: 15, width: 15, background: "#b6ff2e" }} />
                OSCL Player Card
              </div>
              <div
                style={{
                  display: "flex",
                  marginTop: 34,
                  color: "#fff",
                  fontSize: player.displayName.length > 15 ? 76 : 94,
                  fontWeight: 900,
                  lineHeight: 0.92,
                  textTransform: "uppercase",
                  textShadow: "0 12px 34px rgba(0,0,0,0.46)"
                }}
              >
                {player.displayName}
              </div>
              <div
                style={{
                  display: "flex",
                  maxWidth: 690,
                  marginTop: 22,
                  color: "#dfe8d4",
                  fontSize: 27,
                  fontWeight: 800,
                  lineHeight: 1.3
                }}
              >
                {subtitle}
              </div>
            </div>

            <div style={{ display: "flex", gap: 14 }}>
              {[
                ["Rating", formatDecimal(aggregate.rating)],
                ["K-D", `${aggregate.kills}-${aggregate.deaths}`],
                ["KD", formatDecimal(aggregate.kd)],
                ["HS%", formatPercent(aggregate.hsPercent)]
              ].map(([label, value]) => (
                <div
                  key={label}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    minWidth: 130,
                    border: "1px solid rgba(255,255,255,0.18)",
                    background: "rgba(8,8,12,0.74)",
                    padding: "16px 18px"
                  }}
                >
                  <span style={{ color: "#a9cf6c", fontSize: 18, fontWeight: 900, textTransform: "uppercase" }}>{label}</span>
                  <span style={{ marginTop: 6, color: "#fff", fontSize: 34, fontWeight: 900 }}>{value}</span>
                </div>
              ))}
            </div>
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              width: 360,
              border: "1px solid rgba(255,255,255,0.24)",
              background: "rgba(0,0,0,0.32)",
              boxShadow: "0 22px 60px rgba(0,0,0,0.4)"
            }}
          >
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt=""
                width={360}
                height={420}
                style={{
                  display: "flex",
                  width: 360,
                  height: 420,
                  objectFit: "cover"
                }}
              />
            ) : (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 360,
                  height: 420,
                  background: "linear-gradient(135deg, #141a10, #2a4210)",
                  color: "#fff",
                  fontSize: 118,
                  fontWeight: 900
                }}
              >
                {avatarFallback(player.displayName)}
              </div>
            )}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                padding: "22px 24px",
                background: "#0c100a"
              }}
            >
              <span style={{ color: "#b6ff2e", fontSize: 22, fontWeight: 900, textTransform: "uppercase" }}>
                {teamName || "Free Agent"}
              </span>
              <span style={{ marginTop: 8, color: "#eef5e6", fontSize: 22, fontWeight: 800 }}>
                {aggregate.kills.toLocaleString("en-GB")} kills | {aggregate.rounds.toLocaleString("en-GB")} rounds
              </span>
            </div>
          </div>
        </div>
      </div>
    ),
    size
  );
}
