/**
 * Turns the recordings of one match (one .rec per round, possibly spread over
 * several folders) into one map of the /api/ingest/match payload.
 */
import { readdirSync } from "node:fs";
import path from "node:path";

import { readRound, readRoundHeader } from "./dissect.mjs";

/**
 * Picks each handle's most common name, then fills one gap per team by
 * elimination. Handles are entity ids, so this runs per recording: another
 * player's client may number them differently.
 */
function resolveHandles(rounds, roster) {
  const votes = new Map();
  for (const { handle, name } of rounds.flatMap((r) => r.handleVotes)) {
    const tally = votes.get(handle) || new Map();
    tally.set(name, (tally.get(name) || 0) + 1);
    votes.set(handle, tally);
  }
  const names = new Map();
  for (const [handle, tally] of votes) names.set(handle, [...tally].sort((a, b) => b[1] - a[1])[0][0]);

  // Handles are allocated per team in a block (e.g. ...a0b7-a0bb and ...a108-a10c).
  const allHandles = new Set([...votes.keys(), ...rounds.flatMap((r) => [r.planter, ...r.assists.map((a) => a.handle)]).filter(Boolean)]);
  for (const team of [0, 1]) {
    const teamNames = roster.filter((p) => p.team === team).map((p) => p.name);
    const known = [...names].filter(([, n]) => teamNames.includes(n)).map(([h]) => parseInt(h, 16));
    if (!known.length) continue;
    const near = (h) => known.some((k) => Math.abs(parseInt(h, 16) - k) <= 8);
    const freeHandles = [...allHandles].filter((h) => !names.has(h) && near(h));
    const freeNames = teamNames.filter((n) => ![...names.values()].includes(n));
    if (freeHandles.length === 1 && freeNames.length === 1) names.set(freeHandles[0], freeNames[0]);
  }
  return names;
}

export function recFiles(dir) {
  return readdirSync(dir).filter((f) => f.toLowerCase().endsWith(".rec")).sort().map((f) => path.join(dir, f));
}

/** Groups match folders by the match id in their headers, oldest match first. */
export function groupByMatch(dirs) {
  const groups = new Map();
  for (const dir of dirs) {
    const files = recFiles(dir);
    if (!files.length) continue;
    const id = readRoundHeader(files[0]).matchId || dir;
    groups.set(id, [...(groups.get(id) || []), dir]);
  }
  return [...groups].map(([matchId, folders]) => ({ matchId, folders }));
}

export function readMatch(folders) {
  // Read the fullest recording first so its copy of each round wins.
  const sources = folders.map((dir) => ({ dir, files: recFiles(dir) })).sort((a, b) => b.files.length - a.files.length);
  const byNumber = new Map();
  for (const source of sources) {
    const fresh = source.files.filter((f) => !byNumber.has(readRoundHeader(f).roundNumber));
    for (const file of fresh) {
      const round = readRound(file);
      byNumber.set(round.roundNumber, { ...round, source: source.dir });
    }
  }
  const rounds = [...byNumber.values()].sort((a, b) => a.roundNumber - b.roundNumber);
  if (!rounds.length) throw new Error(`No .rec files in ${folders.join(", ")}`);
  const last = rounds.at(-1);

  // Each round header lists only the defending five, so the roster comes from all rounds together.
  const roster = new Map();
  for (const p of rounds.flatMap((r) => r.players)) roster.set(p.name, { name: p.name, team: p.team });

  const handlesBySource = new Map();
  for (const dir of new Set(rounds.map((r) => r.source))) {
    handlesBySource.set(dir, resolveHandles(rounds.filter((r) => r.source === dir), [...roster.values()]));
  }
  const nameOf = (round, handle) => handlesBySource.get(round.source).get(handle);

  const blank = () => ({ kills: 0, deaths: 0, assists: 0, headshots: 0, plants: 0 });
  const stats = new Map([...roster.keys()].map((n) => [n, blank()]));
  const statFor = (name) => stats.get(name) || (stats.set(name, blank()), stats.get(name));
  const warnings = [];

  const recorded = new Set(rounds.map((r) => r.roundNumber));
  const missing = [...Array(last.roundNumber + 1).keys()].filter((n) => !recorded.has(n)).map((n) => n + 1);
  if (missing.length) warnings.push(`Rounds ${missing.join(", ")} were not recorded, so these stats are incomplete`);

  for (const round of rounds) {
    for (const kill of round.kills) {
      statFor(kill.target).deaths++;
      if (!kill.killer) continue;
      const killerTeam = roster.get(kill.killer)?.team;
      // Team kills don't count as kills on the scoreboard.
      if (killerTeam !== undefined && killerTeam === roster.get(kill.target)?.team) continue;
      statFor(kill.killer).kills++;
      if (kill.headshot) statFor(kill.killer).headshots++;
    }
    if (round.planter) {
      const name = nameOf(round, round.planter);
      if (name) statFor(name).plants++;
      else warnings.push(`Round ${round.roundNumber + 1}: plant by a player whose name couldn't be matched`);
    }
  }

  // Assist counters are running match totals, so the highest value per player is the total.
  // With partial recordings that is still right: a later round carries the earlier assists.
  for (const round of rounds) {
    for (const a of round.assists) {
      const name = nameOf(round, a.handle);
      if (name && a.value < 100) statFor(name).assists = Math.max(statFor(name).assists, a.value);
    }
  }

  const mapped = new Set([...handlesBySource.values()].flatMap((m) => [...m.values()]));
  return {
    build: last.build,
    playedAt: rounds[0].playedAt,
    map: {
      name: last.map,
      scoreA: last.score[0],
      scoreB: last.score[1],
      players: [...stats].map(([name, s]) => ({ name, side: roster.get(name)?.team === 1 ? "B" : "A", ...s, rounds: rounds.length }))
    },
    rounds: rounds.length,
    matchId: last.matchId,
    folders: sources.map((s) => s.dir),
    unmapped: [...roster.keys()].filter((n) => !mapped.has(n)),
    warnings
  };
}
