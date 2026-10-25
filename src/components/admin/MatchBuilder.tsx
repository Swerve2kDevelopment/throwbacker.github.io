"use client";

import { ClipboardPaste, Plus, Search, Trash2, UserPlus, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { normalizeName, parseBulkStats } from "@/lib/match-entry";
import { COMMON_MAPS } from "@/lib/match-utils";
import { ATTACKERS, DEFENDERS } from "@/lib/operators";

/**
 * Interactive part of the match form: rosters, maps, a scoreboard grid per map
 * and operator bans. It writes the same field names the server already parses
 * (teamAPlayerIds, mapsRaw, bulkStatsRaw, operatorBans...), so saving goes
 * through the existing, tested pipeline.
 */

export type BuilderPlayer = {
  id: string;
  displayName: string;
  realName: string | null;
  avatarUrl: string | null;
  currentTeamId: string | null;
  aliases: string[];
};
export type BuilderTeam = { id: string; name: string; tag: string | null; logoUrl: string | null };
export type BuilderOperator = { name: string; iconPath: string | null };
export type StatCell = { k: string; d: string; a: string; hs: string; rating: string; rounds: string };
type Side = "A" | "B";
type MapRow = { key: string; name: string; a: string; b: string };

export type MatchBuilderInitial = {
  format: number;
  teamAId: string;
  teamBId: string;
  customTeamAName: string;
  customTeamBName: string;
  teamAPlayerIds: string[];
  teamBPlayerIds: string[];
  maps: MapRow[];
  stats: Record<string, Record<string, StatCell>>;
  scoreA: number;
  scoreB: number;
  winnerSide: string;
  bans: Array<{ operator: string; side: Side | null }>;
};

const emptyCell: StatCell = { k: "", d: "", a: "", hs: "", rating: "", rounds: "" };
const newKey = () => Math.random().toString(36).slice(2, 10);

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function Avatar({ player }: { player: BuilderPlayer }) {
  return (
    <span className="avatar">
      {initials(player.displayName)}
      {player.avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img alt="" src={player.avatarUrl} />
      ) : null}
    </span>
  );
}

function num(value: string) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function PlayerSearch({
  players,
  taken,
  onPick,
  placeholder
}: {
  players: BuilderPlayer[];
  taken: Set<string>;
  onPick: (id: string) => void;
  placeholder: string;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);

  const results = useMemo(() => {
    const q = normalizeName(query);
    return players
      .filter((player) => !taken.has(player.id))
      .filter((player) => !q || [player.displayName, player.realName || "", ...player.aliases].some((name) => normalizeName(name).includes(q)))
      .slice(0, 8);
  }, [players, taken, query]);

  const pick = (id: string) => {
    onPick(id);
    setQuery("");
    setHighlight(0);
  };

  return (
    <div className="mb-search">
      <Search size={15} className="mb-search-icon" />
      <input
        className="input"
        value={query}
        placeholder={placeholder}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
          setHighlight(0);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setHighlight((value) => Math.min(value + 1, results.length - 1));
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setHighlight((value) => Math.max(value - 1, 0));
          } else if (event.key === "Enter") {
            event.preventDefault();
            if (results[highlight]) pick(results[highlight].id);
          } else if (event.key === "Escape") {
            setOpen(false);
          }
        }}
      />
      {open && results.length ? (
        <div className="mb-search-list" role="listbox">
          {results.map((player, index) => (
            <button
              key={player.id}
              type="button"
              role="option"
              aria-selected={index === highlight}
              className="mb-search-item"
              onMouseDown={(event) => {
                event.preventDefault();
                pick(player.id);
              }}
              onMouseEnter={() => setHighlight(index)}
            >
              <Avatar player={player} />
              <span className="min-w-0">
                <strong>{player.displayName}</strong>
                {player.realName ? <em>{player.realName}</em> : null}
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function MatchBuilder({
  players,
  teams,
  operators,
  initial,
  isEdit
}: {
  players: BuilderPlayer[];
  teams: BuilderTeam[];
  operators: BuilderOperator[];
  initial: MatchBuilderInitial;
  isEdit: boolean;
}) {
  const playerById = useMemo(() => new Map(players.map((player) => [player.id, player])), [players]);
  const [format, setFormat] = useState(initial.format);
  const [teamId, setTeamId] = useState<Record<Side, string>>({ A: initial.teamAId, B: initial.teamBId });
  const [customName, setCustomName] = useState<Record<Side, string>>({ A: initial.customTeamAName, B: initial.customTeamBName });
  const [roster, setRoster] = useState<Record<Side, string[]>>({ A: initial.teamAPlayerIds, B: initial.teamBPlayerIds });
  const [maps, setMaps] = useState<MapRow[]>(initial.maps.length ? initial.maps : [{ key: newKey(), name: "", a: "", b: "" }]);
  const [stats, setStats] = useState(initial.stats);
  const [activeMap, setActiveMap] = useState(maps[0]?.key);
  const [showRounds, setShowRounds] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [pasteNote, setPasteNote] = useState("");
  const [bans, setBans] = useState(initial.bans);
  const [banSide, setBanSide] = useState<Side | null>("A");
  const [opQuery, setOpQuery] = useState("");
  const [opTab, setOpTab] = useState<"attack" | "defence">("attack");

  const computed = useMemo(() => {
    const played = maps.filter((map) => map.a !== "" || map.b !== "");
    if (!played.length) return null;
    if (played.length === 1) {
      const a = num(played[0].a);
      const b = num(played[0].b);
      return { a, b, winner: a > b ? "A" : b > a ? "B" : "" };
    }
    const a = played.filter((map) => num(map.a) > num(map.b)).length;
    const b = played.filter((map) => num(map.b) > num(map.a)).length;
    return { a, b, winner: a > b ? "A" : b > a ? "B" : "" };
  }, [maps]);

  const initialMatchesComputed = !computed || (computed.a === initial.scoreA && computed.b === initial.scoreB);
  const [autoResult, setAutoResult] = useState(!isEdit || initialMatchesComputed);
  const [scoreA, setScoreA] = useState(String(initial.scoreA));
  const [scoreB, setScoreB] = useState(String(initial.scoreB));
  const [winner, setWinner] = useState(initial.winnerSide);

  useEffect(() => {
    if (!autoResult || !computed) return;
    setScoreA(String(computed.a));
    setScoreB(String(computed.b));
    setWinner(computed.winner);
  }, [autoResult, computed]);

  useEffect(() => {
    if (!maps.some((map) => map.key === activeMap)) setActiveMap(maps[0]?.key);
  }, [maps, activeMap]);

  const taken = useMemo(() => new Set([...roster.A, ...roster.B]), [roster]);
  const teamRoster = (id: string) => players.filter((player) => player.currentTeamId === id && !taken.has(player.id)).map((player) => player.id);
  const teamName = (side: Side) => customName[side] || teams.find((team) => team.id === teamId[side])?.name || `Team ${side}`;

  const addPlayer = (side: Side, id: string) => setRoster((current) => ({ ...current, [side]: [...current[side].filter((item) => item !== id), id] }));
  const removePlayer = (side: Side, id: string) => setRoster((current) => ({ ...current, [side]: current[side].filter((item) => item !== id) }));
  const swapPlayer = (side: Side, id: string) => {
    const other: Side = side === "A" ? "B" : "A";
    setRoster((current) => ({ ...current, [side]: current[side].filter((item) => item !== id), [other]: [...current[other], id] }));
  };

  const changeTeam = (side: Side, id: string) => {
    setTeamId((current) => ({ ...current, [side]: id }));
    // Picking a team on an empty side fills in its current roster.
    if (id && !roster[side].length) {
      const ids = teamRoster(id);
      if (ids.length) setRoster((current) => ({ ...current, [side]: ids }));
    }
  };

  const setCell = (mapKey: string, playerId: string, field: keyof StatCell, value: string) => {
    setStats((current) => ({
      ...current,
      [mapKey]: { ...current[mapKey], [playerId]: { ...emptyCell, ...current[mapKey]?.[playerId], [field]: value } }
    }));
  };

  const applyPaste = () => {
    const rows = parseBulkStats(pasteText);
    const byName = new Map<string, string>();
    for (const player of players) {
      for (const name of [player.id, player.displayName, ...player.aliases]) {
        const key = normalizeName(name);
        if (key && !byName.has(key)) byName.set(key, player.id);
      }
    }

    const unknown: string[] = [];
    const unsided: string[] = [];
    const nextRoster = { A: [...roster.A], B: [...roster.B] };
    const nextStats = { ...stats };
    for (const row of rows) {
      const id = byName.get(normalizeName(row.name));
      if (!id) {
        unknown.push(row.name);
        continue;
      }
      if (!nextRoster.A.includes(id) && !nextRoster.B.includes(id)) {
        const current = playerById.get(id)?.currentTeamId;
        if (current && current === teamId.A) nextRoster.A.push(id);
        else if (current && current === teamId.B) nextRoster.B.push(id);
        else {
          unsided.push(row.name);
          continue;
        }
      }
      const ref = row.mapRef;
      const map = ref ? (ref.order ? maps[ref.order - 1] : maps.find((item) => normalizeName(item.name) === normalizeName(ref.name || ""))) : maps.find((item) => item.key === activeMap);
      const mapKey = map?.key || activeMap;
      if (!mapKey) continue;
      nextStats[mapKey] = {
        ...nextStats[mapKey],
        [id]: {
          k: String(row.kills),
          d: String(row.deaths),
          a: String(row.assists),
          hs: String(row.headshots),
          rating: row.rating === null ? "" : String(row.rating),
          rounds: row.rounds === null ? "" : String(row.rounds)
        }
      };
    }

    setRoster(nextRoster);
    setStats(nextStats);
    const notes = [
      `${rows.length - unknown.length - unsided.length} line${rows.length === 1 ? "" : "s"} filled in.`,
      unknown.length ? `Unknown: ${unknown.join(", ")}.` : "",
      unsided.length ? `Add to a team first: ${unsided.join(", ")}.` : ""
    ];
    setPasteNote(notes.filter(Boolean).join(" "));
    if (!unknown.length && !unsided.length) {
      setPasteText("");
      setPasteOpen(false);
    }
  };

  // ---- Hidden form outputs ----
  const mapsRaw = maps
    .filter((map) => map.name.trim())
    .map((map) => {
      const a = num(map.a);
      const b = num(map.b);
      return [map.name.trim(), a, b, a > b ? "A" : b > a ? "B" : ""].join(" | ").replace(/ \| $/, "");
    })
    .join("\n");
  const namedMaps = maps.filter((map) => map.name.trim());
  const statsMaps = namedMaps.length ? namedMaps : maps.slice(0, 1);
  const bulkStatsRaw = statsMaps
    .map((map, index) => {
      const lines = [...roster.A, ...roster.B]
        .map((id) => ({ id, cell: stats[map.key]?.[id] }))
        .filter(({ cell }) => cell && [cell.k, cell.d, cell.a, cell.hs, cell.rating].some((value) => value.trim() !== ""))
        .map(({ id, cell }) => [id, num(cell!.k), num(cell!.d), num(cell!.a), num(cell!.hs), cell!.rating.trim(), cell!.rounds.trim()].join(" | "));
      if (!lines.length) return "";
      return statsMaps.length > 1 ? [`# Map ${index + 1}`, ...lines].join("\n") : lines.join("\n");
    })
    .filter(Boolean)
    .join("\n\n");
  const operatorBansRaw = bans.map((ban) => (ban.side ? `${ban.side}: ${ban.operator}` : ban.operator)).join("\n");

  // ---- Operators ----
  const iconFor = useMemo(() => new Map(operators.map((operator) => [normalizeName(operator.name), operator.iconPath])), [operators]);
  const operatorPool = useMemo(() => {
    const base = opTab === "attack" ? [...ATTACKERS] : [...DEFENDERS];
    const listed = new Set([...ATTACKERS, ...DEFENDERS].map(normalizeName));
    // Operators with an uploaded icon but not in the built-in list show on both tabs.
    const extra = operators.map((operator) => operator.name).filter((name) => !listed.has(normalizeName(name)));
    const q = normalizeName(opQuery);
    return [...base, ...extra].filter((name) => !q || normalizeName(name).includes(q));
  }, [opTab, opQuery, operators]);
  const isBanned = (name: string) => bans.some((ban) => normalizeName(ban.operator) === normalizeName(name));
  const toggleBan = (name: string) => {
    setBans((current) =>
      current.some((ban) => normalizeName(ban.operator) === normalizeName(name))
        ? current.filter((ban) => normalizeName(ban.operator) !== normalizeName(name))
        : [...current, { operator: name, side: banSide }]
    );
  };

  const activeMapIndex = Math.max(0, maps.findIndex((map) => map.key === activeMap));
  const sideRows = (side: Side) => roster[side].map((id) => playerById.get(id)).filter((player): player is BuilderPlayer => Boolean(player));

  return (
    <>
      <input type="hidden" name="format" value={format} />
      <input type="hidden" name="statsReplace" value="on" />
      {roster.A.map((id) => (
        <input key={`a-${id}`} type="hidden" name="teamAPlayerIds" value={id} />
      ))}
      {roster.B.map((id) => (
        <input key={`b-${id}`} type="hidden" name="teamBPlayerIds" value={id} />
      ))}
      <textarea name="mapsRaw" value={mapsRaw} readOnly hidden />
      <textarea name="bulkStatsRaw" value={bulkStatsRaw} readOnly hidden />
      <textarea name="operatorBans" value={operatorBansRaw} readOnly hidden />
      <datalist id="mb-maps">
        {COMMON_MAPS.map((map) => (
          <option key={map} value={map} />
        ))}
      </datalist>

      {/* ---------- Teams ---------- */}
      <div className="form-section">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3>Teams &amp; players</h3>
          <div className="mb-segment" role="group" aria-label="Format">
            {[1, 2, 3, 4, 5].map((size) => (
              <button key={size} type="button" aria-pressed={format === size} onClick={() => setFormat(size)}>
                {size}v{size}
              </button>
            ))}
          </div>
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          {(["A", "B"] as const).map((side) => {
            const rows = sideRows(side);
            const rosterFromTeam = teamId[side] ? teamRoster(teamId[side]) : [];
            return (
              <div key={side} className="mb-side">
                <div className="mb-side-head">
                  <span className="mb-side-badge">{side}</span>
                  <select className="input" name={`team${side}Id`} value={teamId[side]} onChange={(event) => changeTeam(side, event.target.value)}>
                    <option value="">No registered team</option>
                    {teams.map((team) => (
                      <option key={team.id} value={team.id}>
                        {team.name}
                      </option>
                    ))}
                  </select>
                </div>
                <input
                  className="input"
                  name={`customTeam${side}Name`}
                  value={customName[side]}
                  onChange={(event) => setCustomName((current) => ({ ...current, [side]: event.target.value }))}
                  placeholder={teamId[side] ? "Display name (optional)" : `Side name, e.g. ${side === "A" ? "Red Side" : "Black Side"}`}
                />
                <PlayerSearch players={players} taken={taken} onPick={(id) => addPlayer(side, id)} placeholder={`Add a player to ${teamName(side)}…`} />
                {rosterFromTeam.length ? (
                  <button
                    type="button"
                    className="button button-ghost w-fit text-sm"
                    onClick={() => setRoster((current) => ({ ...current, [side]: [...current[side], ...rosterFromTeam] }))}
                  >
                    <UserPlus size={15} />
                    Add {teams.find((team) => team.id === teamId[side])?.name} roster ({rosterFromTeam.length})
                  </button>
                ) : null}
                <div className="mb-roster">
                  {rows.length ? (
                    rows.map((player) => (
                      <span key={player.id} className="mb-chip">
                        <Avatar player={player} />
                        <span className="truncate">{player.displayName}</span>
                        <button type="button" title={`Move to Team ${side === "A" ? "B" : "A"}`} onClick={() => swapPlayer(side, player.id)}>
                          ⇄
                        </button>
                        <button type="button" title="Remove" onClick={() => removePlayer(side, player.id)}>
                          <X size={13} />
                        </button>
                      </span>
                    ))
                  ) : (
                    <span className="form-hint">No players yet.</span>
                  )}
                </div>
                <span className={`form-hint${rows.length > format ? " text-amber-300" : ""}`}>
                  {rows.length}/{format} players{rows.length > format ? ` · a ${format}v${format} can't have more than ${format}` : ""}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* ---------- Maps & result ---------- */}
      <div className="form-section">
        <h3>Maps &amp; result</h3>
        <div className="grid gap-2">
          <div className="mb-map-row mb-map-head">
            <span>Map</span>
            <span>{teamName("A")}</span>
            <span>{teamName("B")}</span>
            <span />
          </div>
          {maps.map((map, index) => (
            <div key={map.key} className="mb-map-row">
              <input
                className="input"
                list="mb-maps"
                value={map.name}
                placeholder={`Map ${index + 1}`}
                onChange={(event) => setMaps((current) => current.map((item) => (item.key === map.key ? { ...item, name: event.target.value } : item)))}
              />
              {(["a", "b"] as const).map((field) => (
                <input
                  key={field}
                  className={`input text-center ${map.a !== "" && map.b !== "" && num(map[field]) > num(map[field === "a" ? "b" : "a"]) ? "mb-win" : ""}`}
                  type="number"
                  min="0"
                  inputMode="numeric"
                  value={map[field]}
                  placeholder="0"
                  onChange={(event) => setMaps((current) => current.map((item) => (item.key === map.key ? { ...item, [field]: event.target.value } : item)))}
                />
              ))}
              <button
                type="button"
                className="button button-ghost"
                title="Remove map"
                disabled={maps.length === 1}
                onClick={() => setMaps((current) => current.filter((item) => item.key !== map.key))}
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}
          <button
            type="button"
            className="button w-fit"
            onClick={() => {
              const key = newKey();
              setMaps((current) => [...current, { key, name: "", a: "", b: "" }]);
              setActiveMap(key);
            }}
          >
            <Plus size={15} />
            Add map
          </button>
        </div>

        <div className="mb-result">
          <label className="grid gap-1">
            <span className="label">{teamName("A")}</span>
            <input className="input text-center" type="number" min="0" name="scoreA" value={scoreA} readOnly={autoResult} onChange={(event) => setScoreA(event.target.value)} />
          </label>
          <span className="mb-result-dash">–</span>
          <label className="grid gap-1">
            <span className="label">{teamName("B")}</span>
            <input className="input text-center" type="number" min="0" name="scoreB" value={scoreB} readOnly={autoResult} onChange={(event) => setScoreB(event.target.value)} />
          </label>
          <label className="grid gap-1">
            <span className="label">Winner</span>
            <select className="input" name="winnerSide" value={winner} disabled={autoResult} onChange={(event) => setWinner(event.target.value)}>
              <option value="">None yet</option>
              <option value="A">{teamName("A")}</option>
              <option value="B">{teamName("B")}</option>
            </select>
            {autoResult ? <input type="hidden" name="winnerSide" value={winner} /> : null}
          </label>
          <label className="check-row self-end pb-2">
            <input type="checkbox" checked={autoResult} onChange={(event) => setAutoResult(event.target.checked)} />
            Work out from maps
          </label>
        </div>
        <span className="form-hint">One map: the score is the round count. Several maps: the score is maps won.</span>
      </div>

      {/* ---------- Scoreboard ---------- */}
      <div className="form-section">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3>Scoreboard</h3>
          <div className="flex flex-wrap items-center gap-2">
            <label className="check-row">
              <input type="checkbox" checked={showRounds} onChange={(event) => setShowRounds(event.target.checked)} />
              Rounds column
            </label>
            <button type="button" className="button" onClick={() => setPasteOpen((value) => !value)}>
              <ClipboardPaste size={15} />
              Paste scoreboard
            </button>
          </div>
        </div>

        {pasteOpen ? (
          <div className="mb-paste">
            <textarea
              className="input min-h-28"
              value={pasteText}
              onChange={(event) => setPasteText(event.target.value)}
              placeholder={"Fancy | 12 | 6 | 3 | 5 | 1.42\nSwerve2k | 9 | 8 | 2 | 4"}
            />
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" className="button button-primary" onClick={applyPaste} disabled={!pasteText.trim()}>
                Fill the grid
              </button>
              <span className="form-hint">
                <code>player | kills | deaths | assists | headshots | rating</code>. Fills the selected map, or use <code># Map 2</code> headings.
              </span>
            </div>
            {pasteNote ? <span className="form-hint text-metal-text">{pasteNote}</span> : null}
          </div>
        ) : null}

        {maps.length > 1 ? (
          <div className="tabs-list" role="tablist" style={{ marginBottom: 0 }}>
            {maps.map((map, index) => (
              <button key={map.key} type="button" role="tab" className="tab-button" aria-selected={map.key === activeMap} onClick={() => setActiveMap(map.key)}>
                {map.name || `Map ${index + 1}`}
              </button>
            ))}
          </div>
        ) : null}

        {roster.A.length || roster.B.length ? (
          <div className="table-scroll">
            <table className="wiki-table mb-scoreboard">
              <thead>
                <tr>
                  <th>{maps.length > 1 ? maps[activeMapIndex]?.name || `Map ${activeMapIndex + 1}` : "Player"}</th>
                  <th className="numeric">K</th>
                  <th className="numeric">D</th>
                  <th className="numeric">A</th>
                  <th className="numeric">HS</th>
                  <th className="numeric">Rating</th>
                  {showRounds ? <th className="numeric">Rounds</th> : null}
                  <th className="numeric">K/D</th>
                </tr>
              </thead>
              {(["A", "B"] as const).map((side) => {
                const rows = sideRows(side);
                if (!rows.length) return null;
                const mapKey = maps[activeMapIndex]?.key || "";
                const totals = rows.reduce(
                  (sum, player) => {
                    const cell = stats[mapKey]?.[player.id];
                    return { k: sum.k + num(cell?.k || ""), d: sum.d + num(cell?.d || ""), a: sum.a + num(cell?.a || "") };
                  },
                  { k: 0, d: 0, a: 0 }
                );
                return (
                  <tbody key={side}>
                    <tr className="mb-side-row">
                      <td colSpan={showRounds ? 8 : 7}>
                        <span className="mb-side-badge">{side}</span> {teamName(side)}
                        <span className="ml-2 text-metal-muted">
                          {totals.k}/{totals.d}/{totals.a}
                        </span>
                      </td>
                    </tr>
                    {rows.map((player) => {
                      const cell = stats[mapKey]?.[player.id] || emptyCell;
                      const kd = cell.k !== "" && cell.d !== "" ? (num(cell.d) ? (num(cell.k) / num(cell.d)).toFixed(2) : num(cell.k).toFixed(2)) : "–";
                      const fields: Array<keyof StatCell> = showRounds ? ["k", "d", "a", "hs", "rating", "rounds"] : ["k", "d", "a", "hs", "rating"];
                      return (
                        <tr key={player.id}>
                          <td>
                            <span className="player-cell">
                              <Avatar player={player} />
                              <strong>{player.displayName}</strong>
                            </span>
                          </td>
                          {fields.map((field) => (
                            <td key={field} className="numeric">
                              <input
                                className="input mb-cell"
                                type="number"
                                min="0"
                                step={field === "rating" ? "0.01" : "1"}
                                inputMode={field === "rating" ? "decimal" : "numeric"}
                                value={cell[field]}
                                placeholder={field === "rating" ? "auto" : "0"}
                                aria-label={`${player.displayName} ${field}`}
                                onChange={(event) => setCell(mapKey, player.id, field, event.target.value)}
                              />
                            </td>
                          ))}
                          <td className="numeric text-metal-muted">{kd}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                );
              })}
            </table>
          </div>
        ) : (
          <div className="empty-state">Add players to the teams above and their rows appear here.</div>
        )}
        <span className="form-hint">Leave a player&apos;s row empty if they have no stats for that map. Rating is worked out automatically when left blank.</span>
      </div>

      {/* ---------- Operator bans ---------- */}
      <div className="form-section">
        <h3>Operator bans</h3>
        <div className="flex flex-wrap items-center gap-2">
          <span className="label">Banning for</span>
          <div className="mb-segment" role="group" aria-label="Banning side">
            <button type="button" aria-pressed={banSide === "A"} onClick={() => setBanSide("A")}>
              {teamName("A")}
            </button>
            <button type="button" aria-pressed={banSide === "B"} onClick={() => setBanSide("B")}>
              {teamName("B")}
            </button>
            <button type="button" aria-pressed={banSide === null} onClick={() => setBanSide(null)}>
              No side
            </button>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-center">
          <div className="mb-segment" role="tablist">
            <button type="button" aria-pressed={opTab === "attack"} onClick={() => setOpTab("attack")}>
              Attackers
            </button>
            <button type="button" aria-pressed={opTab === "defence"} onClick={() => setOpTab("defence")}>
              Defenders
            </button>
          </div>
          <div className="mb-search md:w-64">
            <Search size={15} className="mb-search-icon" />
            <input
              className="input"
              value={opQuery}
              placeholder="Find or add an operator"
              onChange={(event) => setOpQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  const name = operatorPool[0] || opQuery.trim();
                  if (name && !isBanned(name)) toggleBan(name);
                  setOpQuery("");
                }
              }}
            />
          </div>
        </div>

        <div className="mb-op-grid">
          {operatorPool.map((name) => {
            const icon = iconFor.get(normalizeName(name));
            const banned = bans.find((ban) => normalizeName(ban.operator) === normalizeName(name));
            return (
              <button key={name} type="button" className="mb-op" aria-pressed={Boolean(banned)} onClick={() => toggleBan(name)} title={banned ? "Click to unban" : "Click to ban"}>
                {icon ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img alt="" src={icon} />
                ) : (
                  <span className="mb-op-fallback">{name.slice(0, 2)}</span>
                )}
                <span className="truncate">{name}</span>
                {banned?.side ? <em>{banned.side}</em> : null}
              </button>
            );
          })}
          {opQuery.trim() && !operatorPool.length ? (
            <button type="button" className="mb-op" onClick={() => (toggleBan(opQuery.trim()), setOpQuery(""))}>
              <span className="mb-op-fallback">
                <Plus size={14} />
              </span>
              <span className="truncate">Ban “{opQuery.trim()}”</span>
            </button>
          ) : null}
        </div>

        {bans.length ? (
          <div className="grid gap-2 md:grid-cols-3">
            {([["A", teamName("A")], ["B", teamName("B")], [null, "No side"]] as const).map(([side, label]) => {
              const list = bans.filter((ban) => ban.side === side);
              if (!list.length) return null;
              return (
                <div key={label} className="subtle-panel p-3">
                  <p className="label mb-2">{label} banned</p>
                  <div className="flex flex-wrap gap-2">
                    {list.map((ban) => (
                      <span key={ban.operator} className="mb-chip">
                        <span className="truncate line-through decoration-red-500/70">{ban.operator}</span>
                        <button type="button" title="Remove ban" onClick={() => setBans((current) => current.filter((item) => item !== ban))}>
                          <X size={13} />
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <span className="form-hint">Click operators to ban them for the selected side. Click again to unban.</span>
        )}
      </div>
    </>
  );
}

