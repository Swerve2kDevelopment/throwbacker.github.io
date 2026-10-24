import Link from "next/link";

import { RankBadge } from "@/components/RankBadge";
import { Avatar } from "@/components/ui/Avatar";
import { TeamLogo } from "@/components/ui/TeamLogo";
import { formatDecimal, formatKdDiff, formatPercent, getFlagEmoji } from "@/lib/format";
import type { PlayerWithStats } from "@/lib/stats";

type SortKey = "name" | "team" | "mmr" | "rating" | "kd" | "kdDiff" | "kills" | "maps" | "hsPercent";

const columns: { key: SortKey; label: string; numeric?: boolean }[] = [
  { key: "name", label: "Player" },
  { key: "team", label: "Team" },
  { key: "mmr", label: "Rank", numeric: true },
  { key: "rating", label: "Rating", numeric: true },
  { key: "kd", label: "KD", numeric: true },
  { key: "kdDiff", label: "KD +/-", numeric: true },
  { key: "kills", label: "Kills", numeric: true },
  { key: "maps", label: "Maps", numeric: true },
  { key: "hsPercent", label: "HS%", numeric: true }
];

function sortHref(key: SortKey, currentSort: string, currentDir: string, q?: string) {
  const nextDir = currentSort === key && currentDir === "desc" ? "asc" : "desc";
  const params = new URLSearchParams({ sort: key, dir: nextDir });
  if (q) params.set("q", q);
  return `/players?${params.toString()}`;
}

export function PlayerTable({
  players,
  sort,
  dir,
  q
}: {
  players: PlayerWithStats[];
  sort: string;
  dir: string;
  q?: string;
}) {
  return (
    <div className="table-scroll">
      <table className="wiki-table">
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key} className={column.numeric ? "numeric" : undefined}>
                <Link href={sortHref(column.key, sort, dir, q)} className="inline-flex items-center gap-1 hover:text-metal-accent">
                  {column.label}
                  {sort === column.key ? <span className="text-[10px] text-metal-accent">{dir === "asc" ? "▲" : "▼"}</span> : null}
                </Link>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {players.length ? (
            players.map((player, index) => (
              <tr key={player.id} className={index < 3 && sort !== "name" ? "highlight" : undefined}>
                <td>
                  <Link href={`/players/${player.slug}`} className="player-cell">
                    <Avatar player={player} />
                    <span className="min-w-0">
                      <strong>
                        {getFlagEmoji(player.nationality)} {player.displayName}
                      </strong>
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
                  <span className="inline-flex items-center gap-2">
                    <RankBadge rank={player.rank} compact />
                    <span className="font-black" style={{ color: player.rank.color }}>
                      {player.rank.mmr}
                    </span>
                  </span>
                </td>
                <td className="numeric font-black">{formatDecimal(player.aggregate.rating)}</td>
                <td className="numeric">{formatDecimal(player.aggregate.kd)}</td>
                <td className="numeric">{formatKdDiff(player.aggregate.kdDiff)}</td>
                <td className="numeric">{player.aggregate.kills}</td>
                <td className="numeric">{player.aggregate.maps}</td>
                <td className="numeric">{formatPercent(player.aggregate.hsPercent)}</td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={columns.length} className="text-metal-muted">
                No players added yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
