import Link from "next/link";

import { RankBadge } from "@/components/RankBadge";
import { Avatar } from "@/components/ui/Avatar";
import { TeamLogo } from "@/components/ui/TeamLogo";
import { formatDecimal, formatKdDiff, formatPercent } from "@/lib/format";
import type { LeaderboardMetric, PlayerWithStats } from "@/lib/stats";

function metricValue(player: PlayerWithStats, metric: LeaderboardMetric) {
  if (metric === "mmr") return String(player.rank.mmr);
  const value = player.aggregate[metric];
  if (metric === "hsPercent") return formatPercent(value);
  if (metric === "rating" || metric === "kd") return formatDecimal(value);
  if (metric === "kdDiff") return formatKdDiff(value);
  return String(value);
}

export function LeaderboardTable({
  players,
  metric,
  label
}: {
  players: PlayerWithStats[];
  metric: LeaderboardMetric;
  label: string;
}) {
  return (
    <div className="table-scroll">
      <table className="wiki-table">
        <thead>
          <tr>
            <th className="w-16 numeric">#</th>
            <th>Player</th>
            <th>Team</th>
            <th className="numeric">Rank</th>
            <th className="numeric">{label}</th>
            <th className="numeric">Maps</th>
            <th className="numeric">KD</th>
            <th className="numeric">HS%</th>
          </tr>
        </thead>
        <tbody>
          {players.length ? (
            players.map((player, index) => (
              <tr key={player.id} className={index < 3 ? "highlight" : undefined}>
                <td className="numeric font-black">{index + 1}</td>
                <td>
                  <Link href={`/players/${player.slug}`} className="player-cell">
                    <Avatar player={player} />
                    <span className="min-w-0">
                      <strong>{player.displayName}</strong>
                      {player.realName ? <em>{player.realName}</em> : null}
                    </span>
                  </Link>
                </td>
                <td>
                  {player.currentTeam ? (
                    <Link href={`/teams/${player.currentTeam.slug}`} className="inline-flex items-center gap-2 text-metal-link hover:text-metal-accent">
                      <TeamLogo team={player.currentTeam} />
                      {player.currentTeam.tag || player.currentTeam.name}
                    </Link>
                  ) : (
                    <span className="text-metal-muted">Free agent</span>
                  )}
                </td>
                <td className="numeric">
                  <RankBadge rank={player.rank} compact />
                </td>
                <td className="numeric text-lg font-black text-metal-text">{metricValue(player, metric)}</td>
                <td className="numeric">{player.aggregate.maps}</td>
                <td className="numeric">{formatDecimal(player.aggregate.kd)}</td>
                <td className="numeric">{formatPercent(player.aggregate.hsPercent)}</td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={8} className="text-metal-muted">
                No leaderboard data yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
