import { readFile } from "fs/promises";
import path from "path";
import sharp from "sharp";

import { prisma } from "@/lib/prisma";

const userAgent = "OSCL-Tracker/1.0";

export function safeImageSourceUrl(value?: string | null) {
  if (!value) return null;

  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return null;

    if (url.hostname.endsWith("discordapp.net")) {
      const decodedPath = decodeURIComponent(url.pathname);
      const cdnMatch = decodedPath.match(/\/https\/(cdn\.discordapp\.com\/.+)$/);
      if (cdnMatch) return safeImageSourceUrl(`https://${cdnMatch[1]}`);
    }

    url.searchParams.delete("format");
    url.searchParams.delete("quality");
    return url.toString();
  } catch {
    return null;
  }
}

function siteOrigin() {
  return (process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXTAUTH_URL || "").replace(/\/$/, "");
}

/**
 * Loads image bytes for OG cards. Handles remote https URLs, cached avatars in
 * the database, and local /public paths (read from disk, or fetched from the
 * live site when the function bundle does not include public files).
 */
async function loadImageBytes(value?: string | null) {
  if (!value) return null;

  if (value.startsWith("/")) {
    const cleanPath = value.split("?")[0];
    const dbAvatar = cleanPath.match(/^\/api\/player-avatars\/([^/]+)$/);
    if (dbAvatar) {
      const image = await prisma.playerAvatarImage.findUnique({ where: { playerId: dbAvatar[1] } });
      return image ? Buffer.from(image.data) : null;
    }

    const publicRoot = path.join(process.cwd(), "public");
    const filePath = path.normalize(path.join(publicRoot, decodeURIComponent(cleanPath)));
    if (filePath.startsWith(publicRoot)) {
      const file = await readFile(filePath).catch(() => null);
      if (file) return file;
    }

    const origin = siteOrigin();
    if (!origin) return null;
    const response = await fetch(`${origin}${cleanPath}`, { headers: { "user-agent": userAgent } }).catch(() => null);
    return response?.ok ? Buffer.from(await response.arrayBuffer()) : null;
  }

  const sourceUrl = safeImageSourceUrl(value);
  if (!sourceUrl) return null;
  const response = await fetch(sourceUrl, { headers: { "user-agent": userAgent } }).catch(() => null);
  return response?.ok ? Buffer.from(await response.arrayBuffer()) : null;
}

export async function squarePngDataUrl(value?: string | null, size = 720) {
  return pngDataUrl(value, size, size, "contain");
}

export async function pngDataUrl(value?: string | null, width = 1200, height = 630, fit: "cover" | "contain" = "cover") {
  try {
    const source = await loadImageBytes(value);
    if (!source) return null;

    const png = await sharp(source, { animated: false })
      .resize(width, height, { fit, position: "center", background: { r: 12, g: 14, b: 11, alpha: fit === "contain" ? 0 : 1 } })
      .png()
      .toBuffer();
    return `data:image/png;base64,${png.toString("base64")}`;
  } catch {
    return null;
  }
}
