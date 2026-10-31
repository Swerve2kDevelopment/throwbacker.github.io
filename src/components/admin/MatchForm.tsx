import { BracketStage, MatchKind, MatchStatus, type League, type Match, type Tournament } from "@prisma/client";

import { Field } from "@/components/admin/AdminForm";
import { MatchBuilder, type BuilderOperator, type BuilderPlayer, type BuilderTeam, type MatchBuilderInitial } from "@/components/admin/MatchBuilder";

type MatchFormProps = {
  action: (formData: FormData) => void | Promise<void>;
  submitLabel: string;
  tournaments: Pick<Tournament, "id" | "name">[];
  leagues: Pick<League, "id" | "name" | "shortName" | "slug">[];
  teams: BuilderTeam[];
  players: BuilderPlayer[];
  operators: BuilderOperator[];
  match?: Match | null;
  builder?: Partial<MatchBuilderInitial>;
  /** Tracker upload this form imports; marked imported when the match saves. */
  submissionId?: string;
  defaults?: {
    tournamentId?: string;
    keyMomentsRaw?: string;
    playedAt?: Date;
  };
};

const stageLabels: Record<BracketStage, string> = {
  UPPER: "Upper / main bracket",
  LOWER: "Lower bracket",
  GRAND_FINAL: "Grand final",
  GROUP: "Group stage"
};

function dateTimeInput(value?: Date | null) {
  if (!value) return "";
  const local = new Date(value.getTime() - value.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

/**
 * One form for creating and editing matches. Teams, maps, the scoreboard and
 * operator bans are handled by the interactive MatchBuilder.
 */
export function MatchForm({ action, submitLabel, tournaments, leagues, teams, players, operators, match, builder = {}, submissionId, defaults = {} }: MatchFormProps) {
  const oscl = leagues.find((league) => league.slug === "oscl");
  const initial: MatchBuilderInitial = {
    format: match?.format || 5,
    teamAId: match?.teamAId || "",
    teamBId: match?.teamBId || "",
    customTeamAName: match?.customTeamAName || "",
    customTeamBName: match?.customTeamBName || "",
    teamAPlayerIds: [],
    teamBPlayerIds: [],
    maps: [],
    stats: {},
    scoreA: match?.scoreA ?? 0,
    scoreB: match?.scoreB ?? 0,
    winnerSide: match?.winnerSide || "",
    bans: [],
    ...builder
  };

  return (
    <form action={action} className="grid gap-4">
      {submissionId ? <input type="hidden" name="submissionId" value={submissionId} /> : null}
      <div className="form-section" style={{ borderTop: 0, paddingTop: 0 }}>
        <h3>Match</h3>
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Title (optional)">
            <input className="input" name="title" defaultValue={match?.title || ""} placeholder="Week 3 · Upper semifinal" />
          </Field>
          <Field label="Played at">
            <input className="input" type="datetime-local" name="playedAt" defaultValue={dateTimeInput(match?.playedAt || defaults.playedAt)} />
          </Field>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <Field label="Game type">
            <select className="input" name="matchKind" defaultValue={match?.matchKind || MatchKind.LEAGUE}>
              <option value={MatchKind.LEAGUE}>League game (4v4 / 5v5)</option>
              <option value={MatchKind.FUN}>Fun game</option>
            </select>
          </Field>
          <Field label="League">
            <select className="input" name="leagueId" defaultValue={match ? match.leagueId || "" : oscl?.id || ""}>
              <option value="">No league</option>
              {leagues.map((league) => (
                <option key={league.id} value={league.id}>
                  {league.shortName || league.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Status">
            <select className="input" name="status" defaultValue={match?.status || MatchStatus.COMPLETED}>
              {Object.values(MatchStatus).map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="grid gap-3 md:grid-cols-[2fr_1.4fr_1fr_1fr]">
          <Field label="Tournament">
            <select className="input" name="tournamentId" defaultValue={match?.tournamentId || defaults.tournamentId || ""}>
              <option value="">Standalone match</option>
              {tournaments.map((tournament) => (
                <option key={tournament.id} value={tournament.id}>
                  {tournament.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Bracket stage">
            <select className="input" name="bracketStage" defaultValue={match?.bracketStage || ""}>
              <option value="">Auto / none</option>
              {Object.values(BracketStage).map((stage) => (
                <option key={stage} value={stage}>
                  {stageLabels[stage]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Round">
            <input className="input" type="number" min="1" name="bracketRound" defaultValue={match?.bracketRound ?? ""} />
          </Field>
          <Field label="Slot">
            <input className="input" type="number" min="1" name="bracketPosition" defaultValue={match?.bracketPosition ?? ""} />
          </Field>
        </div>
        <span className="form-hint">Bracket fields only matter for tournament games. Leave them blank and the bracket places the game by its two teams.</span>
      </div>

      <MatchBuilder players={players} teams={teams} operators={operators} initial={initial} isEdit={Boolean(match)} />

      <div className="form-section">
        <h3>Key moments &amp; veto</h3>
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Key moments">
            <textarea
              className="input min-h-24"
              name="keyMomentsRaw"
              defaultValue={defaults.keyMomentsRaw || ""}
              placeholder={"Fancy | Successful 1v4 clutch\nSwerve2k | 1v1 clutch failed"}
            />
            <span className="form-hint">
              <code>player | what happened</code>, one per line. Shows on the match page and the player&apos;s profile.
            </span>
          </Field>
          <Field label="Map veto">
            <textarea className="input min-h-24" name="mapVetoes" defaultValue={match?.mapVetoes.join("\n") || ""} placeholder={"Team A bans Chalet\nTeam B picks Bank"} />
          </Field>
        </div>
      </div>

      <div className="form-section">
        <label className="check-row">
          <input type="checkbox" name="announce" defaultChecked={!match} />
          Post stats to the Discord webhook when this saves
        </label>
        <button className="button button-primary w-fit" type="submit">
          {submitLabel}
        </button>
      </div>
    </form>
  );
}
