import { mkdir, readdir, unlink, writeFile } from "fs/promises";
import path from "path";

import { getDiscordUserProfile } from "@/lib/discord-bot";
import { prisma } from "@/lib/prisma";

// Discord CDN links stop working when a user changes avatar, so every player
// photo is copied somewhere we control. On a writable host (local dev, VPS) the
// file lands in public/player-avatars. On read-only hosts (Netlify functions)
// the bytes are kept in PlayerAvatarImage and served from /api/player-avatars.
const avatarDir = path.join(process.cwd(), "public", "player-avatars");
const maxAvatarBytes = 4 * 1024 * 1024;

function extensionFromContentType(contentType: string | null) {
  if (contentType?.includes("webp")) return "webp";
  if (contentType?.includes("gif")) return "gif";
  if (contentType?.includes("jpeg") || contentType?.includes("jpg")) return "jpg";
  return "png";
}

export function isLocalAvatarUrl(value?: string | null) {
  return Boolean(value?.startsWith("/player-avatars/") || value?.startsWith("/api/player-avatars/"));
}

export function isDiscordCdnUrl(value?: string | null) {
  return Boolean(value && /^https:\/\/(cdn|media)\.discordapp\.(com|net)\//.test(value));
}

// images-ext-*.discordapp.net proxy links wrap the real CDN URL; the proxy
// copy expires sooner, so go straight to the source.
function unwrapDiscordProxy(url: string) {
  try {
    const parsed = new URL(url);
    if (!parsed.hostname.endsWith("discordapp.net")) return url;
    const match = decodeURIComponent(parsed.pathname).match(/\/https\/(cdn\.discordapp\.com\/.+)$/);
    return match ? `https://${match[1]}` : url;
  } catch {
    return url;
  }
}

async function downloadImage(url: string) {
  const response = await fetch(unwrapDiscordProxy(url), { cache: "no-store" });
  if (!response.ok) throw new Error(`Avatar download failed (${response.status}).`);

  const contentType = response.headers.get("content-type") || "image/png";
  if (!contentType.startsWith("image/")) throw new Error("Avatar URL did not return an image.");

  const bytes = Buffer.from(await response.arrayBuffer());
  if (!bytes.length) throw new Error("Avatar download was empty.");
  if (bytes.length > maxAvatarBytes) throw new Error("Avatar is larger than 4MB.");

  return { bytes, contentType };
}

async function removeOldAvatarFiles(playerId: string) {
  try {
    const files = await readdir(avatarDir);
    await Promise.all(files.filter((file) => file.startsWith(`${playerId}.`)).map((file) => unlink(path.join(avatarDir, file))));
  } catch {
    // Directory missing or read-only; nothing to clean.
  }
}

async function storeAvatar(playerId: string, sourceUrl: string, bytes: Buffer, contentType: string) {
  const filename = `${playerId}.${extensionFromContentType(contentType)}`;

  try {
    await mkdir(avatarDir, { recursive: true });
    await removeOldAvatarFiles(playerId);
    await writeFile(path.join(avatarDir, filename), bytes);
    await prisma.playerAvatarImage.deleteMany({ where: { playerId } });
    return `/player-avatars/${filename}?v=${Date.now()}`;
  } catch {
    await prisma.playerAvatarImage.upsert({
      where: { playerId },
      create: { playerId, contentType, data: bytes, sourceUrl },
      update: { contentType, data: bytes, sourceUrl }
    });
    return `/api/player-avatars/${playerId}?v=${Date.now()}`;
  }
}

/**
 * Copies a remote avatar to permanent storage and returns the local URL.
 * Returns the input unchanged when it is already local, or null/the original
 * URL when the download fails so callers never lose a working image.
 */
export async function cachePlayerAvatar(playerId: string, avatarUrl?: string | null) {
  if (!avatarUrl || isLocalAvatarUrl(avatarUrl)) return avatarUrl || null;

  try {
    const { bytes, contentType } = await downloadImage(avatarUrl);
    return await storeAvatar(playerId, avatarUrl, bytes, contentType);
  } catch {
    return avatarUrl;
  }
}

export type AvatarRefreshResult = {
  playerId: string;
  displayName: string;
  status: "cached" | "refreshed" | "skipped" | "failed";
  detail?: string;
};

/**
 * Re-fetches the current avatar from Discord using the player's Discord ID,
 * then caches it. Falls back to downloading the stored URL when no bot token
 * is configured.
 */
export async function refreshPlayerAvatar(
  player: { id: string; displayName: string; discordId: string | null; avatarUrl: string | null },
  options: { fromDiscord?: boolean } = {}
): Promise<AvatarRefreshResult> {
  const base = { playerId: player.id, displayName: player.displayName };

  if (!options.fromDiscord && isLocalAvatarUrl(player.avatarUrl)) {
    return { ...base, status: "skipped", detail: "Already cached." };
  }

  let sourceUrl = isLocalAvatarUrl(player.avatarUrl) ? null : player.avatarUrl;
  let discordUsername: string | undefined;
  let status: AvatarRefreshResult["status"] = "cached";

  if (player.discordId && process.env.DISCORD_BOT_TOKEN && (options.fromDiscord || !sourceUrl || isDiscordCdnUrl(sourceUrl))) {
    try {
      const profile = await getDiscordUserProfile(player.discordId);
      sourceUrl = profile.avatarUrl;
      discordUsername = profile.discordUsername;
      status = "refreshed";
    } catch (error) {
      if (!sourceUrl) {
        return { ...base, status: "failed", detail: error instanceof Error ? error.message : "Discord lookup failed." };
      }
    }
  }

  if (!sourceUrl) return { ...base, status: "skipped", detail: "No avatar URL or Discord ID." };

  try {
    const { bytes, contentType } = await downloadImage(sourceUrl);
    const avatarUrl = await storeAvatar(player.id, sourceUrl, bytes, contentType);
    await prisma.player.update({
      where: { id: player.id },
      data: { avatarUrl, ...(discordUsername ? { discordUsername } : {}) }
    });
    return { ...base, status };
  } catch (error) {
    return { ...base, status: "failed", detail: error instanceof Error ? error.message : "Download failed." };
  }
}
