/**
 * Text formats used by the admin match editor.
 *
 * Player stats, one line per player:
 *   player | kills | deaths | assists | headshots | rating | rounds
 * rating and rounds are optional. Separators can be "|", "," or tabs.
 * Start a block with a map heading to target a specific map:
 *   # Bank        (map name)
 *   # Map 2       (map order)
 * Without a heading, lines go to the first map.
 *
 * Key moments, one line per moment:
 *   player | what happened
 *
 * Operator bans, one line per ban:
 *   Thermite              A: Thermite              Kanine APEXIS bans Thermite
 */

export type BulkStatRow = {
  line: number;
  mapRef: { name?: string; order?: number } | null;
  name: string;
  kills: number;
  deaths: number;
  assists: number;
  headshots: number;
  rating: number | null;
  rounds: number | null;
};

export type KeyMomentRow = {
  line: number;
  name: string;
  text: string;
};

export type OperatorBan = {
  raw: string;
  operator: string;
  side: "A" | "B" | null;
  by: string | null;
};

function splitColumns(line: string) {
  const separator = line.includes("|") ? "|" : line.includes("\t") ? "\t" : ",";
  return line.split(separator).map((part) => part.trim());
}

function toInt(value: string | undefined) {
  const parsed = Number.parseInt(value || "", 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function toOptionalNumber(value: string | undefined) {
  if (!value?.trim()) return null;
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function parseMapHeading(line: string) {
  const heading = line.replace(/^(#+|\[)\s*/, "").replace(/\]\s*$/, "").replace(/:$/, "").trim();
  const orderMatch = heading.match(/^map\s*(\d+)$/i) || heading.match(/^(\d+)$/);
  if (orderMatch) return { order: Number(orderMatch[1]) };
  return { name: heading };
}

function isHeading(line: string) {
  return /^#/.test(line) || /^\[.+\]$/.test(line) || /^map\s*\d+\s*:?$/i.test(line);
}

export function parseBulkStats(raw?: string | null): BulkStatRow[] {
  if (!raw?.trim()) return [];

  let mapRef: BulkStatRow["mapRef"] = null;
  const rows: BulkStatRow[] = [];

  raw.split(/\r?\n/).forEach((rawLine, index) => {
    const line = rawLine.trim();
    if (!line) return;

    if (isHeading(line)) {
      mapRef = parseMapHeading(line);
      return;
    }

    const [name = "", kills, deaths, assists, headshots, rating, rounds] = splitColumns(line);
    if (!name || /^(player|name)$/i.test(name)) return;

    rows.push({
      line: index + 1,
      mapRef,
      name,
      kills: toInt(kills),
      deaths: toInt(deaths),
      assists: toInt(assists),
      headshots: toInt(headshots),
      rating: toOptionalNumber(rating),
      rounds: rounds?.trim() ? toInt(rounds) : null
    });
  });

  return rows;
}

export function parseKeyMoments(raw?: string | null): KeyMomentRow[] {
  if (!raw?.trim()) return [];

  return raw
    .split(/\r?\n/)
    .map((line, index) => ({ line: line.trim(), index }))
    .filter(({ line }) => line)
    .flatMap(({ line, index }) => {
      const separatorIndex = line.includes("|") ? line.indexOf("|") : line.indexOf(",");
      if (separatorIndex < 1) return [];
      const name = line.slice(0, separatorIndex).trim();
      const text = line.slice(separatorIndex + 1).trim();
      return name && text ? [{ line: index + 1, name, text }] : [];
    });
}

export function parseOperatorBan(raw: string): OperatorBan {
  const value = raw.trim();

  const sideMatch = value.match(/^(?:team\s*)?([AB])\s*[:|\-]\s*(.+)$/i);
  if (sideMatch) {
    return { raw: value, operator: sideMatch[2].trim(), side: sideMatch[1].toUpperCase() as "A" | "B", by: null };
  }

  const bansMatch = value.match(/^(.+?)\s+bans?\s+(.+)$/i);
  if (bansMatch) {
    const by = bansMatch[1].trim();
    const sideToken = by.match(/^team\s*([AB])$/i);
    return {
      raw: value,
      operator: bansMatch[2].trim(),
      side: sideToken ? (sideToken[1].toUpperCase() as "A" | "B") : null,
      by: sideToken ? null : by
    };
  }

  return { raw: value, operator: value, side: null, by: null };
}

export function normalizeName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function operatorKey(value: string) {
  return normalizeName(value);
}
