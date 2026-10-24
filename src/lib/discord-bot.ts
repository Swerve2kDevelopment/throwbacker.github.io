type DiscordCreateDmResponse = {
  id?: string;
  message?: string;
};

type DiscordBotUser = {
  id: string;
  username: string;
  discriminator?: string;
  global_name?: string | null;
  avatar?: string | null;
};

type DiscordUser = DiscordBotUser & {
  avatar?: string | null;
};

type DiscordGuild = {
  id: string;
  name: string;
};

type DiscordGuildMember = {
  user?: {
    id: string;
    username: string;
    global_name?: string | null;
  };
  nick?: string | null;
};

async function discordFetch(path: string, init: RequestInit) {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) {
    throw new Error("DISCORD_BOT_TOKEN is not configured.");
  }

  const response = await fetch(`https://discord.com/api/v10${path}`, {
    ...init,
    headers: {
      authorization: `Bot ${token}`,
      "content-type": "application/json",
      ...init.headers
    }
  });

  const body = (await response.json().catch(() => ({}))) as DiscordCreateDmResponse;
  if (!response.ok) {
    throw new Error(body.message || `Discord API error ${response.status}`);
  }

  return body;
}

export async function getDiscordBotIdentity() {
  return discordFetch("/users/@me", { method: "GET" }) as Promise<DiscordBotUser>;
}

export async function getDiscordBotGuilds() {
  return discordFetch("/users/@me/guilds", { method: "GET" }) as Promise<DiscordGuild[]>;
}

export async function getDiscordUser(discordId: string) {
  return discordFetch(`/users/${discordId}`, { method: "GET" }) as Promise<DiscordUser>;
}

export function getDiscordAvatarUrl(user: { id: string; avatar?: string | null }, size = 256) {
  if (user.avatar) {
    const extension = user.avatar.startsWith("a_") ? "webp" : "png";
    return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.${extension}?size=${size}`;
  }

  try {
    const index = Number((BigInt(user.id) >> 22n) % 6n);
    return `https://cdn.discordapp.com/embed/avatars/${index}.png`;
  } catch {
    return "https://cdn.discordapp.com/embed/avatars/0.png";
  }
}

export async function getDiscordUserProfile(discordId: string) {
  const user = await getDiscordUser(discordId);
  return {
    discordUsername: user.global_name || user.username,
    avatarUrl: getDiscordAvatarUrl(user)
  };
}

export async function getDiscordGuildMember(guildId: string, discordId: string) {
  return discordFetch(`/guilds/${guildId}/members/${discordId}`, { method: "GET" }) as Promise<DiscordGuildMember>;
}

export async function sendDiscordDm(discordId: string, message: string) {
  const dmChannel = await discordFetch("/users/@me/channels", {
    method: "POST",
    body: JSON.stringify({ recipient_id: discordId })
  });

  if (!dmChannel.id) {
    throw new Error("Discord did not return a DM channel.");
  }

  await discordFetch(`/channels/${dmChannel.id}/messages`, {
    method: "POST",
    body: JSON.stringify({
      content: message,
      allowed_mentions: { parse: [] }
    })
  });
}
