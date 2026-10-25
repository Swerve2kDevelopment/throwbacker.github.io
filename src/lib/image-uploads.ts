import sharp from "sharp";

import { prisma } from "@/lib/prisma";

/**
 * Admin image uploads. Vercel can't write into public/ at runtime, so images
 * are resized, re-encoded and kept in the UploadedImage table, then served
 * from /api/images/<id>. Each upload gets a new id, so the URL can be cached
 * forever and replacing an image never shows a stale copy.
 */

export type ImageKind = "team-logo" | "operator-icon" | "tournament-logo" | "tournament-banner" | "league-logo" | "player-photo";

const presets: Record<ImageKind, { width: number; height: number; fit: "inside" | "cover" }> = {
  "team-logo": { width: 512, height: 512, fit: "inside" },
  "league-logo": { width: 512, height: 512, fit: "inside" },
  "tournament-logo": { width: 512, height: 512, fit: "inside" },
  "operator-icon": { width: 256, height: 256, fit: "inside" },
  "player-photo": { width: 512, height: 512, fit: "cover" },
  "tournament-banner": { width: 1600, height: 900, fit: "inside" }
};

// Vercel rejects request bodies over 4.5 MB, so keep each upload under that.
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
const allowedTypes = new Set(["image/png", "image/jpeg", "image/webp", "image/gif", "image/avif"]);
const UPLOAD_PREFIX = "/api/images/";

export function isUploadedImageUrl(value?: string | null) {
  return Boolean(value?.startsWith(UPLOAD_PREFIX));
}

function uploadedImageId(value?: string | null) {
  if (!isUploadedImageUrl(value)) return null;
  return value!.slice(UPLOAD_PREFIX.length).split(/[?#/]/)[0] || null;
}

/** Returns the file only when the form field actually holds an upload. */
export function formFile(formData: FormData, field: string) {
  const value = formData.get(field);
  return value instanceof File && value.size > 0 ? value : null;
}

export function formFiles(formData: FormData, field: string) {
  return formData.getAll(field).filter((value): value is File => value instanceof File && value.size > 0);
}

export async function saveUploadedImage(file: File, kind: ImageKind) {
  if (!allowedTypes.has(file.type)) {
    throw new Error(`${file.name || "That file"} isn't a supported image. Use PNG, JPG, WebP or GIF.`);
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error(`${file.name || "That image"} is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is 4 MB.`);
  }

  const preset = presets[kind];
  let output: { data: Buffer; info: sharp.OutputInfo };
  try {
    output = await sharp(Buffer.from(await file.arrayBuffer()), { animated: false })
      .rotate()
      .resize(preset.width, preset.height, { fit: preset.fit, withoutEnlargement: preset.fit === "inside" })
      .webp({ quality: 86, alphaQuality: 100 })
      .toBuffer({ resolveWithObject: true });
  } catch {
    throw new Error(`${file.name || "That image"} couldn't be read. Try re-saving it as PNG or JPG.`);
  }

  const image = await prisma.uploadedImage.create({
    data: {
      kind,
      contentType: "image/webp",
      data: output.data,
      width: output.info.width,
      height: output.info.height,
      bytes: output.data.length,
      originalName: file.name?.slice(0, 200) || null
    },
    select: { id: true }
  });

  return `${UPLOAD_PREFIX}${image.id}`;
}

/** Saves the upload in `field` if there is one; otherwise returns null. */
export async function uploadFromForm(formData: FormData, field: string, kind: ImageKind) {
  const file = formFile(formData, field);
  return file ? saveUploadedImage(file, kind) : null;
}

/** Deletes an uploaded image that was just replaced. Ignores non-upload URLs. */
export async function deleteReplacedImage(previousUrl?: string | null, nextUrl?: string | null) {
  const id = uploadedImageId(previousUrl);
  if (!id || previousUrl === nextUrl) return;
  await prisma.uploadedImage.deleteMany({ where: { id } }).catch(() => undefined);
}

export async function readUploadedImage(value: string) {
  const id = uploadedImageId(value);
  return id ? prisma.uploadedImage.findUnique({ where: { id } }) : null;
}
