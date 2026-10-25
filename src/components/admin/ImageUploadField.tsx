export const IMAGE_ACCEPT = "image/png,image/jpeg,image/webp,image/gif,image/avif";

/** File picker for admin forms, showing the image that's currently set. */
export function ImageUploadField({
  label,
  name,
  currentUrl,
  hint = "PNG, JPG, WebP or GIF, up to 4 MB. Resized automatically.",
  multiple = false
}: {
  label: string;
  name: string;
  currentUrl?: string | null;
  hint?: string;
  multiple?: boolean;
}) {
  return (
    <label className="grid gap-1">
      <span className="label">{label}</span>
      <div className="flex items-center gap-3">
        {currentUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img alt="" src={currentUrl} className="h-12 w-12 shrink-0 rounded-md border border-metal-line bg-metal-row object-contain p-1" />
        ) : null}
        <input className="input" type="file" name={name} accept={IMAGE_ACCEPT} multiple={multiple} />
      </div>
      <span className="form-hint">{hint}</span>
    </label>
  );
}
