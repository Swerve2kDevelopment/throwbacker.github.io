import Link from "next/link";

import { AdminForm, AdminStatusBanner, Field } from "@/components/admin/AdminForm";
import { ConfirmDeleteModal } from "@/components/ui/ConfirmDeleteModal";
import { createStatAction, deleteStatAction } from "@/lib/admin-actions";
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

export default async function AdminStatsPage({
  searchParams
}: {
  searchParams: Promise<{ saved?: string; deleted?: string; error?: string; notice?: string }>;
}) {
  await assertAdminUser();

  const resolvedSearchParams = await searchParams;
  const [stats, players, teams, tournaments, matches, maps] = await Promise.all([
    prisma.playerMapStats.findMany({
      include: { player: true, team: true, tournament: true, match: { include: { teamA: true, teamB: true } }, mapGame: true },
      orderBy: { updatedAt: "desc" },
      take: 100
    }),
    prisma.player.findMany({ orderBy: { displayName: "asc" } }),
    prisma.team.findMany({ orderBy: { name: "asc" } }),
    prisma.tournament.findMany({ orderBy: { startDate: "desc" } }),
    prisma.match.findMany({ include: { teamA: true, teamB: true, tournament: true }, orderBy: { playedAt: "desc" } }),
    prisma.mapGame.findMany({
      include: { match: { include: { teamA: true, teamB: true, tournament: true } } },
      orderBy: [{ match: { playedAt: "desc" } }, { order: "asc" }]
    })
  ]);

  return (
    <div>
      <AdminStatusBanner searchParams={resolvedSearchParams} />
      <div className="grid gap-5 xl:grid-cols-[460px_1fr]">
        <AdminForm title="Add Player Map Stats">
          <form action={createStatAction} className="grid gap-3">
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Player">
                <select className="input" name="playerId" required>
                  <option value="">Select player</option>
                  {players.map((player) => (
                    <option key={player.id} value={player.id}>
                      {player.displayName}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Team">
                <select className="input" name="teamId">
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
              <select className="input" name="tournamentId">
                <option value="">Standalone / no tournament</option>
                {tournaments.map((tournament) => (
                  <option key={tournament.id} value={tournament.id}>
                    {tournament.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Match">
              <select className="input" name="matchId" required>
                <option value="">Select match</option>
                {matches.map((match) => (
                  <option key={match.id} value={match.id}>
                    {getMatchTitle(match)} - {match.tournament?.name || "Standalone"}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Side">
              <select className="input" name="side" defaultValue="">
                <option value="">Use official team</option>
                <option value="A">Team A</option>
                <option value="B">Team B</option>
              </select>
            </Field>
            <Field label="Map">
              <select className="input" name="mapGameId" required>
                <option value="">Select map</option>
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
                  <input className="input" type="number" min="0" name={name} defaultValue={0} />
                </Field>
              ))}
            </div>
            <Field label="Rating override">
              <input className="input" type="number" min="0" step="0.01" name="ratingOverride" />
            </Field>
            <label className="check-row">
              <input type="checkbox" name="announce" />
              Post this match to the Discord webhook after saving
            </label>
            <button className="button button-primary" type="submit">
              Save stats
            </button>
          </form>
        </AdminForm>

        <section className="panel p-4">
          <h2 className="mb-4 border-b border-metal-line pb-3 text-xl font-black">Recent Stat Entries</h2>
          <div className="table-scroll">
            <table className="wiki-table">
              <thead>
                <tr>
                  <th>Player</th>
                  <th>Match</th>
                  <th>Map</th>
                  <th className="numeric">K-D-A</th>
                  <th className="numeric">Actions</th>
                </tr>
              </thead>
              <tbody>
                {stats.length ? (
                  stats.map((entry) => (
                    <tr key={entry.id}>
                      <td>
                        <Link href={`/admin/stats/${entry.id}`} className="font-black hover:text-metal-accent">
                          {entry.player.displayName}
                        </Link>
                      </td>
                      <td>{getMatchTitle(entry.match)}</td>
                      <td>{entry.mapGame.mapName}</td>
                      <td className="numeric">{entry.kills}-{entry.deaths}-{entry.assists}</td>
                      <td>
                        <div className="flex justify-end gap-2">
                          <Link className="button" href={`/admin/stats/${entry.id}`}>
                            Edit
                          </Link>
                          <form action={deleteStatAction.bind(null, entry.id)}>
                            <ConfirmDeleteModal />
                          </form>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="text-metal-muted">
                      No stat entries yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
