import type { Metadata } from "next";

import { PlayerTable } from "@/components/PlayerTable";
import { SearchInput } from "@/components/ui/SearchInput";
import { getPlayersWithAggregateStats, type PlayerWithStats } from "@/lib/stats";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Players"
};

function sortPlayers(players: PlayerWithStats[], sort: string, dir: string) {
  const multiplier = dir === "asc" ? 1 : -1;

  return [...players].sort((a, b) => {
    let aValue: string | number;
    let bValue: string | number;

    switch (sort) {
      case "team":
        aValue = a.currentTeam?.name || "";
        bValue = b.currentTeam?.name || "";
        break;
      case "rating":
      case "mmr":
      case "kd":
      case "kdDiff":
      case "kills":
      case "maps":
      case "hsPercent":
        aValue = sort === "mmr" ? a.rank.mmr : a.aggregate[sort];
        bValue = sort === "mmr" ? b.rank.mmr : b.aggregate[sort];
        break;
      case "name":
      default:
        aValue = a.displayName;
        bValue = b.displayName;
        break;
    }

    if (typeof aValue === "string" || typeof bValue === "string") {
      return String(aValue).localeCompare(String(bValue)) * multiplier;
    }

    if (aValue === bValue) return a.displayName.localeCompare(b.displayName);
    return (aValue - bValue) * multiplier;
  });
}

export default async function PlayersPage({
  searchParams
}: {
  searchParams: Promise<{ q?: string; sort?: string; dir?: string }>;
}) {
  const resolvedSearchParams = await searchParams;
  const q = resolvedSearchParams.q?.trim().toLowerCase() || "";
  const sort = resolvedSearchParams.sort || "rating";
  const dir = resolvedSearchParams.dir === "asc" ? "asc" : "desc";
  const players = await getPlayersWithAggregateStats();

  const filtered = players.filter((player) => {
    if (!q) return true;
    return [
      player.displayName,
      player.nationality,
      player.discordUsername,
      player.realName,
      player.currentTeam?.name,
      player.currentTeam?.tag,
      ...player.aliases
    ]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(q));
  });

  return (
    <main className="page-shell">
      <div className="mb-5 flex flex-col gap-3 border-b border-metal-line pb-5 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="label text-metal-accent">Player database</p>
          <h1 className="mt-1 text-3xl font-black">Players</h1>
        </div>
        <SearchInput defaultValue={resolvedSearchParams.q} placeholder="Search players, teams, aliases" action="/players" />
      </div>

      <PlayerTable players={sortPlayers(filtered, sort, dir)} sort={sort} dir={dir} q={resolvedSearchParams.q} />
    </main>
  );
}
