/* Allowed file types: extension, declared MIME type and file signature must all agree. */

export type FileKind = "image" | "document" | "audio" | "video" | "archive";

type Rule = { mime: string; kind: FileKind; sniff: (head: Buffer) => boolean; preview: boolean };

const at = (head: Buffer, offset: number, bytes: number[]) => bytes.every((b, i) => head[offset + i] === b);
const ascii = (head: Buffer, offset: number, s: string) => head.subarray(offset, offset + s.length).toString("latin1") === s;

const ZIP = (h: Buffer) => at(h, 0, [0x50, 0x4b, 0x03, 0x04]) || at(h, 0, [0x50, 0x4b, 0x05, 0x06]);
const OLE = (h: Buffer) => at(h, 0, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
const FTYP = (h: Buffer) => ascii(h, 4, "ftyp");
/** Plain text: no NUL bytes and valid UTF-8 in the first block (a cut multi-byte tail is allowed). */
const TEXT = (h: Buffer) => {
  if (h.includes(0)) return false;
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(h.subarray(0, Math.max(0, h.length - 3)));
    return true;
  } catch {
    return false;
  }
};

export const FILE_RULES: Record<string, Rule> = {
  png: { mime: "image/png", kind: "image", preview: true, sniff: (h) => at(h, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) },
  jpg: { mime: "image/jpeg", kind: "image", preview: true, sniff: (h) => at(h, 0, [0xff, 0xd8, 0xff]) },
  jpeg: { mime: "image/jpeg", kind: "image", preview: true, sniff: (h) => at(h, 0, [0xff, 0xd8, 0xff]) },
  gif: { mime: "image/gif", kind: "image", preview: true, sniff: (h) => ascii(h, 0, "GIF87a") || ascii(h, 0, "GIF89a") },
  webp: { mime: "image/webp", kind: "image", preview: true, sniff: (h) => ascii(h, 0, "RIFF") && ascii(h, 8, "WEBP") },
  pdf: { mime: "application/pdf", kind: "document", preview: true, sniff: (h) => ascii(h, 0, "%PDF-") },
  docx: { mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", kind: "document", preview: false, sniff: ZIP },
  xlsx: { mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", kind: "document", preview: false, sniff: ZIP },
  pptx: { mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation", kind: "document", preview: false, sniff: ZIP },
  doc: { mime: "application/msword", kind: "document", preview: false, sniff: OLE },
  xls: { mime: "application/vnd.ms-excel", kind: "document", preview: false, sniff: OLE },
  ppt: { mime: "application/vnd.ms-powerpoint", kind: "document", preview: false, sniff: OLE },
  txt: { mime: "text/plain", kind: "document", preview: false, sniff: TEXT },
  csv: { mime: "text/csv", kind: "document", preview: false, sniff: TEXT },
  md: { mime: "text/markdown", kind: "document", preview: false, sniff: TEXT },
  mp3: {
    mime: "audio/mpeg",
    kind: "audio",
    preview: true,
    sniff: (h) => ascii(h, 0, "ID3") || (h[0] === 0xff && (h[1]! & 0xe0) === 0xe0),
  },
  m4a: { mime: "audio/mp4", kind: "audio", preview: true, sniff: FTYP },
  wav: { mime: "audio/wav", kind: "audio", preview: true, sniff: (h) => ascii(h, 0, "RIFF") && ascii(h, 8, "WAVE") },
  ogg: { mime: "audio/ogg", kind: "audio", preview: true, sniff: (h) => ascii(h, 0, "OggS") },
  mp4: { mime: "video/mp4", kind: "video", preview: true, sniff: FTYP },
  mov: { mime: "video/quicktime", kind: "video", preview: true, sniff: FTYP },
  webm: { mime: "video/webm", kind: "video", preview: true, sniff: (h) => at(h, 0, [0x1a, 0x45, 0xdf, 0xa3]) },
  zip: { mime: "application/zip", kind: "archive", preview: false, sniff: ZIP },
};

/** MIME types the storage bucket accepts; anything else is refused by Supabase itself. */
export const ALLOWED_MIME_TYPES = [...new Set(Object.values(FILE_RULES).map((r) => r.mime))];

export function extensionOf(name: string) {
  const m = /\.([A-Za-z0-9]{1,8})$/.exec(name);
  return m ? m[1]!.toLowerCase() : "";
}

/** Resolves the rule for a name and declared type, or null when they are not an allowed pair. */
export function ruleFor(name: string, declaredMime: string) {
  const rule = FILE_RULES[extensionOf(name)];
  if (!rule) return null;
  // Browsers report some types differently; the extension's canonical type is what gets stored.
  const aliases: Record<string, string[]> = {
    "audio/wav": ["audio/x-wav", "audio/wave"],
    "audio/mp4": ["audio/x-m4a", "audio/m4a"],
    "application/zip": ["application/x-zip-compressed"],
    "text/markdown": ["text/x-markdown", "text/plain", ""],
    "text/csv": ["application/vnd.ms-excel", "text/plain", ""],
  };
  const ok = declaredMime === rule.mime || (aliases[rule.mime] ?? []).includes(declaredMime);
  return ok ? rule : null;
}

/** Strips path separators, control characters and leading dots from a display name. */
export function safeName(name: string) {
  const cleaned = name
    .normalize("NFC")
    .replace(/[\u0000-\u001f\u007f/\\]/g, "")
    .replace(/^\.+/, "")
    .trim()
    .slice(0, 180);
  return cleaned || "file";
}
