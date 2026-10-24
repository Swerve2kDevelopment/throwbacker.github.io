import Link from "next/link";
import { notFound } from "next/navigation";

import { AdminForm, AdminStatusBanner } from "@/components/admin/AdminForm";
import { MatchForm } from "@/components/admin/MatchForm";
import { announceMatchAction, updateMatchAction } from "@/lib/admin-actions";
import { getMatchTitle } from "@/lib/match-utils";
import { assertAdminUser } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function AdminEditMatchPage({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string; deleted?: string; error?: string; notice?: string }>;
}) {
  await assertAdminUser();

  const [{ id }, resolvedSearchParams] = await Promise.all([params, searchParams]);
  const [match, tournaments, leagues, teams, players] = await Promise.all([
    prisma.match.findUnique({
      where: { id },
      include: {
        maps: { orderBy: { order: "asc" } },
        teamA: true,
        teamB: true,
        participants: true,
        stats: { include: { player: true }, orderBy: [{ side: "asc" }, { kills: "desc" }] },
        keyMoments: { include: { player: true }, orderBy: { createdAt: "asc" } }
      }
    }),
    prisma.tournament.findMany({ orderBy: { startDate: "desc" }, select: { id: true, name: true } }),
    prisma.league.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, shortName: true, slug: true } }),
    prisma.team.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.player.findMany({ orderBy: { displayName: "asc" }, select: { id: true, displayName: true } })
  ]);

  if (!match) notFound();

  const mapsRaw = match.maps.map((map) => [map.mapName, map.teamAScore, map.teamBScore, map.winnerSide || ""].join(" | ").replace(/ \| $/, "")).join("\n");

  // Re-create the scoreboard text so saving the form without changes is lossless.
  const bulkStatsRaw = match.maps
    .map((map) => {
      const rows = match.stats
        .filter((stat) => stat.mapGameId === map.id)
        .map((stat) => {
          const rounds = stat.roundsPlayed && stat.roundsPlayed !== map.teamAScore + map.teamBScore ? String(stat.roundsPlayed) : "";
          const columns = [stat.player.displayName, stat.kills, stat.deaths, stat.assists, stat.headshots, stat.ratingOverride ?? "", rounds];
          while (columns.length > 5 && columns[columns.length - 1] === "") columns.pop();
          return columns.join(" | ");
        });
      if (!rows.length) return "";
      return match.maps.length > 1 ? [`# Map ${map.order}`, ...rows].join("\n") : rows.join("\n");
    })
    .filter(Boolean)
    .join("\n\n");

  return (
    <div className="grid gap-5">
      <AdminStatusBanner searchParams={resolvedSearchParams} />
      <div className="flex flex-wrap items-center gap-2">
        <Link className="button" href={`/matches/${match.id}`}>
          View public page
        </Link>
        <form action={announceMatchAction.bind(null, match.id)}>
          <button className="button" type="submit" disabled={!match.stats.length}>
            Post to Discord now
          </button>
        </form>
        <span className="form-hint">
          {match.stats.length} stat line{match.stats.length === 1 ? "" : "s"} · {match.maps.length} map{match.maps.length === 1 ? "" : "s"}
        </span>
      </div>
      <AdminForm title={`Edit ${getMatchTitle(match)}`}>
        <MatchForm
          action={updateMatchAction.bind(null, match.id)}
          submitLabel="Save changes"
          tournaments={tournaments}
          leagues={leagues}
          teams={teams}
          players={players}
          match={match}
          defaults={{
            teamAPlayerIds: match.participants.filter((participant) => participant.side === "A").map((participant) => participant.playerId),
            teamBPlayerIds: match.participants.filter((participant) => participant.side === "B").map((participant) => participant.playerId),
            mapsRaw,
            bulkStatsRaw,
            keyMomentsRaw: match.keyMoments.map((moment) => `${moment.player.displayName} | ${moment.text}`).join("\n")
          }}
        />
      </AdminForm>
    </div>
  );
}
