/**
 * Builds a stats upload from Siege match replays and optionally sends it to
 * /api/ingest/match. Needs Node 22.15+ (built-in zstd); no npm packages.
 *
 *   node scripts/replay-tracker/index.mjs                  newest match, printed only
 *   node scripts/replay-tracker/index.mjs --list           recorded matches with their ids
 *   node scripts/replay-tracker/index.mjs <id>...          one match id (or prefix) per map of a series
 *   node scripts/replay-tracker/index.mjs ... --rounds     also print the round-by-round breakdown
 *   node scripts/replay-tracker/index.mjs ... --upload     send it (needs OSCL_URL and OSCL_HOST_KEY)
 *
 * Recordings of the same match (other players' views, or a recording split
 * in two) are merged by match id. The replay folder defaults to the
 * Throwback install; override with --replays <dir> or OSCL_REPLAYS.
 */
import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import { createInterface } from "node:readline/promises";

import { readRoundHeader } from "./dissect.mjs";
import { groupByMatch, learnOperatorIds, readMatch, recFiles } from "./match.mjs";

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const option = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const replays = option("--replays") || process.env.OSCL_REPLAYS || "C:\\HM\\Downloads\\Y9S2_NewBlood\\MatchReplay";

const folders = readdirSync(replays)
  .map((name) => path.join(replays, name))
  .filter((dir) => statSync(dir).isDirectory())
  .sort((a, b) => statSync(a).mtimeMs - statSync(b).mtimeMs);
const groups = groupByMatch(folders);

if (flag("--list")) {
  for (const { matchId, folders: dirs } of groups) {
    const headers = dirs.flatMap((dir) => recFiles(dir).map(readRoundHeader));
    const last = headers.reduce((a, b) => (b.roundNumber > a.roundNumber ? b : a));
    const recorded = new Set(headers.map((h) => h.roundNumber)).size;
    const gap = recorded < last.roundNumber + 1 ? ` (${last.roundNumber + 1 - recorded} missing)` : "";
    console.log(`${matchId.slice(0, 8)}  ${last.playedAt?.toISOString().slice(0, 16).replace("T", " ")}  ${last.map.padEnd(16)} ${`${last.score[0]}-${last.score[1]}`.padEnd(6)} ${recorded} rounds${gap}, ${dirs.length} recording(s)`);
  }
  process.exit(0);
}

const optionValues = new Set(["--replays"].map(option).filter(Boolean));
const ids = args.filter((a) => !a.startsWith("--") && !optionValues.has(a));
const picked = ids.length ? ids.map((id) => groups.find((g) => g.matchId.startsWith(id))) : [groups.at(-1)];
if (picked.some((g) => !g)) {
  console.error(`No match found for: ${ids.filter((id, i) => !picked[i]).join(", ")}. Run with --list to see match ids.`);
  process.exit(1);
}

// Every header on disk names the defenders' operators, which teaches us their icon ids.
const knownOperators = learnOperatorIds(folders.flatMap((dir) => recFiles(dir).map(readRoundHeader)));
const matches = picked.map((g) => readMatch(g.folders, knownOperators));
const payload = {
  build: matches[0].build,
  playedAt: matches[0].playedAt,
  maps: matches.map((m) => m.map),
  operatorIds: Object.assign({}, ...matches.map((m) => m.operatorIds))
};
const reasons = { elimination: "eliminated", time: "time ran out", defuse: "defuser disabled", detonation: "defuser detonated" };

for (const [i, m] of matches.entries()) {
  console.error(`Map ${i + 1}: ${m.map.name} ${m.map.scoreA}-${m.map.scoreB}, ${m.rounds} rounds, match ${m.matchId.slice(0, 8)} (${m.folders.map((f) => path.basename(f)).join(" + ")})`);
  console.error(`  K-D    A  HS  plants  player`);
  for (const p of [...m.map.players].sort((a, b) => a.side.localeCompare(b.side) || b.kills - a.kills)) {
    console.error(`  ${`${p.kills}-${p.deaths}`.padEnd(7)}${String(p.assists).padEnd(3)}${String(p.headshots).padEnd(4)}${String(p.plants).padEnd(8)}${p.side} ${p.name}`);
  }
  if (m.unmapped.length) console.error(`  Couldn't link ${m.unmapped.join(", ")} to the scoreboard; their assists/plants may be missing`);
  for (const w of m.warnings) console.error(`  Warning: ${w}`);
  if (flag("--rounds")) {
    for (const r of m.map.rounds) {
      const plant = r.plant ? `, planted by ${r.plant.player} in ${r.plant.room || "?"} at ${r.plant.time}` : "";
      const defuse = r.defuse ? `, disabled by ${r.defuse.player} at ${r.defuse.time}` : "";
      console.error(`  R${r.number}: ${r.winner || "?"} won (${reasons[r.endReason] || "?"}), ${r.attackers} attacking, site ${r.site || "?"}${plant}${defuse}`);
      for (const k of r.kills) console.error(`      ${(k.postPlant ? "pp " : "") + (k.time || "?")}  ${k.killer || "(no killer)"} -> ${k.victim}${k.headshot ? " (HS)" : ""}${k.teamKill ? " [TEAM KILL]" : ""}`);
      const ops = r.operators.map((o) => `${o.player}=${o.operator || `#${o.operatorId || "?"}`}`);
      console.error(`      ops: ${ops.join(", ")}`);
    }
  }
}
console.log(JSON.stringify(payload, null, 2));

if (flag("--upload")) {
  // Ask in the terminal when the env vars aren't set, so the key never has to go in a command line.
  const ask = async (question) => {
    if (!process.stdin.isTTY) return "";
    const rl = createInterface({ input: process.stdin, output: process.stderr });
    const answer = await rl.question(question);
    rl.close();
    return answer.trim();
  };
  const url = process.env.OSCL_URL || (await ask("Site address (e.g. https://your-site): "));
  const key = process.env.OSCL_HOST_KEY || (await ask("Host key (oscl_host_...): "));
  if (!url || !key) {
    console.error("Set OSCL_URL (e.g. https://your-site) and OSCL_HOST_KEY to upload.");
    process.exit(1);
  }
  // fetch drops the Authorization header when a redirect changes host (e.g. example.com -> www.example.com),
  // so follow redirects by hand, and only between a domain and its www. form.
  let target = new URL("/api/ingest/match", url);
  let response;
  for (let hops = 0; hops < 3; hops++) {
    response = await fetch(target, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify(payload),
      redirect: "manual"
    });
    const location = response.headers.get("location");
    if (![301, 302, 307, 308].includes(response.status) || !location) break;
    const next = new URL(location, target);
    const bare = (host) => host.replace(/^www\./, "");
    if (next.protocol !== "https:" || bare(next.hostname) !== bare(target.hostname)) break;
    target = next;
  }
  console.error(`Upload: HTTP ${response.status}`, await response.text());
  // exitCode rather than exit(): exiting with fetch's socket still open crashes Node on Windows.
  if (!response.ok) process.exitCode = 1;
}
