import { BracketStage, BracketType, TournamentStatus } from "@prisma/client";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AdminForm, AdminStatusBanner, Field } from "@/components/admin/AdminForm";
import { Bracket } from "@/components/Bracket";
import { updateMatchBracketAction, updateTournamentAction, updateTournamentPlacementsAction } from "@/lib/admin-actions";
import { buildEliminationBracket } from "@/lib/bracket";
import { formatDateTime } from "@/lib/format";
import { getMatchTitle } from "@/lib/match-utils";
import { assertAdminUser } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { attachRegisteredTeams } from "@/lib/registered-teams";

export const dynamic = "force-dynamic";

const bracketLabels: Record<BracketType, string> = {
  SINGLE_ELIMINATION: "Single elimination",
  DOUBLE_ELIMINATION: "Double elimination",
  ROUND_ROBIN: "Round robin",
  SWISS: "Swiss",
  GROUP_STAGE: "Group stage"
};

function dateInput(value?: Date | null) {
  return value ? value.toISOString().slice(0, 10) : "";
}

export default async function AdminEditTournamentPage({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string; deleted?: string; error?: string; notice?: string }>;
}) {
  await assertAdminUser();

  const [{ id }, resolvedSearchParams] = await Promise.all([params, searchParams]);
  const [tournament, teams, players] = await Promise.all([
    prisma.tournament.findUnique({
      where: { id },
      include: {
        tournamentTeams: {
          include: { team: true },
          orderBy: [{ finalPlacement: "asc" }, { seed: "asc" }]
        },
        matches: {
          include: { teamA: true, teamB: true, maps: true },
          orderBy: [{ playedAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }]
        }
      }
    }),
    prisma.team.findMany({ orderBy: { name: "asc" } }),
    prisma.player.findMany({ orderBy: { displayName: "asc" } })
  ]);

  if (!tournament) notFound();
  tournament.matches = await attachRegisteredTeams(tournament.matches);
  const selected = tournament.tournamentTeams.map((entry) => entry.teamId);
  const isElimination = tournament.bracketType === BracketType.SINGLE_ELIMINATION || tournament.bracketType === BracketType.DOUBLE_ELIMINATION;
  const bracket =
    isElimination && tournament.tournamentTeams.length >= 2
      ? buildEliminationBracket(
          tournament.tournamentTeams.map((entry) => ({ seed: entry.seed, team: entry.team })),
          tournament.matches,
          tournament.bracketType
        )
      : null;
  const unplacedIds = new Set(bracket?.unplaced.map((match) => match.id) || []);

  return (
    <div>
      <AdminStatusBanner searchParams={resolvedSearchParams} />
      <AdminForm title={`Edit ${tournament.name}`}>
        <form action={updateTournamentAction.bind(null, tournament.id)} className="grid gap-3">
          <Field label="Name">
            <input className="input" name="name" defaultValue={tournament.name} required />
          </Field>
          <Field label="Slug">
            <input className="input" name="slug" defaultValue={tournament.slug} />
          </Field>
          <Field label="Description">
            <textarea className="input min-h-24" name="description" defaultValue={tournament.description || ""} />
          </Field>
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Status">
              <select className="input" name="status" defaultValue={tournament.status}>
                {Object.values(TournamentStatus).map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Prize pool">
              <input className="input" name="prizePool" defaultValue={tournament.prizePool || ""} />
            </Field>
          </div>
          <Field label="Bracket format">
            <select className="input" name="bracketType" defaultValue={tournament.bracketType}>
              {Object.values(BracketType).map((type) => (
                <option key={type} value={type}>
                  {bracketLabels[type]}
                </option>
              ))}
            </select>
          </Field>
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Start date">
              <input className="input" type="date" name="startDate" defaultValue={dateInput(tournament.startDate)} />
            </Field>
            <Field label="End date">
              <input className="input" type="date" name="endDate" defaultValue={dateInput(tournament.endDate)} />
            </Field>
          </div>
          <Field label="Logo URL">
            <input className="input" name="logoUrl" defaultValue={tournament.logoUrl || ""} />
          </Field>
          <Field label="Banner URL">
            <input className="input" name="bannerUrl" defaultValue={tournament.bannerUrl || ""} />
          </Field>
          <Field label="Tournament MVP">
            <select className="input" name="mvpPlayerId" defaultValue={tournament.mvpPlayerId || ""}>
              <option value="">No MVP selected</option>
              {players.map((player) => (
                <option key={player.id} value={player.id}>
                  {player.displayName}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Map vetoes">
            <textarea className="input min-h-24" name="mapVetoes" defaultValue={tournament.mapVetoes.join("\n")} placeholder="One veto per line" />
          </Field>
          <Field label="Operator bans">
            <textarea className="input min-h-24" name="operatorBans" defaultValue={tournament.operatorBans.join("\n")} placeholder="One ban per line" />
          </Field>
          <Field label="Teams">
            <select className="input min-h-44" name="selectedTeamIds" multiple defaultValue={selected}>
              {teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </select>
          </Field>
          <label className="flex items-center gap-2 text-sm font-bold text-metal-muted">
            <input type="checkbox" name="featured" defaultChecked={tournament.featured} />
            Featured on homepage
          </label>
          <button className="button button-primary" type="submit">
            Save changes
          </button>
        </form>
      </AdminForm>

      <div className="mt-5">
        <AdminForm title="Standings">
          <form action={updateTournamentPlacementsAction.bind(null, tournament.id)} className="grid gap-3">
            <div className="table-scroll">
              <table className="wiki-table">
                <thead>
                  <tr>
                    <th>Team</th>
                    <th className="numeric">Seed</th>
                    <th className="numeric">Final placement</th>
                  </tr>
                </thead>
                <tbody>
                  {tournament.tournamentTeams.length ? (
                    tournament.tournamentTeams.map((entry) => (
                      <tr key={entry.id}>
                        <td className="font-black">{entry.team.name}</td>
                        <td>
                          <input className="input text-right" type="number" min="1" name={`seed:${entry.id}`} defaultValue={entry.seed || ""} />
                        </td>
                        <td>
                          <input className="input text-right" type="number" min="1" name={`placement:${entry.id}`} defaultValue={entry.finalPlacement || ""} />
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={3} className="text-metal-muted">
                        Add teams to this tournament first.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <button className="button button-primary" type="submit">
              Save standings
            </button>
          </form>
        </AdminForm>
      </div>

      <section className="mt-5 grid gap-5">
        <AdminForm title="Bracket preview" description="Seeds come from Standings. Games between the two teams a slot expects fill it automatically; use the placement controls below to pin a game to a slot.">
          {bracket ? (
            <>
              <Bracket stages={bracket.stages} />
              {bracket.unplaced.length ? (
                <div className="bracket-note">
                  {bracket.unplaced.length} game{bracket.unplaced.length === 1 ? " is" : "s are"} not in the bracket yet (marked below).
                </div>
              ) : null}
            </>
          ) : (
            <p className="text-sm font-semibold text-metal-muted">
              {isElimination ? "Add at least two teams to draw the bracket." : `${bracketLabels[tournament.bracketType]} events show a standings table instead of a bracket.`}
            </p>
          )}
        </AdminForm>

        <section className="panel p-4">
          <div className="mb-4 flex flex-col gap-3 border-b border-metal-line pb-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="eyebrow">Tournament games</p>
              <h2 className="text-lg font-black">Games &amp; bracket placement</h2>
            </div>
            <Link className="button button-primary" href={`/admin/matches?tournamentId=${tournament.id}`}>
              Add game
            </Link>
          </div>
          <div className="table-scroll">
            <table className="wiki-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Game</th>
                  <th className="numeric">Score</th>
                  <th>Bracket slot</th>
                  <th className="numeric">Actions</th>
                </tr>
              </thead>
              <tbody>
                {tournament.matches.length ? (
                  tournament.matches.map((match) => (
                    <tr key={match.id}>
                      <td className="whitespace-nowrap">{formatDateTime(match.playedAt)}</td>
                      <td className="font-black text-metal-text">
                        {getMatchTitle(match)}
                        {unplacedIds.has(match.id) ? <span className="ml-2 fun-pill">Not in bracket</span> : null}
                      </td>
                      <td className="numeric">
                        {match.scoreA}-{match.scoreB}
                      </td>
                      <td>
                        <form action={updateMatchBracketAction.bind(null, match.id, tournament.id)} className="flex flex-wrap items-center gap-2">
                          <select className="input w-auto" name="bracketStage" defaultValue={match.bracketStage || ""} aria-label="Stage">
                            <option value="">Auto</option>
                            <option value={BracketStage.UPPER}>Upper</option>
                            <option value={BracketStage.LOWER}>Lower</option>
                            <option value={BracketStage.GRAND_FINAL}>Grand final</option>
                            <option value={BracketStage.GROUP}>Group</option>
                          </select>
                          <input className="input w-16" type="number" min="1" name="bracketRound" defaultValue={match.bracketRound ?? ""} placeholder="R" aria-label="Round" />
                          <input className="input w-16" type="number" min="1" name="bracketPosition" defaultValue={match.bracketPosition ?? ""} placeholder="Slot" aria-label="Slot" />
                          <button className="button" type="submit">
                            Set
                          </button>
                        </form>
                      </td>
                      <td className="numeric">
                        <Link className="button" href={`/admin/matches/${match.id}`}>
                          Edit
                        </Link>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="text-metal-muted">
                      No games added for this tournament yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="form-hint mt-3">Round counts from 1 within each stage; slot counts from the top. A grand final is round 1, slot 1.</p>
        </section>
      </section>
    </div>
  );
}
