import type { Metadata } from "next";
import type { CSSProperties } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Crown, Sparkles } from "lucide-react";
import { TransferRequestStatus } from "@prisma/client";

import { PlayerAiOverview } from "@/components/PlayerAiOverview";
import { RankBadge } from "@/components/RankBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatCard } from "@/components/ui/StatCard";
import { Tabs } from "@/components/ui/Tabs";
import { TeamLogo } from "@/components/ui/TeamLogo";
import { avatarFallback, formatDate, formatDateTime, formatDecimal, formatKdDiff, formatPercent, getFlagEmoji } from "@/lib/format";
import { getMatchTitle } from "@/lib/match-utils";
import { getAuthSession } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { calculatePlayerRank } from "@/lib/ranks";
import { calculateAggregateStats } from "@/lib/stats";
import { toggleFavoritePlayerAction } from "@/lib/viewer-actions";

export const dynamic = "force-dynamic";

function getAge(value?: Date | null) {
  if (!value) return null;
  const today = new Date();
  let age = today.getFullYear() - value.getFullYear();
  const monthDiff = today.getMonth() - value.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < value.getDate())) age -= 1;
  return age;
}

function socialLabel(url: string) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    const first = host.split(".")[0] || "Link";
    return first.charAt(0).toUpperCase() + first.slice(1);
  } catch {
    return "Link";
  }
}

function heroAccent(color?: string | null) {
  if (!color || !/^#[0-9a-f]{6}$/i.test(color)) return undefined;
  const value = color.replace("#", "");
  return { "--hero-accent-rgb": `${parseInt(value.slice(0, 2), 16)}, ${parseInt(value.slice(2, 4), 16)}, ${parseInt(value.slice(4, 6), 16)}` } as CSSProperties;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const player = await prisma.player.findUnique({
    where: { slug },
    include: { currentTeam: true, stats: true }
  });

  if (!player) return { title: "Player" };

  const aggregate = calculateAggregateStats(player.stats);
  const team = player.currentTeam?.name || "Free agent";
  const description = `${team}. ${aggregate.maps} maps, ${formatDecimal(aggregate.rating)} rating, ${aggregate.kills}/${aggregate.deaths}/${aggregate.assists} K/D/A.`;
  const imageUrl = `/players/${player.slug}/opengraph-image?v=${player.updatedAt.getTime()}`;

  return {
    title: player.displayName,
    description,
    openGraph: {
      type: "profile",
      title: `${player.displayName} | OSCL`,
      description,
      url: `/players/${player.slug}`,
      images: [{ url: imageUrl, width: 1200, height: 630, type: "image/png", alt: `${player.displayName} player card` }]
    },
    twitter: {
      card: "summary_large_image",
      title: `${player.displayName} | OSCL`,
      description,
      images: [imageUrl]
    }
  };
}

export default async function PlayerProfilePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const session = await getAuthSession();
  const player = await prisma.player.findUnique({
    where: { slug },
    include: {
      currentTeam: true,
      memberships: {
        include: { team: true },
        orderBy: [{ isCurrent: "desc" }, { startDate: "desc" }]
      },
      stats: {
        include: {
          tournament: true,
          match: { include: { teamA: true, teamB: true, league: true } },
          mapGame: true,
          team: true
        },
        orderBy: { updatedAt: "desc" }
      },
      bans: {
        orderBy: [{ liftedAt: "asc" }, { createdAt: "desc" }]
      },
      keyMoments: {
        include: { match: { include: { teamA: true, teamB: true } } },
        orderBy: { createdAt: "desc" },
        take: 20
      },
      playerOfWeeks: {
        orderBy: { weekStart: "desc" }
      },
      transferEvents: {
        include: { team: true },
        orderBy: { createdAt: "desc" },
        take: 20
      },
      transferRequests: {
        where: { status: TransferRequestStatus.PENDING },
        include: { team: true },
        orderBy: { createdAt: "desc" }
      }
    }
  });

  if (!player) notFound();

  const aggregate = calculateAggregateStats(player.stats);
  const rank = calculatePlayerRank(player.stats);
  const favorite = session?.user?.id
    ? await prisma.favoritePlayer.findUnique({
        where: { userId_playerId: { userId: session.user.id, playerId: player.id } }
      })
    : null;

  type StatRow = (typeof player.stats)[number];

  const tournamentRows = Array.from(
    player.stats.reduce((map, stat) => {
      if (!stat.tournamentId || !stat.tournament) return map;
      const existing = map.get(stat.tournamentId) || { tournament: stat.tournament, entries: [] as StatRow[] };
      existing.entries.push(stat);
      map.set(stat.tournamentId, existing);
      return map;
    }, new Map<string, { tournament: NonNullable<StatRow["tournament"]>; entries: StatRow[] }>())
  ).map(([, value]) => ({ tournament: value.tournament, aggregate: calculateAggregateStats(value.entries) }));

  const matchRows = Array.from(
    player.stats.reduce((map, stat) => {
      const existing = map.get(stat.matchId) || { match: stat.match, entries: [] as StatRow[] };
      existing.entries.push(stat);
      map.set(stat.matchId, existing);
      return map;
    }, new Map<string, { match: StatRow["match"]; entries: StatRow[] }>())
  )
    .map(([matchId, value]) => {
      const side = value.entries.find((entry) => entry.side)?.side || null;
      return {
        matchId,
        match: value.match,
        side,
        result: side && value.match.winnerSide ? (side === value.match.winnerSide ? "W" : "L") : null,
        maps: value.entries.map((entry) => entry.mapGame.mapName),
        aggregate: calculateAggregateStats(value.entries)
      };
    })
    .sort((a, b) => Number(b.match.playedAt || 0) - Number(a.match.playedAt || 0));

  const favoriteAction = toggleFavoritePlayerAction.bind(null, player.id, player.slug);
  const age = getAge(player.dateOfBirth);
  const activeBans = player.bans.filter((ban) => !ban.liftedAt);
  const previousBans = player.bans.filter((ban) => ban.liftedAt);
  const latestAward = player.playerOfWeeks.find((award) => award.weekStart <= new Date());
  const recentForm = matchRows.slice(0, 5);
  const wins = matchRows.filter((row) => row.result === "W").length;
  const decided = matchRows.filter((row) => row.result).length;

  const overview = (
    <div className="grid gap-6">
      <section className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <div>
          <div className="section-heading">
            <h2 className="inline-flex items-center gap-2">
              <Sparkles size={18} className="text-metal-accent" />
              Key Moments
            </h2>
          </div>
          {player.keyMoments.length ? (
            <div className="moment-feed">
              {player.keyMoments.map((moment) => (
                <Link key={moment.id} href={`/matches/${moment.matchId}`} className="moment-card" style={{ gridTemplateColumns: "1fr" }}>
                  <div>
                    <strong>{moment.text}</strong>
                    <span>
                      {getMatchTitle(moment.match)} · {formatDate(moment.match.playedAt || moment.createdAt)}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <EmptyState message="No key moments logged yet." />
          )}
        </div>

        <div className="grid content-start gap-4">
          <div>
            <div className="section-heading">
              <h2>Recent Form</h2>
              {decided ? (
                <span className="label">
                  {wins}-{decided - wins} record
                </span>
              ) : null}
            </div>
            {recentForm.length ? (
              <div className="grid gap-2">
                {recentForm.map((row) => (
                  <Link key={row.matchId} href={`/matches/${row.matchId}`} className="feed-row">
                    <span>
                      {row.result ? <b className={row.result === "W" ? "mr-2 text-metal-accent" : "mr-2 text-red-400"}>{row.result}</b> : null}
                      {getMatchTitle(row.match)}
                    </span>
                    <strong>
                      {row.aggregate.kills}/{row.aggregate.deaths}/{row.aggregate.assists}
                    </strong>
                    <em>{formatDecimal(row.aggregate.rating)}</em>
                  </Link>
                ))}
              </div>
            ) : (
              <EmptyState message="No matches logged yet." />
            )}
          </div>

          {player.playerOfWeeks.length ? (
            <div>
              <div className="section-heading">
                <h2 className="inline-flex items-center gap-2">
                  <Crown size={18} className="text-metal-accent" />
                  Player of the Week
                </h2>
              </div>
              <div className="grid gap-2">
                {player.playerOfWeeks.map((award) => (
                  <div key={award.id} className="subtle-panel p-3">
                    <p className="font-black text-metal-text">{award.title || "Player of the Week"}</p>
                    <p className="label mt-1">Week of {formatDate(award.weekStart)}</p>
                    {award.note ? <p className="mt-2 text-sm font-semibold text-metal-muted">{award.note}</p> : null}
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </section>

      <PlayerAiOverview playerName={player.displayName} playerSlug={player.slug} />
    </div>
  );

  const matchesTab = (
    <div className="table-scroll">
      <table className="wiki-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Match</th>
            <th>Result</th>
            <th>Maps</th>
            <th className="numeric">K/D/A</th>
            <th className="numeric">HS%</th>
            <th className="numeric">Rating</th>
          </tr>
        </thead>
        <tbody>
          {matchRows.length ? (
            matchRows.map((row) => {
              const playerTeam = row.side === "A" ? row.match.teamA : row.side === "B" ? row.match.teamB : null;
              return (
                <tr key={row.matchId}>
                  <td className="whitespace-nowrap">{formatDate(row.match.playedAt)}</td>
                  <td>
                    <Link href={`/matches/${row.matchId}`} className="inline-flex items-center gap-2 font-bold text-metal-link hover:text-metal-accent">
                      <TeamLogo team={playerTeam} />
                      {getMatchTitle(row.match)}
                    </Link>
                    <span className="ml-2">{row.match.matchKind === "LEAGUE" ? <span className="league-pill">League</span> : <span className="fun-pill">Fun</span>}</span>
                  </td>
                  <td className={row.result === "W" ? "font-black text-metal-accent" : row.result === "L" ? "font-black text-red-400" : "text-metal-muted"}>
                    {row.result === "W" ? "Win" : row.result === "L" ? "Loss" : "-"} {row.match.scoreA}-{row.match.scoreB}
                  </td>
                  <td className="text-metal-muted">{row.maps.join(", ")}</td>
                  <td className="numeric">
                    {row.aggregate.kills}/{row.aggregate.deaths}/{row.aggregate.assists}
                  </td>
                  <td className="numeric">{formatPercent(row.aggregate.hsPercent)}</td>
                  <td className="numeric font-black text-metal-text">{formatDecimal(row.aggregate.rating)}</td>
                </tr>
              );
            })
          ) : (
            <tr>
              <td colSpan={7} className="text-metal-muted">
                No match history yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );

  const tournamentsTab = (
    <div className="table-scroll">
      <table className="wiki-table">
        <thead>
          <tr>
            <th>Tournament</th>
            <th className="numeric">Maps</th>
            <th className="numeric">Rating</th>
            <th className="numeric">K/D</th>
            <th className="numeric">K-D</th>
            <th className="numeric">HS%</th>
          </tr>
        </thead>
        <tbody>
          {tournamentRows.length ? (
            tournamentRows.map((row) => (
              <tr key={row.tournament.id}>
                <td>
                  <Link href={`/tournaments/${row.tournament.slug}`} className="font-bold text-metal-link hover:text-metal-accent">
                    {row.tournament.name}
                  </Link>
                </td>
                <td className="numeric">{row.aggregate.maps}</td>
                <td className="numeric font-black text-metal-text">{formatDecimal(row.aggregate.rating)}</td>
                <td className="numeric">{formatDecimal(row.aggregate.kd)}</td>
                <td className="numeric">
                  {row.aggregate.kills}-{row.aggregate.deaths}
                </td>
                <td className="numeric">{formatPercent(row.aggregate.hsPercent)}</td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={6} className="text-metal-muted">
                No tournament history yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );

  const careerTab = (
    <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
      <div className="grid content-start gap-5">
        <div>
          <div className="section-heading">
            <h2>Team History</h2>
          </div>
          <div className="grid gap-2">
            {player.transferRequests.map((request) => (
              <div key={request.id} className="feed-row" style={{ gridTemplateColumns: "minmax(0,1fr) auto" }}>
                <span>
                  <Link href={`/teams/${request.team.slug}`} className="text-metal-accent">
                    {request.team.name}
                  </Link>{" "}
                  are looking to sign {player.displayName}
                </span>
                <em>Pending · {formatDate(request.createdAt)}</em>
              </div>
            ))}
            {player.memberships.length ? (
              player.memberships.map((membership) => (
                <Link key={membership.id} href={`/teams/${membership.team.slug}`} className="feed-row" style={{ gridTemplateColumns: "minmax(0,1fr) auto" }}>
                  <span className="inline-flex items-center gap-2">
                    <TeamLogo team={membership.team} />
                    {membership.team.name}
                    {membership.isCurrent ? <span className="league-pill">Current</span> : null}
                  </span>
                  <em>
                    {membership.startDate ? formatDate(membership.startDate) : "?"} - {membership.isCurrent ? "now" : membership.endDate ? formatDate(membership.endDate) : "?"}
                  </em>
                </Link>
              ))
            ) : !player.transferRequests.length ? (
              <EmptyState message="No team history recorded." />
            ) : null}
          </div>
        </div>

        {player.transferEvents.length ? (
          <div>
            <div className="section-heading">
              <h2>Transfers</h2>
            </div>
            <div className="grid gap-2">
              {player.transferEvents.map((event) => (
                <div key={event.id} className="feed-row" style={{ gridTemplateColumns: "minmax(0,1fr) auto" }}>
                  <span>
                    {event.type === "JOINED" ? "Joined" : event.type === "LEFT" ? "Left" : "Benched on"}{" "}
                    <Link href={`/teams/${event.team.slug}`} className="text-metal-link hover:text-metal-accent">
                      {event.team.name}
                    </Link>
                  </span>
                  <em>{formatDateTime(event.createdAt)}</em>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div>
          <div className="section-heading">
            <h2>Career Totals</h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <StatCard label="Kills" value={aggregate.kills} />
            <StatCard label="Deaths" value={aggregate.deaths} />
            <StatCard label="Assists" value={aggregate.assists} />
            <StatCard label="Headshots" value={aggregate.headshots} helper={formatPercent(aggregate.hsPercent)} />
            <StatCard label="Rounds" value={aggregate.rounds} />
            <StatCard label="KD +/-" value={formatKdDiff(aggregate.kdDiff)} />
          </div>
        </div>
      </div>

      <aside className="panel h-fit overflow-hidden">
        <div className="border-b border-metal-line px-4 py-3 font-black">Player information</div>
        <dl className="info-list">
          <div>
            <dt>Name</dt>
            <dd>{player.realName || "-"}</dd>
          </div>
          <div>
            <dt>Nationality</dt>
            <dd>{player.nationality ? `${getFlagEmoji(player.nationality)} ${player.nationality}` : "-"}</dd>
          </div>
          <div>
            <dt>Born</dt>
            <dd>{player.dateOfBirth ? `${formatDate(player.dateOfBirth)}${age !== null ? ` (${age})` : ""}` : "-"}</dd>
          </div>
          <div>
            <dt>Role</dt>
            <dd>{player.role || "-"}</dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd>{player.status || "Active"}</dd>
          </div>
          <div>
            <dt>Discord</dt>
            <dd>{player.discordUsername || "-"}</dd>
          </div>
          <div>
            <dt>Aliases</dt>
            <dd>{player.aliases.length ? player.aliases.join(", ") : "-"}</dd>
          </div>
        </dl>
        {player.socialLinks.length ? (
          <div className="border-t border-metal-line p-4">
            <p className="label mb-2">Links</p>
            <div className="flex flex-wrap gap-2">
              {player.socialLinks.map((url) => (
                <a key={url} href={url} target="_blank" rel="noreferrer" className="button">
                  {socialLabel(url)}
                </a>
              ))}
            </div>
          </div>
        ) : null}
      </aside>
    </div>
  );

  return (
    <main className="page-shell grid gap-5">
      {activeBans.length ? (
        <section className="player-ban-panel">
          <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="label text-white">Active ban</p>
              <h2 className="mt-1 text-2xl font-black text-white">{activeBans.length === 1 ? `${player.displayName} is banned` : `${activeBans.length} active bans`}</h2>
            </div>
          </div>
          <div className="mt-4 grid gap-3">
            {activeBans.map((ban) => (
              <div key={ban.id} className="rounded-md border border-white/25 bg-black/20 p-3">
                <p className="text-sm font-black uppercase text-white">Match: {ban.matchText}</p>
                <p className="mt-2 font-semibold leading-6 text-white">{ban.reason}</p>
                <p className="mt-2 text-xs font-bold uppercase text-white/80">
                  Issued {formatDateTime(ban.createdAt)}
                  {ban.issuedBy ? ` by ${ban.issuedBy}` : ""}
                </p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="player-hero" style={heroAccent(player.currentTeam?.themeColor)}>
        <div className="player-hero-avatar">
          {avatarFallback(player.displayName)}
          {player.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img alt="" src={player.avatarUrl} />
          ) : null}
        </div>
        <div className="min-w-0">
          <p className="eyebrow">{player.role || "Player"}</p>
          <h1>{player.displayName}</h1>
          {player.realName ? <p className="mt-1 text-lg font-semibold text-metal-muted">{player.realName}</p> : null}
          <div className="player-hero-meta">
            <RankBadge rank={rank} />
            {player.currentTeam ? (
              <Link href={`/teams/${player.currentTeam.slug}`} className="inline-flex items-center gap-2">
                <TeamLogo team={player.currentTeam} />
                {player.currentTeam.name}
              </Link>
            ) : (
              <span>Free agent</span>
            )}
            {player.nationality ? (
              <span>
                {getFlagEmoji(player.nationality)} {player.nationality}
              </span>
            ) : null}
          </div>
        </div>
        <div className="player-hero-side">
          {latestAward ? (
            <div className="potw-ribbon">
              <Crown size={20} />
              <div>
                <strong>{latestAward.title || "Player of the Week"}</strong>
                <span className="block text-xs">Week of {formatDate(latestAward.weekStart)}</span>
              </div>
            </div>
          ) : null}
          <form action={favoriteAction}>
            <button className="button" type="submit">
              {favorite ? "Remove from watchlist" : "Add to watchlist"}
            </button>
          </form>
        </div>
      </section>

      {previousBans.length ? (
        <section className="player-previous-ban-panel">
          <p className="label text-white">Previous bans</p>
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            {previousBans.map((ban) => (
              <div key={ban.id} className="rounded-md border border-white/15 bg-black/20 p-3 text-white">
                <p className="text-sm font-black uppercase">Match: {ban.matchText}</p>
                <p className="mt-1 text-sm font-semibold">{ban.reason}</p>
                <p className="mt-2 text-xs font-bold uppercase text-white/75">
                  Issued {formatDate(ban.createdAt)}
                  {ban.liftedAt ? ` · Lifted ${formatDate(ban.liftedAt)}` : ""}
                </p>
                {ban.liftReason ? <p className="mt-1 text-xs font-bold text-white/75">Lift note: {ban.liftReason}</p> : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard label="Rating" value={formatDecimal(aggregate.rating)} accent />
        <StatCard label="MMR" value={rank.mmr} helper={rank.nextRank ? `${rank.nextMmr! - rank.mmr} to ${rank.nextRank}` : rank.name} />
        <StatCard label="K/D" value={formatDecimal(aggregate.kd)} helper={formatKdDiff(aggregate.kdDiff)} />
        <StatCard label="K/D/A" value={`${aggregate.kills}/${aggregate.deaths}/${aggregate.assists}`} />
        <StatCard label="Maps" value={aggregate.maps} helper={`${matchRows.length} matches`} />
        <StatCard label="HS%" value={formatPercent(aggregate.hsPercent)} />
      </section>

      {player.notes ? <p className="max-w-3xl leading-7 text-metal-muted">{player.notes}</p> : null}

      <Tabs
        tabs={[
          { id: "overview", label: "Overview", content: overview },
          { id: "matches", label: "Matches", count: matchRows.length, content: matchesTab },
          { id: "tournaments", label: "Tournaments", count: tournamentRows.length, content: tournamentsTab },
          { id: "career", label: "Career", content: careerTab }
        ]}
      />
    </main>
  );
}
