import type { Metadata } from "next";
import type { CSSProperties } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { MatchCard } from "@/components/MatchCard";
import { PlayerCell } from "@/components/ui/Avatar";
import { formatDate, formatDateTime, formatDecimal, formatKdDiff, formatPercent, avatarFallback } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { calculateAggregateStats, calculateTeamSummary } from "@/lib/stats";

export const dynamic = "force-dynamic";

function safeThemeColor(value?: string | null) {
  return value && /^#[0-9a-f]{6}$/i.test(value) ? value : "#b6ff2e";
}

function hexToRgb(hex: string) {
  const normalized = hex.replace("#", "");
  return {
    r: parseInt(normalized.slice(0, 2), 16),
    g: parseInt(normalized.slice(2, 4), 16),
    b: parseInt(normalized.slice(4, 6), 16)
  };
}

function themedStyle(color: string) {
  const rgb = hexToRgb(color);
  return {
    "--team-accent": color,
    "--team-accent-rgb": `${rgb.r}, ${rgb.g}, ${rgb.b}`
  } as CSSProperties;
}

function PlayerPortrait({ player }: { player: { displayName: string; avatarUrl?: string | null } }) {
  return (
    <>
      <span>{avatarFallback(player.displayName)}</span>
      {player.avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img alt="" src={player.avatarUrl} />
      ) : null}
    </>
  );
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const team = await prisma.team.findUnique({
    where: { slug },
    select: { name: true, description: true, updatedAt: true }
  });

  if (!team) return { title: "Team" };
  const imageUrl = `/teams/${slug}/opengraph-image?v=${team.updatedAt.getTime()}`;

  return {
    title: team.name,
    description: team.description || `${team.name} roster, results and player stats in OSCL.`,
    openGraph: {
      title: `${team.name} | OSCL`,
      description: team.description || `${team.name} roster, results and player stats.`,
      url: `/teams/${slug}`,
      images: [{ url: imageUrl, width: 1200, height: 630, type: "image/png", alt: `${team.name} team profile` }]
    },
    twitter: {
      card: "summary_large_image",
      title: `${team.name} | OSCL`,
      description: team.description || `${team.name} roster, results and player stats.`,
      images: [imageUrl]
    }
  };
}

export default async function TeamProfilePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const team = await prisma.team.findUnique({
    where: { slug },
    include: {
      currentPlayers: {
        include: {
          stats: { include: { match: { select: { winnerSide: true } }, mapGame: { select: { winnerSide: true } } } }
        },
        orderBy: { displayName: "asc" }
      },
      memberships: {
        include: { player: true },
        orderBy: [{ isCurrent: "desc" }, { startDate: "desc" }]
      },
      recruitmentPosts: {
        where: { closedAt: null },
        orderBy: { createdAt: "desc" }
      },
      tournamentTeams: {
        include: { tournament: true },
        orderBy: { finalPlacement: "asc" }
      },
      teamAMatches: {
        include: { teamA: true, teamB: true, tournament: true, league: true, maps: { orderBy: { order: "asc" } }, participants: true },
        orderBy: { playedAt: "desc" }
      },
      teamBMatches: {
        include: { teamA: true, teamB: true, tournament: true, league: true, maps: { orderBy: { order: "asc" } }, participants: true },
        orderBy: { playedAt: "desc" }
      }
    }
  });

  if (!team) notFound();

  const formerPlayers = team.memberships
    .filter((membership) => !membership.isCurrent)
    .map((membership) => membership.player)
    .filter((player, index, players) => players.findIndex((item) => item.id === player.id) === index);
  const allMatches = [...team.teamAMatches, ...team.teamBMatches].sort(
    (a, b) => Number(b.playedAt || b.createdAt) - Number(a.playedAt || a.createdAt)
  );
  const matches = allMatches.slice(0, 10);

  // Combined numbers come from every stat row the current roster has logged
  // plus every match the team played, not just tournament totals.
  const rosterStats = team.currentPlayers.flatMap((player) => player.stats);
  const aggregate = calculateTeamSummary(team.id, rosterStats, allMatches);
  const themeColor = safeThemeColor(team.themeColor);
  const playerSummary = team.currentPlayers
    .map(({ stats, ...player }) => ({
      player,
      aggregate: calculateAggregateStats(stats)
    }))
    // Players with maps logged first (best rating on top), then the rest by name.
    .sort(
      (a, b) =>
        Number(b.aggregate.maps > 0) - Number(a.aggregate.maps > 0) ||
        b.aggregate.rating - a.aggregate.rating ||
        b.aggregate.maps - a.aggregate.maps ||
        a.player.displayName.localeCompare(b.player.displayName)
    );

  return (
    <main className="page-shell">
      <section className="team-hero" style={themedStyle(themeColor)}>
        <div className="team-hero-backdrop" />
        <div className="team-hero-main">
          <div className="team-hero-logo">
            {team.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img alt="" src={team.logoUrl} />
            ) : (
              <span>{team.tag || team.name.slice(0, 2).toUpperCase()}</span>
            )}
          </div>
          <div className="min-w-0">
            <p className="label text-metal-text">Team profile</p>
            <h1>{team.name}</h1>
            <p className="team-hero-meta">
              {team.tag ? `${team.tag} - ` : ""}
              {team.region || "Region not set"} - {team.currentPlayers.length} active player{team.currentPlayers.length === 1 ? "" : "s"}
            </p>
            {team.description ? <p className="team-hero-description">{team.description}</p> : null}
          </div>
        </div>

        <div className="team-hero-stats">
          <div>
            <span>Rating</span>
            <strong>{formatDecimal(aggregate.rating)}</strong>
            <em>Roster average</em>
          </div>
          <div>
            <span>Maps played</span>
            <strong>{aggregate.mapsPlayed}</strong>
            <em>{aggregate.mapsWon} won</em>
          </div>
          <div>
            <span>K/D</span>
            <strong>{formatDecimal(aggregate.kd)}</strong>
            <em>
              {aggregate.kills}-{aggregate.deaths}
            </em>
          </div>
          <div>
            <span>Record</span>
            <strong>
              {aggregate.matchesWon}-{Math.max(0, aggregate.matchesPlayed - aggregate.matchesWon)}
            </strong>
            <em>{aggregate.matchesPlayed} matches</em>
          </div>
        </div>

        <div className="team-roster-strip" aria-label="Current roster">
          {playerSummary.length ? (
            playerSummary.slice(0, 8).map((row) => (
              <Link key={row.player.id} href={`/players/${row.player.slug}`} className="team-roster-card">
                <div className="team-roster-portrait">
                  <PlayerPortrait player={row.player} />
                </div>
                <strong>{row.player.displayName}</strong>
                <span>{row.player.realName || row.player.role || "Player"}</span>
                <em>{row.aggregate.maps ? `${formatDecimal(row.aggregate.rating)} rating` : "No maps yet"}</em>
              </Link>
            ))
          ) : (
            <div className="team-roster-empty">No active roster set.</div>
          )}
        </div>
      </section>

      {team.recruitmentPosts.length ? (
        <section className="recruit-banner mt-5" style={themedStyle(themeColor)}>
          <p className="eyebrow">Recruiting</p>
          <div className="mt-2 grid gap-2">
            {team.recruitmentPosts.map((post) => (
              <div key={post.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <strong className="text-lg text-metal-text">Looking for: {post.role || "any role"}</strong>
                {post.note ? <span className="font-semibold text-metal-muted">{post.note}</span> : null}
                <span className="label">since {formatDate(post.createdAt)}</span>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="mt-6 grid gap-6 lg:grid-cols-[1fr_320px]" style={themedStyle(themeColor)}>
        <div className="min-w-0">
          <section>
            <h2 className="mb-3 text-2xl font-black">Current Players</h2>
            <div className="table-scroll">
              <table className="wiki-table">
                <thead>
                  <tr>
                    <th>Player</th>
                    <th>Role</th>
                    <th className="numeric">Rating</th>
                    <th className="numeric">K/D</th>
                    <th className="numeric">K/D/A</th>
                    <th className="numeric">HS%</th>
                    <th className="numeric">Maps</th>
                  </tr>
                </thead>
                <tbody>
                  {playerSummary.length ? (
                    playerSummary.map((row) => (
                      <tr key={row.player.id}>
                        <td>
                          <PlayerCell player={row.player} />
                        </td>
                        <td className="text-metal-muted">{row.player.role || "-"}</td>
                        <td className="numeric font-black text-metal-text">{row.aggregate.maps ? formatDecimal(row.aggregate.rating) : "-"}</td>
                        <td className="numeric">
                          {row.aggregate.maps ? formatDecimal(row.aggregate.kd) : "-"} <span className="text-xs text-metal-muted">({formatKdDiff(row.aggregate.kdDiff)})</span>
                        </td>
                        <td className="numeric">
                          {row.aggregate.kills}/{row.aggregate.deaths}/{row.aggregate.assists}
                        </td>
                        <td className="numeric">{formatPercent(row.aggregate.hsPercent)}</td>
                        <td className="numeric">{row.aggregate.maps}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={7} className="text-metal-muted">
                        No current roster set.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="mt-6">
            <h2 className="mb-3 text-2xl font-black">Tournament Results</h2>
            <div className="table-scroll">
              <table className="wiki-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Tournament</th>
                    <th className="numeric">Placement</th>
                  </tr>
                </thead>
                <tbody>
                  {team.tournamentTeams.length ? (
                    team.tournamentTeams.map((entry) => (
                      <tr key={entry.id}>
                        <td>{formatDate(entry.tournament.endDate || entry.tournament.startDate)}</td>
                        <td>
                          <Link href={`/tournaments/${entry.tournament.slug}`} className="font-bold text-metal-link hover:text-metal-accent">
                            {entry.tournament.name}
                          </Link>
                        </td>
                        <td className="numeric">{entry.finalPlacement ? `${entry.finalPlacement}` : "-"}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={3} className="text-metal-muted">
                        No tournament results yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="mt-6">
            <h2 className="mb-3 text-2xl font-black">Match History</h2>
            <div className="grid gap-3">
              {matches.length ? matches.map((match) => <MatchCard key={match.id} match={match} />) : <div className="subtle-panel p-5 text-metal-muted">No matches recorded yet.</div>}
            </div>
          </section>
        </div>

        <aside className="panel h-fit overflow-hidden team-side-panel" style={themedStyle(themeColor)}>
          <div className="border-b border-metal-line px-4 py-3 text-center text-xl font-black">{team.tag || team.name}</div>
          {team.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img alt="" src={team.logoUrl} className="h-56 w-full object-contain bg-metal-row p-6" />
          ) : (
            <div className="flex h-56 items-center justify-center bg-metal-row text-5xl font-black">{team.tag || team.name.slice(0, 2).toUpperCase()}</div>
          )}
          <dl className="divide-y divide-metal-line text-sm">
            <div className="grid grid-cols-[110px_1fr] gap-2 px-4 py-3">
              <dt className="font-black text-metal-muted">Name</dt>
              <dd>{team.name}</dd>
            </div>
            <div className="grid grid-cols-[110px_1fr] gap-2 px-4 py-3">
              <dt className="font-black text-metal-muted">Tag</dt>
              <dd>{team.tag || "-"}</dd>
            </div>
            <div className="grid grid-cols-[110px_1fr] gap-2 px-4 py-3">
              <dt className="font-black text-metal-muted">Region</dt>
              <dd>{team.region || "-"}</dd>
            </div>
            <div className="grid grid-cols-[110px_1fr] gap-2 px-4 py-3">
              <dt className="font-black text-metal-muted">Theme</dt>
              <dd>
                <span className="inline-flex items-center gap-2">
                  <span className="h-3 w-3 border border-metal-line" style={{ background: themeColor }} />
                  {themeColor}
                </span>
              </dd>
            </div>
            <div className="grid grid-cols-[110px_1fr] gap-2 px-4 py-3">
              <dt className="font-black text-metal-muted">Updated</dt>
              <dd>{formatDateTime(team.updatedAt)}</dd>
            </div>
          </dl>
          <div className="border-t border-metal-line p-4">
            <p className="label mb-2">Former players</p>
            {formerPlayers.length ? (
              <div className="flex flex-wrap gap-2">
                {formerPlayers.map((player) => (
                  <Link key={player.id} href={`/players/${player.slug}`} className="border border-metal-line px-2 py-1 text-sm font-bold hover:border-metal-accent">
                    {player.displayName}
                  </Link>
                ))}
              </div>
            ) : (
              <p className="text-sm text-metal-muted">No former players recorded.</p>
            )}
          </div>
        </aside>
      </section>
    </main>
  );
}
