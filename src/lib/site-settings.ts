import { prisma } from "@/lib/prisma";

export { isDiscordWebhookUrl } from "@/lib/validators";

export const SETTING_KEYS = {
  discordWebhookUrl: "discordWebhookUrl",
  discordPingRoleId: "discordPingRoleId",
  pingOnMatches: "discordPingOnMatches",
  pingOnRecruitment: "discordPingOnRecruitment",
  pingOnSignings: "discordPingOnSignings"
} as const;

/** Which kind of announcement is being sent; each can opt in to the role ping. */
export type WebhookEvent = "match" | "recruitment" | "signing" | "test";

const pingSettingForEvent: Record<Exclude<WebhookEvent, "test">, string> = {
  match: SETTING_KEYS.pingOnMatches,
  recruitment: SETTING_KEYS.pingOnRecruitment,
  signing: SETTING_KEYS.pingOnSignings
};

export async function getSiteSettings(keys: string[]) {
  const rows = await prisma.siteSetting.findMany({ where: { key: { in: keys } } });
  return Object.fromEntries(keys.map((key) => [key, rows.find((row) => row.key === key)?.value || ""])) as Record<string, string>;
}

export async function getSiteSetting(key: string) {
  const setting = await prisma.siteSetting.findUnique({ where: { key } });
  return setting?.value || "";
}

export async function setSiteSetting(key: string, value?: string | null) {
  return prisma.siteSetting.upsert({
    where: { key },
    create: { key, value: value || null },
    update: { value: value || null }
  });
}

export type WebhookEmbed = {
  title?: string;
  description?: string;
  url?: string;
  color?: number;
  fields?: Array<{ name: string; value: string; inline?: boolean }>;
  footer?: { text: string };
  timestamp?: string;
  thumbnail?: { url: string };
};

export type WebhookPayload = {
  content?: string;
  embeds?: WebhookEmbed[];
};

export const OSCL_EMBED_COLOR = 0xb6ff2e;

/**
 * Posts to the configured announcement webhook. Mentions are locked down:
 * @everyone, @here and user pings never fire, and the only thing that can be
 * pinged is the single role chosen in Admin Settings, and only for event types
 * that have the ping switched on. Returns false when no webhook is configured.
 */
export async function sendDiscordWebhook(
  payload: WebhookPayload,
  options: { event?: WebhookEvent; webhookUrlOverride?: string; forcePing?: boolean } = {}
) {
  const settings = await getSiteSettings([SETTING_KEYS.discordWebhookUrl, SETTING_KEYS.discordPingRoleId, ...Object.values(pingSettingForEvent)]);
  const webhookUrl = options.webhookUrlOverride || settings[SETTING_KEYS.discordWebhookUrl];
  if (!webhookUrl) return false;

  const roleId = /^\d{17,20}$/.test(settings[SETTING_KEYS.discordPingRoleId]) ? settings[SETTING_KEYS.discordPingRoleId] : "";
  const eventWantsPing = options.event && options.event !== "test" ? settings[pingSettingForEvent[options.event]] === "true" : false;
  const ping = Boolean(roleId && (options.forcePing || eventWantsPing));
  const content = [ping ? `<@&${roleId}>` : "", payload.content || ""].filter(Boolean).join(" ");

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      username: "OSCL",
      ...payload,
      ...(content ? { content } : {}),
      allowed_mentions: { parse: [], roles: ping ? [roleId] : [] }
    })
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Discord webhook returned ${response.status}${body ? `: ${body.slice(0, 200)}` : ""}`);
  }

  return true;
}

export function absoluteSiteUrl(path = "") {
  const origin = (process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXTAUTH_URL || "").replace(/\/$/, "");
  if (!origin) return undefined;
  if (/^https?:\/\//.test(path)) return path;
  return `${origin}${path.startsWith("/") ? path : `/${path}`}`;
}

export async function sendDiscordWebhookAnnouncement(content: string) {
  return sendDiscordWebhook({ content });
}
