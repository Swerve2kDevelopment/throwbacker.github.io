export function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function formatDate(value?: Date | string | null) {
  if (!value) return "TBD";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  }).format(new Date(value));
}

export function formatDateTime(value?: Date | string | null) {
  if (!value) return "TBD";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

export function formatPercent(value: number) {
  if (!Number.isFinite(value)) return "0%";
  return `${value.toFixed(1)}%`;
}

export function formatDecimal(value: number, digits = 2) {
  if (!Number.isFinite(value)) return (0).toFixed(digits);
  return value.toFixed(digits);
}

export function formatKdDiff(value: number) {
  if (value > 0) return `+${value}`;
  return `${value}`;
}

export function getFlagEmoji(country?: string | null) {
  if (!country) return "";
  const normalized = country.trim().toLowerCase();
  const codes: Record<string, string> = {
    argentina: "AR",
    australia: "AU",
    brazil: "BR",
    canada: "CA",
    denmark: "DK",
    finland: "FI",
    france: "FR",
    germany: "DE",
    ireland: "IE",
    japan: "JP",
    mexico: "MX",
    netherlands: "NL",
    norway: "NO",
    poland: "PL",
    portugal: "PT",
    spain: "ES",
    sweden: "SE",
    "united kingdom": "GB",
    uk: "GB",
    "united states": "US",
    usa: "US"
  };
  const code = codes[normalized];
  if (!code) return "";
  return code
    .split("")
    .map((char) => String.fromCodePoint(127397 + char.charCodeAt(0)))
    .join("");
}

export function statusLabel(status: string) {
  return status.charAt(0).toUpperCase() + status.slice(1).toLowerCase();
}

export function avatarFallback(name: string) {
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
  return initials || "HM";
}
