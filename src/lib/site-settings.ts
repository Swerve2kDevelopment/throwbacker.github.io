import { prisma } from "@/lib/prisma";

export { isDiscordWebhookUrl } from "@/lib/validators";

export const SETTING_KEYS = {
  discordWebhookUrl: "discordWebhookUrl"
} as const;

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
 * Posts to the configured announcement webhook. Mentions are always disabled
 * so stat posts can never ping @everyone, @here, roles or users.
 * Returns false when no webhook is configured.
 */
export async function sendDiscordWebhook(payload: WebhookPayload, webhookUrlOverride?: string) {
  const webhookUrl = webhookUrlOverride || (await getSiteSetting(SETTING_KEYS.discordWebhookUrl));
  if (!webhookUrl) return false;

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      username: "OSCL Stats",
      ...payload,
      allowed_mentions: { parse: [] }
    })
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Discord webhook returned ${response.status}${body ? `: ${body.slice(0, 200)}` : ""}`);
  }

  return true;
}

export async function sendDiscordWebhookAnnouncement(content: string) {
  return sendDiscordWebhook({ content });
}
