import "server-only";

export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

type Family = "image" | "pdf" | "audio";
export type Sniffed = { mime: string; family: Family };

const startsWith = (b: Uint8Array, sig: number[], at = 0) => sig.every((v, i) => b[at + i] === v);
const ascii = (b: Uint8Array, at: number, len: number) => String.fromCharCode(...b.subarray(at, at + len));

/**
 * The real file type, read from the first bytes. The browser's declared type is never trusted: a script
 * renamed to .png, or an HTML page declared as an image, is rejected here.
 */
export function sniffType(b: Uint8Array): Sniffed | null {
  if (b.length < 12) return null;
  if (startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { mime: "image/png", family: "image" };
  if (startsWith(b, [0xff, 0xd8, 0xff])) return { mime: "image/jpeg", family: "image" };
  if (ascii(b, 0, 4) === "GIF8") return { mime: "image/gif", family: "image" };
  if (ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 4) === "WEBP") return { mime: "image/webp", family: "image" };
  if (ascii(b, 0, 5) === "%PDF-") return { mime: "application/pdf", family: "pdf" };
  if (ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 4) === "WAVE") return { mime: "audio/wav", family: "audio" };
  if (ascii(b, 0, 4) === "OggS") return { mime: "audio/ogg", family: "audio" };
  if (startsWith(b, [0x1a, 0x45, 0xdf, 0xa3])) return { mime: "audio/webm", family: "audio" };
  if (ascii(b, 4, 4) === "ftyp") return { mime: "audio/mp4", family: "audio" };
  if (ascii(b, 0, 3) === "ID3") return { mime: "audio/mpeg", family: "audio" };
  if (b[0] === 0xff && (b[1] & 0xe0) === 0xe0) return { mime: (b[1] & 0xf6) === 0xf0 ? "audio/aac" : "audio/mpeg", family: "audio" };
  return null;
}

const familyOfDeclared = (declared: string): Family | null =>
  declared.startsWith("image/") ? "image" : declared === "application/pdf" ? "pdf" : declared.startsWith("audio/") ? "audio" : null;

export type UploadCheck = { ok: true; mime: string } | { ok: false; status: 413 | 415; error: string };

/** Size, then real type from magic bytes, then a sanity check that the declared type is the same kind of file. */
export function checkUpload(bytes: Uint8Array, declaredType: string): UploadCheck {
  if (bytes.length === 0) return { ok: false, status: 415, error: "The file is empty." };
  if (bytes.length > MAX_UPLOAD_BYTES) return { ok: false, status: 413, error: "File too large (max 8 MB)." };
  const real = sniffType(bytes);
  if (!real) return { ok: false, status: 415, error: "Unsupported file. Use a PNG, JPEG, WebP, GIF, PDF or audio file." };
  const declared = familyOfDeclared(declaredType);
  if (declared && declared !== real.family) return { ok: false, status: 415, error: "The file contents do not match its declared type." };
  return { ok: true, mime: real.mime };
}

/** A file name that is safe to store, show and put in a header. */
export function safeFileName(name: string) {
  const cleaned = name
    .replace(/[\u0000-\u001f\u007f"\\/<>:*?|]+/g, "_")
    .replace(/^\.+/, "")
    .trim()
    .slice(0, 120);
  return cleaned || "upload";
}
