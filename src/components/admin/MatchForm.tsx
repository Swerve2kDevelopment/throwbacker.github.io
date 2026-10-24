import { BracketStage, MatchKind, MatchStatus, type League, type Match, type Player, type Team, type Tournament } from "@prisma/client";

import { Field } from "@/components/admin/AdminForm";

type MatchFormProps = {
  action: (formData: FormData) => void | Promise<void>;
  submitLabel: string;
  tournaments: Pick<Tournament, "id" | "name">[];
  leagues: Pick<League, "id" | "name" | "shortName" | "slug">[];
  teams: Pick<Team, "id" | "name">[];
  players: Pick<Player, "id" | "displayName">[];
  match?: Match | null;
  defaults?: {
    tournamentId?: string;
    teamAPlayerIds?: string[];
    teamBPlayerIds?: string[];
    mapsRaw?: string;
    bulkStatsRaw?: string;
    keyMomentsRaw?: string;
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
 * One form for creating and editing matches. Every text box uses a line-based
 * format so a whole scoreboard can be pasted in from Discord in one go.
 */
export function MatchForm({ action, submitLabel, tournaments, leagues, teams, players, match, defaults = {} }: MatchFormProps) {
  const oscl = leagues.find((league) => league.slug === "oscl");

  return (
    <form action={action} className="grid gap-4">
      <div className="form-section" style={{ borderTop: 0, paddingTop: 0 }}>
        <h3>Match</h3>
        <Field label="Title (optional)">
          <input className="input" name="title" defaultValue={match?.title || ""} placeholder="Week 3 · Upper semifinal" />
        </Field>
        <div className="grid gap-3 md:grid-cols-2">
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
        </div>
        <div className="grid gap-3 md:grid-cols-2">
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
          <Field label="Format">
            <select className="input" name="format" defaultValue={match?.format || 5}>
              {[1, 2, 3, 4, 5].map((size) => (
                <option key={size} value={size}>
                  {size}v{size}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
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

      <div className="form-section">
        <h3>Sides</h3>
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Team A">
            <select className="input" name="teamAId" defaultValue={match?.teamAId || ""}>
              <option value="">Custom side</option>
              {teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Team B">
            <select className="input" name="teamBId" defaultValue={match?.teamBId || ""}>
              <option value="">Custom side</option>
              {teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Custom Team A name">
            <input className="input" name="customTeamAName" defaultValue={match?.customTeamAName || ""} placeholder="Only if Team A isn't registered" />
          </Field>
          <Field label="Custom Team B name">
            <input className="input" name="customTeamBName" defaultValue={match?.customTeamBName || ""} placeholder="Only if Team B isn't registered" />
          </Field>
          <Field label="Team A players">
            <select className="input min-h-36" name="teamAPlayerIds" multiple defaultValue={defaults.teamAPlayerIds || []}>
              {players.map((player) => (
                <option key={player.id} value={player.id}>
                  {player.displayName}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Team B players">
            <select className="input min-h-36" name="teamBPlayerIds" multiple defaultValue={defaults.teamBPlayerIds || []}>
              {players.map((player) => (
                <option key={player.id} value={player.id}>
                  {player.displayName}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <span className="form-hint">Ctrl/Cmd-click to pick several. Players left unpicked are placed on a side automatically when their current team is Team A or B.</span>
      </div>

      <div className="form-section">
        <h3>Result</h3>
        <div className="grid gap-3 md:grid-cols-4">
          <Field label="Score A">
            <input className="input" type="number" min="0" name="scoreA" defaultValue={match?.scoreA ?? 0} />
          </Field>
          <Field label="Score B">
            <input className="input" type="number" min="0" name="scoreB" defaultValue={match?.scoreB ?? 0} />
          </Field>
          <Field label="Winner">
            <select className="input" name="winnerSide" defaultValue={match?.winnerSide || ""}>
              <option value="">None yet</option>
              <option value="A">Team A</option>
              <option value="B">Team B</option>
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
        <Field label="Played at">
          <input className="input" type="datetime-local" name="playedAt" defaultValue={dateTimeInput(match?.playedAt)} />
        </Field>
        <Field label="Maps">
          <textarea className="input min-h-24" name="mapsRaw" defaultValue={defaults.mapsRaw || ""} placeholder={"Bank | 7 | 5 | A\nClubhouse | 4 | 7 | B"} />
          <span className="form-hint">
            One map per line: <code>map | team A rounds | team B rounds | winner A/B</code>. Any map name works.
            {match ? " Editing keeps each map's stats; removing a line deletes that map." : ""}
          </span>
        </Field>
      </div>

      <div className="form-section">
        <h3>Player stats</h3>
        <Field label="Scoreboard">
          <textarea
            className="input min-h-44"
            name="bulkStatsRaw"
            defaultValue={defaults.bulkStatsRaw || ""}
            placeholder={"Fancy | 12 | 6 | 3 | 5 | 1.42\nSwerve2k | 9 | 8 | 2 | 4\n\n# Clubhouse\nFancy | 7 | 7 | 1 | 2 | 1.01"}
          />
          <span className="form-hint">
            One player per line: <code>player | kills | deaths | assists | headshots | rating | rounds</code>. Rating and rounds are optional (rounds default to
            the map score). Start a block with <code># MapName</code> or <code># Map 2</code> for multi-map matches. Names match display names, aliases or Discord
            usernames.
          </span>
        </Field>
        <Field label="Key moments">
          <textarea
            className="input min-h-24"
            name="keyMomentsRaw"
            defaultValue={defaults.keyMomentsRaw || ""}
            placeholder={"Fancy | Successful 1v4 clutch\nSwerve2k | 1v1 clutch failed"}
          />
          <span className="form-hint">
            <code>player | what happened</code>. Shows on the match page and the player&apos;s profile.
          </span>
        </Field>
      </div>

      <div className="form-section">
        <h3>Bans &amp; veto</h3>
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Operator bans">
            <textarea className="input min-h-28" name="operatorBans" defaultValue={match?.operatorBans.join("\n") || ""} placeholder={"A: Thermite\nB: Jäger\nKanine APEXIS bans Ash"} />
            <span className="form-hint">
              One per line. Prefix with <code>A:</code>/<code>B:</code> or &quot;Team bans X&quot; to show who banned it. Icons come from Settings.
            </span>
          </Field>
          <Field label="Map veto">
            <textarea className="input min-h-28" name="mapVetoes" defaultValue={match?.mapVetoes.join("\n") || ""} placeholder={"Team A bans Chalet\nTeam B picks Bank"} />
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
