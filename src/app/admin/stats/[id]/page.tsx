import { notFound } from "next/navigation";

import { AdminForm, AdminStatusBanner, Field } from "@/components/admin/AdminForm";
import { updateStatAction } from "@/lib/admin-actions";
import { getMatchTitle } from "@/lib/match-utils";
import { assertAdminUser } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const numberFields = [
  ["kills", "Kills"],
  ["deaths", "Deaths"],
  ["assists", "Assists"],
  ["headshots", "Headshots"],
  ["roundsPlayed", "Rounds played"]
] as const;

export default async function AdminEditStatPage({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string; deleted?: string; error?: string; notice?: string }>;
}) {
  await assertAdminUser();

  const [{ id }, resolvedSearchParams] = await Promise.all([params, searchParams]);
  const [entry, players, teams, tournaments, matches, maps] = await Promise.all([
    prisma.playerMapStats.findUnique({
      where: { id },
      include: { player: true, match: { include: { teamA: true, teamB: true } }, mapGame: true }
    }),
    prisma.player.findMany({ orderBy: { displayName: "asc" } }),
    prisma.team.findMany({ orderBy: { name: "asc" } }),
    prisma.tournament.findMany({ orderBy: { startDate: "desc" } }),
    prisma.match.findMany({ include: { teamA: true, teamB: true, tournament: true }, orderBy: { playedAt: "desc" } }),
    prisma.mapGame.findMany({
      include: { match: { include: { teamA: true, teamB: true } } },
      orderBy: [{ match: { playedAt: "desc" } }, { order: "asc" }]
    })
  ]);

  if (!entry) notFound();

  return (
    <div>
      <AdminStatusBanner searchParams={resolvedSearchParams} />
      <AdminForm title={`Edit stats: ${entry.player.displayName} on ${entry.mapGame.mapName}`}>
        <form action={updateStatAction.bind(null, entry.id)} className="grid gap-3">
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Player">
              <select className="input" name="playerId" required defaultValue={entry.playerId}>
                {players.map((player) => (
                  <option key={player.id} value={player.id}>
                    {player.displayName}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Team">
              <select className="input" name="teamId" defaultValue={entry.teamId || ""}>
                <option value="">Custom side / no official team</option>
                {teams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="Tournament">
            <select className="input" name="tournamentId" defaultValue={entry.tournamentId || ""}>
              <option value="">Standalone / no tournament</option>
              {tournaments.map((tournament) => (
                <option key={tournament.id} value={tournament.id}>
                  {tournament.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Match">
            <select className="input" name="matchId" required defaultValue={entry.matchId}>
              {matches.map((match) => (
                <option key={match.id} value={match.id}>
                  {getMatchTitle(match)} - {match.tournament?.name || "Standalone"}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Side">
            <select className="input" name="side" defaultValue={entry.side || ""}>
              <option value="">Use official team</option>
              <option value="A">Team A</option>
              <option value="B">Team B</option>
            </select>
          </Field>
          <Field label="Map">
            <select className="input" name="mapGameId" required defaultValue={entry.mapGameId}>
              {maps.map((map) => (
                <option key={map.id} value={map.id}>
                  {map.mapName} - {getMatchTitle(map.match)}
                </option>
              ))}
            </select>
          </Field>
          <div className="grid gap-3 md:grid-cols-2">
            {numberFields.map(([name, label]) => (
              <Field key={name} label={label}>
                <input className="input" type="number" min="0" name={name} defaultValue={entry[name]} />
              </Field>
            ))}
          </div>
          <Field label="Rating override">
            <input className="input" type="number" min="0" step="0.01" name="ratingOverride" defaultValue={entry.ratingOverride ?? ""} />
          </Field>
          <button className="button button-primary" type="submit">
            Save changes
          </button>
        </form>
      </AdminForm>
    </div>
  );
}
