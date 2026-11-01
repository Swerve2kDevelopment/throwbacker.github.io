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
import { closeSync, fstatSync, openSync, readFileSync, readSync } from "node:fs";
import { zstdDecompressSync } from "node:zlib";

const ZSTD_MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd]);
const FEEDBACK = Buffer.from("5934e58b04", "hex");
const KILL_INDICATOR = Buffer.from("22d9133cba", "hex");
const DEFUSER_TIMER = Buffer.from("22a9c858d9", "hex");
const SCOREBOARD_KILLS = Buffer.from("1cd2b19d", "hex");
const SCOREBOARD_ASSISTS = Buffer.from("4d737f9e", "hex");
const CLOCK = Buffer.from("1f07efc9", "hex");
const ROOM = Buffer.from("26af9899ca00000000", "hex");
const ROOM_OWNER = Buffer.from("26af9899ca0100000001001b", "hex");
const PLAYER_NAME = Buffer.from("225be84728", "hex");
const PLAYER_OPERATOR = Buffer.from("22a6b1018808", "hex");

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
      player = { id: value, name: "", team: 0, operator: "", operatorId: "" };
      players.push(player);
    } else if (key === "id" || key === "playlistcategory") player = null;

    if (player && key === "playername") player.name = value;
    else if (player && key === "team") player.team = Number(value);
    else if (player && key === "rolename") player.operator = value;
    // The same id the stream uses for each player's operator icon (see readOperators).
    else if (player && key === "roleimage") player.operatorId = value;
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

/**
 * Defuser plant and disable. Both use the same 7s countdown record, naming the
 * player at the defuser; it reaching 0.00 completes the action. The first
 * completion is the plant, a second one the defuse.
 */
function readDefuser(b) {
  const done = [];
  let player = null;
  for (const at of matches(b, DEFUSER_TIMER)) {
    const timer = readString(b, at + DEFUSER_TIMER.length);
    if (!timer.value || timer.value.length > 12) continue;
    player = findHandle(b, timer.next, timer.next + 64) || player;
    if (timer.value.startsWith("0.00") && player) {
      done.push({ at, handle: player });
      if (done.length === 2) break;
    }
  }
  return { plant: done[0] || null, defuse: done[1] || null };
}

/** The round clock: seconds left in the current phase (prep, action, or the defuser countdown). */
function readClock(b) {
  const samples = [];
  for (const at of matches(b, CLOCK)) samples.push([at, b.readUInt32LE(at + 5)]);
  return (offset) => {
    let lo = 0, hi = samples.length - 1, found = null;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (samples[mid][0] < offset) {
        found = samples[mid][1];
        lo = mid + 1;
      } else hi = mid - 1;
    }
    return found;
  };
}

/** Which named room each entity (players included) is in, in stream order. */
function readRooms(b) {
  const rooms = [];
  for (const at of matches(b, ROOM)) {
    const length = b[at + ROOM.length];
    const room = b.subarray(at + ROOM.length + 1, at + ROOM.length + 1 + length).toString();
    const owner = at + ROOM.length + 1 + length;
    if (!room || !b.subarray(owner, owner + ROOM_OWNER.length).equals(ROOM_OWNER)) continue;
    rooms.push({ at, room, handle: b.readUInt32LE(owner + ROOM_OWNER.length).toString(16) });
  }
  return rooms;
}

/** Each player's operator icon id for the round: the last non-zero value in their name record. */
function readOperators(b) {
  const byName = {};
  for (const at of matches(b, PLAYER_NAME)) {
    const name = readString(b, at + PLAYER_NAME.length);
    if (!name.value || name.value.length > 40 || !b.subarray(name.next, name.next + PLAYER_OPERATOR.length).equals(PLAYER_OPERATOR)) continue;
    const id = b.readBigUInt64LE(name.next + PLAYER_OPERATOR.length);
    if (id) byName[name.value] = id.toString();
  }
  return byName;
}

/** Header only, read from the start of the file without decompressing the round. */
export function readRoundHeader(file) {
  const fd = openSync(file, "r");
  try {
    const buf = Buffer.alloc(Math.min(fstatSync(fd).size, 2 * 1024 * 1024));
    readSync(fd, buf, 0, buf.length, 0);
    return readHeader(buf);
  } finally {
    closeSync(fd);
  }
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

  const clock = readClock(b);
  const rooms = readRooms(b);
  const roomOf = (handle, before) => rooms.filter((r) => r.handle === handle && r.at < before).at(-1)?.room || null;
  const firstRooms = {};
  for (const r of rooms) firstRooms[r.handle] ??= r.room;
  const { plant, defuse } = readDefuser(b);
  const action = (event) => event && { handle: event.handle, at: event.at, clock: clock(event.at), room: roomOf(event.handle, event.at) };

  return {
    ...header,
    kills: kills.map((k) => ({ ...k, clock: clock(k.at), postPlant: Boolean(plant && k.at > plant.at) })),
    handleVotes,
    assists: readCounters(b, SCOREBOARD_ASSISTS).filter((a) => a.handle && a.value > 0),
    planter: plant?.handle || null,
    plant: action(plant),
    defuse: action(defuse),
    operators: readOperators(b),
    firstRooms
  };
}
