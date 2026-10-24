"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { CheckCircle2, Loader2, Save, Sparkles, Wand2 } from "lucide-react";


type MatchSide = "A" | "B";
type MatchStatus = "SCHEDULED" | "LIVE" | "COMPLETED" | "CANCELLED";

type AiMapDraft = {
  mapName: string;
  teamAScore: number;
  teamBScore: number;
  winnerSide: MatchSide | null;
};

type AiStatDraft = {
  playerId: string;
  side: MatchSide;
  mapName: string;
  kills: number;
  deaths: number;
  assists: number;
  headshots: number;
  plants: number;
  defuses: number;
  oneVX: number;
  openingKills: number;
  openingDeaths: number;
  roundsPlayed: number;
  kostRounds: number;
  ratingOverride: number | null;
};

type AiMatchDraft = {
  tournamentId: string | null;
  customTeamAName: string;
  customTeamBName: string;
  format: number;
  scoreA: number;
  scoreB: number;
  winnerSide: MatchSide | null;
  status: MatchStatus;
  playedAt: string | null;
  teamAPlayerIds: string[];
  teamBPlayerIds: string[];
  maps: AiMapDraft[];
  stats: AiStatDraft[];
  notes: string[];
};

type PlayerOption = {
  id: string;
  displayName: string;
  aliases: string[];
};

type TournamentOption = {
  id: string;
  name: string;
  status: string;
};

type SaveResult = {
  matchId: string;
  matchUrl: string;
};

const examplePrompt = `Swerve2k and Potato beat The Big O and Frag 7-4 on Border.
It was a 2v2 standalone match today.
Swerve2k: 10 kills, 5 deaths, 2 assists, 4 headshots, 1.42 rating.
Potato: 7 kills, 6 deaths, 1 assist, 3 headshots.
The Big O: 6 kills, 8 deaths, 2 assists, 2 headshots.
Frag: 5 kills, 9 deaths, 3 assists, 1 headshot.`;

function playerLabel(playersById: Map<string, PlayerOption>, id: string) {
  return playersById.get(id)?.displayName || id;
}

async function readApi<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || "Request failed.");
  }
  return payload.data as T;
}

export function AiMatchHelperClient({
  players,
  tournaments
}: {
  players: PlayerOption[];
  tournaments: TournamentOption[];
}) {
  const [recap, setRecap] = useState("");
  const [draft, setDraft] = useState<AiMatchDraft | null>(null);
  const [error, setError] = useState("");
  const [isDrafting, setIsDrafting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<SaveResult | null>(null);

  const playersById = useMemo(() => new Map(players.map((player) => [player.id, player])), [players]);
  const tournamentById = useMemo(() => new Map(tournaments.map((tournament) => [tournament.id, tournament])), [tournaments]);

  async function generateDraft() {
    setError("");
    setSaveResult(null);
    setIsDrafting(true);

    try {
      const data = await readApi<{ draft: AiMatchDraft }>(
        await fetch("/api/admin/ai-helper/draft", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ recap })
        })
      );
      setDraft(data.draft);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not generate a draft.");
    } finally {
      setIsDrafting(false);
    }
  }

  async function saveDraft() {
    if (!draft) return;
    setError("");
    setIsSaving(true);

    try {
      const data = await readApi<SaveResult>(
        await fetch("/api/admin/ai-helper/save", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ draft })
        })
      );
      setSaveResult(data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save the draft.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
      <section className="panel p-4">
        <div className="mb-4 border-b border-metal-line pb-3">
          <p className="label text-metal-accent">AI Match Helper</p>
          <h2 className="mt-1 text-xl font-black">Turn a recap into match data</h2>
          <p className="mt-2 text-sm text-metal-muted">
            Paste the teams, score, map, and stat lines. The helper drafts the match first so you can review before saving.
          </p>
        </div>

        <div className="grid gap-3">
          <textarea
            className="input min-h-80 resize-y"
            value={recap}
            onChange={(event) => setRecap(event.target.value)}
            placeholder={examplePrompt}
          />
          <div className="subtle-panel p-3 text-xs leading-5 text-metal-muted">
            Any map name works. Use player names that already exist in the Players admin page so the AI can match them to IDs.
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="button button-primary" type="button" onClick={generateDraft} disabled={isDrafting || !recap.trim()}>
              {isDrafting ? <Loader2 size={16} className="animate-spin" /> : <Wand2 size={16} />}
              Generate draft
            </button>
            <button className="button" type="button" onClick={() => setRecap(examplePrompt)}>
              <Sparkles size={16} />
              Use example
            </button>
          </div>
        </div>
      </section>

      <section className="panel p-4">
        <div className="mb-4 border-b border-metal-line pb-3">
          <h2 className="text-xl font-black">Review Draft</h2>
          <p className="mt-1 text-sm text-metal-muted">Nothing is saved until you hit the save button.</p>
        </div>

        {error ? <div className="mb-4 border border-red-900 bg-red-950/40 p-3 text-sm font-bold text-red-100">{error}</div> : null}

        {saveResult ? (
          <div className="mb-4 flex flex-wrap items-center gap-3 border border-green-900 bg-green-950/30 p-3 text-sm font-bold text-green-100">
            <CheckCircle2 size={18} />
            Match saved.
            <Link className="underline hover:text-white" href={saveResult.matchUrl}>
              View public match
            </Link>
            <Link className="underline hover:text-white" href={`/admin/matches/${saveResult.matchId}`}>
              Edit in admin
            </Link>
          </div>
        ) : null}

        {!draft ? (
          <div className="subtle-panel p-5 text-sm text-metal-muted">
            Your generated match draft will appear here with players, maps, and stat rows.
          </div>
        ) : (
          <div className="grid gap-4">
            <div className="grid gap-3 md:grid-cols-3">
              <div className="subtle-panel p-3">
                <p className="label">Match</p>
                <p className="mt-1 font-black">
                  {draft.customTeamAName} vs {draft.customTeamBName}
                </p>
                <p className="text-sm text-metal-muted">
                  {draft.format}v{draft.format} · {draft.status}
                </p>
              </div>
              <div className="subtle-panel p-3">
                <p className="label">Score</p>
                <p className="mt-1 text-2xl font-black tabular-nums">
                  {draft.scoreA}-{draft.scoreB}
                </p>
                <p className="text-sm text-metal-muted">Winner: {draft.winnerSide || "None"}</p>
              </div>
              <div className="subtle-panel p-3">
                <p className="label">Tournament</p>
                <p className="mt-1 font-black">{draft.tournamentId ? tournamentById.get(draft.tournamentId)?.name || draft.tournamentId : "Standalone"}</p>
                <p className="text-sm text-metal-muted">{draft.playedAt ? new Date(draft.playedAt).toLocaleString("en-GB") : "No date supplied"}</p>
              </div>
            </div>

            {draft.notes.length ? (
              <div className="border border-amber-900 bg-amber-950/20 p-3 text-sm text-amber-100">
                <p className="font-black">Review notes</p>
                <ul className="mt-2 list-disc pl-5">
                  {draft.notes.map((note, index) => (
                    <li key={`${note}-${index}`}>{note}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="grid gap-3 md:grid-cols-2">
              <RosterBox title={draft.customTeamAName} ids={draft.teamAPlayerIds} playersById={playersById} />
              <RosterBox title={draft.customTeamBName} ids={draft.teamBPlayerIds} playersById={playersById} />
            </div>

            <div className="table-scroll">
              <table className="wiki-table">
                <thead>
                  <tr>
                    <th>Map</th>
                    <th className="numeric">Score</th>
                    <th className="numeric">Winner</th>
                  </tr>
                </thead>
                <tbody>
                  {draft.maps.map((map, index) => (
                    <tr key={`${map.mapName}-${index}`}>
                      <td>{map.mapName}</td>
                      <td className="numeric">
                        {map.teamAScore}-{map.teamBScore}
                      </td>
                      <td className="numeric">{map.winnerSide || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="table-scroll">
              <table className="wiki-table">
                <thead>
                  <tr>
                    <th>Player</th>
                    <th>Side</th>
                    <th>Map</th>
                    <th className="numeric">K</th>
                    <th className="numeric">D</th>
                    <th className="numeric">A</th>
                    <th className="numeric">HS</th>
                    <th className="numeric">Rating</th>
                  </tr>
                </thead>
                <tbody>
                  {draft.stats.length ? (
                    draft.stats.map((stat, index) => (
                      <tr key={`${stat.playerId}-${stat.mapName}-${index}`}>
                        <td>{playerLabel(playersById, stat.playerId)}</td>
                        <td>{stat.side}</td>
                        <td>{stat.mapName}</td>
                        <td className="numeric">{stat.kills}</td>
                        <td className="numeric">{stat.deaths}</td>
                        <td className="numeric">{stat.assists}</td>
                        <td className="numeric">{stat.headshots}</td>
                        <td className="numeric">{stat.ratingOverride ?? "-"}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={8} className="text-metal-muted">
                        No stat rows were detected.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <button className="button button-primary w-fit" type="button" onClick={saveDraft} disabled={isSaving}>
              {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              Save match and stats
            </button>
          </div>
        )}
      </section>
    </div>
  );
}

function RosterBox({
  title,
  ids,
  playersById
}: {
  title: string;
  ids: string[];
  playersById: Map<string, PlayerOption>;
}) {
  return (
    <div className="subtle-panel p-3">
      <p className="label">{title}</p>
      {ids.length ? (
        <ul className="mt-2 grid gap-1 text-sm">
          {ids.map((id) => (
            <li key={id} className="flex justify-between gap-3">
              <span>{playerLabel(playersById, id)}</span>
              <span className="text-xs text-metal-muted">{id.slice(0, 8)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-metal-muted">No players matched.</p>
      )}
    </div>
  );
}
