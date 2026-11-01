/**
 * Reads one round of a Siege "dissect" match replay (.rec) from the Y9S2
 * Throwback build: the header, the kill feed, defuser plants and the
 * scoreboard assist counters.
 *
 * The layout follows r6-dissect (github.com/redraskal/r6-dissect), adjusted
 * for this build: its `code` header field is hex, there are no player
 * records r6-dissect can find, and players in the stream are referred to by
 * entity handles (0xF0xxxxxx) instead of names. Handles are matched to names
 * in match.mjs.
 */
import { readFileSync } from "node:fs";
import { zstdDecompressSync } from "node:zlib";

const ZSTD_MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd]);
const FEEDBACK = Buffer.from("5934e58b04", "hex");
const KILL_INDICATOR = Buffer.from("22d9133cba", "hex");
const DEFUSER_TIMER = Buffer.from("22a9c858d9", "hex");
const SCOREBOARD_KILLS = Buffer.from("1cd2b19d", "hex");
const SCOREBOARD_ASSISTS = Buffer.from("4d737f9e", "hex");

/** Most of the Y9S2 map pool, keyed by the header's worldid, named the way the site names maps. */
const MAPS = {
  837214085: "Clubhouse",
  1378191338: "Kafe Dostoyevsky",
  1460220617: "Kanal",
  1767965020: "Yacht",
  2609218856: "Presidential Plane",
  2609221242: "Consulate",
  2697268122: "Bartlett U",
  42090092951: "Coastline",
  53627213396: "Tower",
  88107330328: "Villa",
  126196841359: "Fortress",
  127951053400: "Hereford Base",
  199824623654: "Theme Park",
  231702797556: "Oregon",
  237873412352: "House",
  259816839773: "Chalet",
  270063334510: "Stadium Bravo",
  276279025182: "Skyscraper",
  305979357167: "Border",
  329867321446: "Favela",
  355496559878: "Bank",
  362605108559: "Outback",
  365284490964: "Emerald Plains",
  378595635123: "Nighthaven Labs",
  379218689149: "Consulate",
  388073319671: "Lair",
  405306299908: "Stadium"
};

function readHeader(buf) {
  if (buf.subarray(0, 7).toString() !== "dissect") throw new Error("Not a dissect replay");
  // Skip the versioning block: it ends after the second run of seven 0x00 bytes.
  let offset = 7;
  for (let zeros = 0, runs = 0; runs < 2; offset++) {
    if (buf[offset] === 0) {
      if (++zeros === 7) {
        zeros = 0;
        runs++;
      }
    } else zeros = 0;
  }

  const readString = () => {
    const length = buf[offset];
    offset += 8; // length byte + 7 zero bytes
    const value = buf.subarray(offset, offset + length).toString();
    offset += length;
    return value;
  };

  const props = {};
  const players = [];
  let player = null;
  while (!("teamscore1" in props) && offset < buf.length) {
    const key = readString();
    const value = readString();
    if (key === "playerid") {
      player = { id: value, name: "", team: 0, operator: "" };
      players.push(player);
    } else if (key === "id" || key === "playlistcategory") player = null;

    if (player && key === "playername") player.name = value;
    else if (player && key === "team") player.team = Number(value);
    else if (player && key === "rolename") player.operator = value;
    else if (!player) props[key] = value;
  }

  const [y, mo, d, h, mi, s] = (props.datetime || "").split("-");
  return {
    build: props.version || "",
    matchId: props.id || "",
    playedAt: y ? new Date(`${y}-${mo}-${d}T${h}:${mi}:${s}Z`) : undefined,
    map: MAPS[props.worldid] || `Unknown map ${props.worldid}`,
    roundNumber: Number(props.roundnumber || 0),
    score: [Number(props.teamscore0 || 0), Number(props.teamscore1 || 0)],
    players: players.filter((p) => p.name),
    end: offset
  };
}

/** Decompresses every zstd frame after the header into one buffer. */
function decompress(buf, from) {
  const starts = [];
  for (let i = buf.indexOf(ZSTD_MAGIC, from); i !== -1; i = buf.indexOf(ZSTD_MAGIC, i + 4)) starts.push(i);
  const parts = [];
  for (let k = 0; k < starts.length; k++) {
    // A frame can be followed by a few bytes of chunk framing, and the magic can
    // appear inside compressed data, so trim the tail and widen to the next start if needed.
    let out = null;
    for (let next = k + 1; !out && next <= Math.min(k + 2, starts.length); next++) {
      const end = next < starts.length ? starts[next] : buf.length;
      for (let e = end; e > end - 64 && e > starts[k] + 8; e--) {
        try {
          out = zstdDecompressSync(buf.subarray(starts[k], e));
          if (next > k + 1) k = next - 1;
          break;
        } catch {
          // try a shorter slice
        }
      }
    }
    if (out) parts.push(out);
  }
  return Buffer.concat(parts);
}

/** The first entity handle (tag 0x1b + u64 0x00000000F0xxxxxx) in [from, to). */
function findHandle(b, from, to) {
  for (let i = from; i < to && i + 9 <= b.length; i++) {
    if (b[i] === 0x1b && b[i + 4] === 0xf0 && b.readUInt32LE(i + 5) === 0) return b.readUInt32LE(i + 1).toString(16);
  }
  return null;
}

function* matches(b, pattern) {
  for (let i = b.indexOf(pattern); i !== -1; i = b.indexOf(pattern, i + 1)) yield i;
}

function readString(b, at) {
  const length = b[at];
  return { value: b.subarray(at + 1, at + 1 + length).toString(), next: at + 1 + length };
}

function readKillFeed(b) {
  const events = [];
  for (const at of matches(b, FEEDBACK)) {
    let o = at + FEEDBACK.length + 38;
    if (b[o] !== 0 || !b.subarray(o + 1, o + 6).equals(KILL_INDICATOR)) continue;
    const killer = readString(b, o + 6);
    const target = readString(b, killer.next + 15);
    if (!target.value) continue;
    events.push({ at, killer: killer.value, target: target.value, headshot: b[target.next + 56] === 1 });
  }
  return events;
}

function readCounters(b, pattern) {
  const out = [];
  for (const at of matches(b, pattern)) {
    out.push({ at, value: b.readUInt32LE(at + 5), handle: findHandle(b, at + 9, at + 48) });
  }
  return out;
}

/** Returns the planter's handle if a defuser plant completed this round. */
function readPlant(b) {
  let planter = null;
  for (const at of matches(b, DEFUSER_TIMER)) {
    const timer = readString(b, at + DEFUSER_TIMER.length);
    if (!timer.value || timer.value.length > 12) continue;
    planter = findHandle(b, timer.next, timer.next + 64) || planter;
    // The countdown reaching 0.00 means the plant finished; anything after is the defuse timer.
    if (timer.value.startsWith("0.00")) return planter;
  }
  return null;
}

/** Header only, without decompressing the round. */
export function readRoundHeader(file) {
  return readHeader(readFileSync(file));
}

export function readRound(file) {
  const buf = readFileSync(file);
  const header = readHeader(buf);
  const b = decompress(buf, header.end);

  // Kill feed entries repeat; nobody dies twice in a round, so keep the first per victim.
  const seen = new Set();
  const kills = readKillFeed(b).filter((k) => !seen.has(k.target) && seen.add(k.target));
  const scoreboardKills = readCounters(b, SCOREBOARD_KILLS);

  // A scoreboard kill update lands just before its kill feed entry: that pairs a handle with a name.
  const handleVotes = [];
  for (const kill of kills) {
    const update = scoreboardKills.filter((u) => u.handle && u.at < kill.at && kill.at - u.at < 0x10000).at(-1);
    if (update && kill.killer) handleVotes.push({ handle: update.handle, name: kill.killer });
  }

  return {
    ...header,
    kills,
    handleVotes,
    assists: readCounters(b, SCOREBOARD_ASSISTS).filter((a) => a.handle && a.value > 0),
    planter: readPlant(b)
  };
}
