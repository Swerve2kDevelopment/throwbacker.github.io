import Link from "next/link";
import { notFound } from "next/navigation";

import { AdminForm, AdminStatusBanner } from "@/components/admin/AdminForm";
import type { StatCell } from "@/components/admin/MatchBuilder";
import { MatchForm } from "@/components/admin/MatchForm";
import { parseOperatorBan } from "@/lib/match-entry";
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
  const [match, tournaments, leagues, teams, players, operators] = await Promise.all([
    prisma.match.findUnique({
      where: { id },
      include: {
        maps: { orderBy: { order: "asc" } },
        teamA: true,
        teamB: true,
        participants: true,
        stats: true,
        keyMoments: { include: { player: true }, orderBy: { createdAt: "asc" } }
      }
    }),
    prisma.tournament.findMany({ orderBy: { startDate: "desc" }, select: { id: true, name: true } }),
    prisma.league.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, shortName: true, slug: true } }),
    prisma.team.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, tag: true, logoUrl: true } }),
    prisma.player.findMany({ orderBy: { displayName: "asc" }, select: { id: true, displayName: true, realName: true, avatarUrl: true, currentTeamId: true, aliases: true, inGameName: true } }),
    prisma.operatorIcon.findMany({ orderBy: { name: "asc" }, select: { name: true, iconPath: true } })
  ]);

  if (!match) notFound();

  // Builder state: one scoreboard per map, keyed by map id, with every stat line pre-filled.
  const cell = (value: number | null | undefined) => (value === null || value === undefined ? "" : String(value));
  const stats: Record<string, Record<string, StatCell>> = {};
  for (const stat of match.stats) {
    const map = match.maps.find((item) => item.id === stat.mapGameId);
    const rounds = map && stat.roundsPlayed && stat.roundsPlayed !== map.teamAScore + map.teamBScore ? String(stat.roundsPlayed) : "";
    stats[stat.mapGameId] = {
      ...stats[stat.mapGameId],
      [stat.playerId]: { k: cell(stat.kills), d: cell(stat.deaths), a: cell(stat.assists), hs: cell(stat.headshots), plants: cell(stat.plants), rating: cell(stat.ratingOverride), rounds }
    };
  }
  const sided = (side: "A" | "B") => [
    ...new Set([
      ...match.participants.filter((participant) => participant.side === side).map((participant) => participant.playerId),
      ...match.stats.filter((stat) => stat.side === side).map((stat) => stat.playerId)
    ])
  ];

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
          operators={operators}
          match={match}
          builder={{
            teamAPlayerIds: sided("A"),
            teamBPlayerIds: sided("B").filter((id) => !sided("A").includes(id)),
            maps: match.maps.map((map) => ({ key: map.id, name: map.mapName, a: String(map.teamAScore), b: String(map.teamBScore) })),
            stats,
            bans: match.operatorBans.map((line) => {
              const ban = parseOperatorBan(line);
              return { operator: ban.operator, side: ban.side };
            })
          }}
          defaults={{
            keyMomentsRaw: match.keyMoments.map((moment) => `${moment.player.displayName} | ${moment.text}`).join("\n")
          }}
        />
      </AdminForm>
    </div>
  );
}
