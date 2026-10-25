import { OSCL_EMBED_COLOR, absoluteSiteUrl, sendDiscordWebhook } from "@/lib/site-settings";

type AnnouncedTeam = { name: string; slug: string; logoUrl: string | null };

// Names and notes are user-supplied; keep them from breaking Discord markdown or pinging anyone.
function clean(value: string) {
  return value.replace(/([*_`~|>\\])/g, "\\$1").replace(/@/g, "@\u200b");
}

function teamThumbnail(team: AnnouncedTeam) {
  const url = team.logoUrl ? absoluteSiteUrl(team.logoUrl) : undefined;
  return url ? { thumbnail: { url } } : {};
}

/** Never throws: a Discord outage must not block a manager's action. */
async function safeSend(send: () => Promise<boolean>) {
  try {
    return { sent: await send() };
  } catch (error) {
    return { sent: false, reason: error instanceof Error ? error.message : "Webhook failed." };
  }
}

export function announceRecruitmentPost(team: AnnouncedTeam, post: { role: string | null; note: string | null; postedBy: string | null }) {
  return safeSend(() =>
    sendDiscordWebhook(
      {
        embeds: [
          {
            title: `${team.name} are looking for a player`,
            url: absoluteSiteUrl(`/teams/${team.slug}`),
            color: OSCL_EMBED_COLOR,
            description: [post.role ? `**Role:** ${clean(post.role)}` : "**Role:** Any", post.note ? clean(post.note) : null].filter(Boolean).join("\n\n"),
            ...teamThumbnail(team),
            footer: { text: post.postedBy ? `Posted by ${post.postedBy} · OSCL` : "OSCL" },
            timestamp: new Date().toISOString()
          }
        ]
      },
      { event: "recruitment" }
    )
  );
}

export function announceSigningRequest(team: AnnouncedTeam, player: { displayName: string; slug: string }) {
  return safeSend(() =>
    sendDiscordWebhook(
      {
        embeds: [
          {
            title: `${team.name} are looking to sign ${player.displayName}`,
            url: absoluteSiteUrl(`/players/${player.slug}`),
            color: OSCL_EMBED_COLOR,
            description: `The offer is waiting on ${clean(player.displayName)} to accept or decline.`,
            ...teamThumbnail(team),
            footer: { text: "Transfer request · OSCL" },
            timestamp: new Date().toISOString()
          }
        ]
      },
      { event: "signing" }
    )
  );
}
