import { ImageResponse } from "next/og";

import { squarePngDataUrl } from "@/lib/og-image";
import { prisma } from "@/lib/prisma";

export const alt = "Old Siege: Challengers League";
export const size = {
  width: 1200,
  height: 630
};
export const contentType = "image/png";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function statLabel(value: number, label: string) {
  return `${value.toLocaleString("en-GB")} ${label}`;
}

export default async function Image() {
  const [players, teams, matches, logo] = await Promise.all([
    prisma.player.count(),
    prisma.team.count(),
    prisma.match.count({ where: { status: "COMPLETED" } }),
    squarePngDataUrl("/league-logos/OSCL.png", 420)
  ]);

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
            background: "radial-gradient(circle at 78% 40%, rgba(182, 255, 46, 0.22), transparent 38%), linear-gradient(135deg, #050605 0%, #0b1206 55%, #15230a 100%)"
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage:
              "linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(0deg, rgba(255,255,255,0.035) 1px, transparent 1px)",
            backgroundSize: "46px 46px"
          }}
        />
        <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 14, background: "#b6ff2e" }} />

        <div style={{ position: "relative", display: "flex", width: "100%", alignItems: "center", padding: "60px 70px 60px 90px", gap: 40 }}>
          <div style={{ display: "flex", flex: 1, flexDirection: "column", justifyContent: "space-between", height: "100%" }}>
            <div style={{ display: "flex", color: "#d6ff8a", fontSize: 26, fontWeight: 800, letterSpacing: 4, textTransform: "uppercase" }}>
              Rainbow Six Siege · OSCL
            </div>

            <div style={{ display: "flex", flexDirection: "column" }}>
              <div style={{ display: "flex", color: "#f1f5ec", fontSize: 58, fontWeight: 900, lineHeight: 1, textTransform: "uppercase" }}>Old Siege:</div>
              <div style={{ display: "flex", color: "#b6ff2e", fontSize: 92, fontWeight: 900, lineHeight: 0.95, textTransform: "uppercase" }}>Challengers</div>
              <div style={{ display: "flex", color: "#f1f5ec", fontSize: 92, fontWeight: 900, lineHeight: 0.95, textTransform: "uppercase" }}>League</div>
            </div>

            <div style={{ display: "flex", gap: 14 }}>
              {[statLabel(players, "players"), statLabel(teams, "teams"), statLabel(matches, "matches")].map((item) => (
                <div
                  key={item}
                  style={{
                    display: "flex",
                    border: "1px solid rgba(182,255,46,0.3)",
                    background: "rgba(5,6,5,0.75)",
                    padding: "14px 20px",
                    color: "#f1f5ec",
                    fontSize: 24,
                    fontWeight: 900
                  }}
                >
                  {item}
                </div>
              ))}
            </div>
          </div>

          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logo} alt="" width={380} height={380} style={{ width: 380, height: 380, objectFit: "contain" }} />
          ) : null}
        </div>
      </div>
    ),
    size
  );
}
