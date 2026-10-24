import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { Activity, Crosshair, Skull, Swords, Target, Trophy, Zap } from "lucide-react";

import { RankBadge } from "@/components/RankBadge";
import { formatDecimal, formatKdDiff, formatPercent } from "@/lib/format";
import { getMatchTitle } from "@/lib/match-utils";
import { prisma } from "@/lib/prisma";
import { calculateAggregateStats, getPlayersWithAggregateStats, sortPlayersByMetric, type PlayerWithStats } from "@/lib/stats";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Records"
};

type MatchRecordRow = {
  player: {
    id: string;
    slug: string;
    displayName: string;
  };
  matchId: string;
  matchTitle: string;
  format: number;
  mapCount: number;
  value: number;
  secondary: string;
};

type RecordBoardProps = {
  title: string;
  icon: ReactNode;
  subtitle: string;
  rows: {
    id: string;
    player: {
      slug: string;
      displayName: string;
    };
    value: string | number;
    detail: string;
    href?: string;
    rank?: PlayerWithStats["rank"];
  }[];
  danger?: boolean;
};

function RecordBoard({ title, icon, subtitle, rows, danger }: RecordBoardProps) {
  return (
    <section className={danger ? "records-board records-board-danger" : "records-board"}>
      <div className="flex items-start justify-between gap-3 border-b border-metal-line pb-3">
        <div>
          <div className="flex items-center gap-2">
            {icon}
            <h2 className="text-xl font-black">{title}</h2>
          </div>
          <p className="mt-1 text-sm font-semibold text-metal-muted">{subtitle}</p>
        </div>
        <span className="label">Top 3</span>
      </div>
      <div className="mt-3 grid gap-2">
        {rows.length ? (
          rows.map((row, index) => (
            <Link key={row.id} href={row.href || `/players/${row.player.slug}`} className="record-row">
              <span className="record-place">{index + 1}</span>
              <span className="min-w-0">
                <span className="flex min-w-0 items-center gap-2">
                  {row.rank ? <RankBadge rank={row.rank} compact /> : null}
                  <span className="truncate font-black">{row.player.displayName}</span>
                </span>
                <span className="mt-1 block truncate text-xs font-bold text-metal-muted">{row.detail}</span>
              </span>
              <strong>{row.value}</strong>
            </Link>
          ))
        ) : (
          <div className="subtle-panel p-4 text-sm font-semibold text-metal-muted">No record data yet.</div>
        )}
      </div>
    </section>
  );
}

function playerRows(players: PlayerWithStats[], value: (player: PlayerWithStats) => string | number, detail: (player: PlayerWithStats) => string) {
  return players.slice(0, 3).map((player) => ({
    id: player.id,
    player,
    value: value(player),
    detail: detail(player),
    rank: player.rank
  }));
}

function matchRows(rows: MatchRecordRow[], value: (row: MatchRecordRow) => string | number) {
  return rows.slice(0, 3).map((row) => ({
    id: `${row.player.id}-${row.matchId}`,
    player: row.player,
    value: value(row),
    detail: `${row.matchTitle} - ${row.mapCount} map${row.mapCount === 1 ? "" : "s"} - ${row.secondary}`,
    href: `/matches/${row.matchId}`
  }));
}

export default async function RecordsPage() {
  const [players, stats] = await Promise.all([
    getPlayersWithAggregateStats(),
    prisma.playerMapStats.findMany({
      include: {
        player: true,
        match: {
          include: {
            teamA: true,
            teamB: true
          }
        }
      }
    })
  ]);

  const activePlayers = players.filter((player) => player.aggregate.maps > 0);
  const matchRecordRows = Array.from(
    stats.reduce((map, stat) => {
      const key = `${stat.playerId}:${stat.matchId}`;
      const existing = map.get(key) || {
        player: stat.player,
        match: stat.match,
        entries: [] as typeof stats
      };
      existing.entries.push(stat);
      map.set(key, existing);
      return map;
    }, new Map<string, { player: (typeof stats)[number]["player"]; match: (typeof stats)[number]["match"]; entries: typeof stats }>())
  ).map(([, value]) => {
    const aggregate = calculateAggregateStats(value.entries);
    return {
      player: {
        id: value.player.id,
        slug: value.player.slug,
        displayName: value.player.displayName
      },
      matchId: value.match.id,
      matchTitle: getMatchTitle(value.match),
      format: value.match.format,
      mapCount: aggregate.maps,
      kills: aggregate.kills,
      deaths: aggregate.deaths,
      rating: aggregate.rating,
      kd: aggregate.kd,
      kdDiff: aggregate.kdDiff
    };
  });

  const bestPerformance = [...matchRecordRows]
    .sort((a, b) => b.rating - a.rating || b.kills - a.kills || a.player.displayName.localeCompare(b.player.displayName))
    .map((row) => ({ ...row, value: row.rating, secondary: `${row.kills}-${row.deaths} K-D` }));
  const killsInMatch = [...matchRecordRows]
    .sort((a, b) => b.kills - a.kills || b.rating - a.rating || a.player.displayName.localeCompare(b.player.displayName))
    .map((row) => ({ ...row, value: row.kills, secondary: `${formatDecimal(row.rating)} rating` }));
  const deathsInMatch = [...matchRecordRows]
    .sort((a, b) => b.deaths - a.deaths || a.player.displayName.localeCompare(b.player.displayName))
    .map((row) => ({ ...row, value: row.deaths, secondary: `${row.kills}-${row.deaths} K-D` }));
  const bestKdMatch = [...matchRecordRows]
    .filter((row) => (row.format === 4 || row.format === 5) && (row.deaths > 0 || row.kills > 0))
    .sort((a, b) => b.kd - a.kd || b.kills - a.kills || a.player.displayName.localeCompare(b.player.displayName))
    .map((row) => ({ ...row, value: row.kd, secondary: `${row.kills}-${row.deaths} K-D` }));
  const worstKdPlayers = [...activePlayers]
    .filter((player) => player.aggregate.deaths > 0)
    .sort((a, b) => a.aggregate.kd - b.aggregate.kd || b.aggregate.deaths - a.aggregate.deaths || a.displayName.localeCompare(b.displayName));

  return (
    <main className="page-shell">
      <section className="dashboard-hero">
        <p className="label text-metal-accent">Community history</p>
        <h1 className="mt-2 text-4xl font-black uppercase tracking-normal md:text-5xl">Records</h1>
        <p className="mt-3 max-w-3xl text-base font-semibold leading-7 text-metal-muted">
          Single-match highs, all-time totals and the stat lines nobody wants framed. Best K-D only counts 4v4 and 5v5 league games.
        </p>
        <div className="mt-7 grid gap-3 sm:grid-cols-3">
          <div className="signal-tile">
            <p className="label">Tracked Players</p>
            <p>{activePlayers.length}</p>
            <span>Players with map stats</span>
          </div>
          <div className="signal-tile">
            <p className="label">Match Lines</p>
            <p>{matchRecordRows.length}</p>
            <span>Player performances grouped by match</span>
          </div>
          <div className="signal-tile">
            <p className="label">Top Rating</p>
            <p>{bestPerformance[0] ? formatDecimal(bestPerformance[0].rating) : "0.00"}</p>
            <span>{bestPerformance[0]?.player.displayName || "No leader yet"}</span>
          </div>
        </div>
      </section>

      <section className="mt-8 grid gap-5 lg:grid-cols-3">
        <RecordBoard
          title="Best Performance"
          icon={<Trophy className="text-yellow-300" size={20} />}
          subtitle="Highest calculated rating in a match."
          rows={matchRows(bestPerformance, (row) => formatDecimal(row.value))}
        />
        <RecordBoard
          title="Kills In A Match"
          icon={<Crosshair className="text-red-300" size={20} />}
          subtitle="Biggest single match kill totals."
          rows={matchRows(killsInMatch, (row) => row.value)}
        />
        <RecordBoard
          title="Best K-D In A Match"
          icon={<Target className="text-cyan-300" size={20} />}
          subtitle="Cleanest K-D ratio in eligible 4v4 or 5v5 matches."
          rows={matchRows(bestKdMatch, (row) => formatDecimal(row.value))}
        />
      </section>

      <section className="mt-8 grid gap-5 lg:grid-cols-3">
        <RecordBoard
          title="Total Kills"
          icon={<Swords className="text-metal-accent" size={20} />}
          subtitle="All-time kills across logged maps."
          rows={playerRows(sortPlayersByMetric(activePlayers, "kdDiff").sort((a, b) => b.aggregate.kills - a.aggregate.kills), (player) => player.aggregate.kills, (player) => `${player.aggregate.maps} maps - ${formatDecimal(player.aggregate.kd)} KD`)}
        />
        <RecordBoard
          title="Most Headshots"
          icon={<Zap className="text-yellow-300" size={20} />}
          subtitle="All-time headshot kills."
          rows={playerRows([...activePlayers].sort((a, b) => b.aggregate.headshots - a.aggregate.headshots), (player) => player.aggregate.headshots, (player) => `${formatPercent(player.aggregate.hsPercent)} HS - ${player.aggregate.kills} kills`)}
        />
        <RecordBoard
          title="Total Deaths"
          icon={<Skull className="text-red-300" size={20} />}
          subtitle="The community pain counter."
          danger
          rows={playerRows([...activePlayers].sort((a, b) => b.aggregate.deaths - a.aggregate.deaths), (player) => player.aggregate.deaths, (player) => `${player.aggregate.maps} maps - ${formatDecimal(player.aggregate.kd)} KD`)}
        />
      </section>

      <section className="mt-8 grid gap-5 lg:grid-cols-2">
        <RecordBoard
          title="Deaths In A Match"
          icon={<Activity className="text-red-300" size={20} />}
          subtitle="Most deaths in one match."
          danger
          rows={matchRows(deathsInMatch, (row) => row.value)}
        />
        <RecordBoard
          title="Worst KD"
          icon={<Skull className="text-red-300" size={20} />}
          subtitle="Lowest all-time K-D among players with deaths logged."
          danger
          rows={playerRows(worstKdPlayers, (player) => formatDecimal(player.aggregate.kd), (player) => `${player.aggregate.kills}-${player.aggregate.deaths} K-D across ${player.aggregate.maps} maps`)}
        />
      </section>
    </main>
  );
}
