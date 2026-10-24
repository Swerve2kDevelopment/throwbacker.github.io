/**
 * Downloads every player's avatar into public/player-avatars and points
 * Player.avatarUrl at the local copy.
 *
 *   npm run avatars:cache              cache Discord/remote URLs that are not local yet
 *   npm run avatars:cache -- --refresh re-fetch every avatar from Discord IDs (needs DISCORD_BOT_TOKEN)
 *   npm run avatars:cache -- --dry-run show what would happen without touching the DB
 *
 * Run it locally, then deploy so the new files ship with the site.
 */
import { PrismaClient } from "@prisma/client";
import { mkdir, writeFile } from "fs/promises";
import path from "path";

const prisma = new PrismaClient();
const refresh = process.argv.includes("--refresh");
const dryRun = process.argv.includes("--dry-run");
const avatarDir = path.join(process.cwd(), "public", "player-avatars");

function extensionFor(contentType: string) {
  if (contentType.includes("webp")) return "webp";
  if (contentType.includes("gif")) return "gif";
  if (contentType.includes("jpeg") || contentType.includes("jpg")) return "jpg";
  return "png";
}

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

function isLocal(url?: string | null) {
  return Boolean(url?.startsWith("/player-avatars/") || url?.startsWith("/api/player-avatars/"));
}

async function discordAvatar(discordId: string) {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) return null;

  const response = await fetch(`https://discord.com/api/v10/users/${discordId}`, {
    headers: { authorization: `Bot ${token}` }
  });
  if (!response.ok) throw new Error(`Discord API ${response.status}`);

  const user = (await response.json()) as { id: string; avatar?: string | null; username: string; global_name?: string | null };
  const url = user.avatar
    ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.${user.avatar.startsWith("a_") ? "webp" : "png"}?size=256`
    : `https://cdn.discordapp.com/embed/avatars/${Number((BigInt(user.id) >> 22n) % 6n)}.png`;
  return { url, discordUsername: user.global_name || user.username };
}

async function main() {
  const players = await prisma.player.findMany({
    select: { id: true, displayName: true, discordId: true, avatarUrl: true },
    orderBy: { displayName: "asc" }
  });

  if (refresh && !process.env.DISCORD_BOT_TOKEN) {
    console.warn("DISCORD_BOT_TOKEN is not set; --refresh will only retry the stored URLs.");
  }

  await mkdir(avatarDir, { recursive: true });
  const summary = { cached: 0, skipped: 0, failed: 0 };

  for (const player of players) {
    if (!refresh && isLocal(player.avatarUrl)) {
      summary.skipped += 1;
      continue;
    }

    const candidates: Array<{ url: string; discordUsername?: string }> = [];
    if (player.discordId && (refresh || !player.avatarUrl)) {
      try {
        const fresh = await discordAvatar(player.discordId);
        if (fresh) candidates.push(fresh);
      } catch (error) {
        console.warn(`  ${player.displayName}: Discord lookup failed (${(error as Error).message})`);
      }
    }
    if (player.avatarUrl && !isLocal(player.avatarUrl)) {
      candidates.push({ url: player.avatarUrl });
      const unwrapped = unwrapDiscordProxy(player.avatarUrl);
      if (unwrapped !== player.avatarUrl) candidates.push({ url: unwrapped });
    }
    if (player.discordId && !refresh && player.avatarUrl) {
      try {
        const fresh = await discordAvatar(player.discordId);
        if (fresh) candidates.push(fresh);
      } catch {
        // Stored URL is still tried first.
      }
    }

    let done = false;
    for (const candidate of candidates) {
      try {
        const response = await fetch(candidate.url);
        const contentType = response.headers.get("content-type") || "";
        if (!response.ok || !contentType.startsWith("image/")) throw new Error(`HTTP ${response.status}`);
        const bytes = Buffer.from(await response.arrayBuffer());
        const filename = `${player.id}.${extensionFor(contentType)}`;
        const localUrl = `/player-avatars/${filename}?v=${Date.now()}`;

        if (dryRun) {
          console.log(`  would cache ${player.displayName} -> ${filename}`);
        } else {
          await writeFile(path.join(avatarDir, filename), bytes);
          await prisma.player.update({
            where: { id: player.id },
            data: { avatarUrl: localUrl, ...(candidate.discordUsername ? { discordUsername: candidate.discordUsername } : {}) }
          });
          await prisma.playerAvatarImage.deleteMany({ where: { playerId: player.id } });
          console.log(`  cached ${player.displayName} -> ${filename}`);
        }
        summary.cached += 1;
        done = true;
        break;
      } catch {
        // Try the next candidate.
      }
    }

    if (!done) {
      summary.failed += 1;
      console.warn(`  failed ${player.displayName}${player.discordId ? "" : " (no Discord ID)"}`);
    }
  }

  console.log(`\nDone: ${summary.cached} cached, ${summary.skipped} already local, ${summary.failed} failed.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
