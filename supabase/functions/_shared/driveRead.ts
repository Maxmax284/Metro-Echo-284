// driveRead — the small pure decisions behind finding and reading a file.
//
// Doctrine: metadata is browsing, content is a separate yes. This module knows
// which Google file types can be read as text and how each one is fetched, so
// no caller invents its own path.

export const DRIVE_EXPORTABLE: Record<string, string> = {
  "application/vnd.google-apps.document": "text/plain",
  "application/vnd.google-apps.spreadsheet": "text/csv",
  "application/vnd.google-apps.presentation": "text/plain",
};

const KIND_LABEL: Record<string, string> = {
  "application/vnd.google-apps.document": "Doc",
  "application/vnd.google-apps.spreadsheet": "Sheet",
  "application/vnd.google-apps.presentation": "Slides",
  "application/vnd.google-apps.folder": "Folder",
  "application/pdf": "PDF",
  "text/plain": "Text",
};

export function driveKindLabel(mimeType: string): string {
  if (KIND_LABEL[mimeType]) return KIND_LABEL[mimeType];
  if (mimeType.startsWith("image/")) return "Image";
  if (mimeType.includes("wordprocessing")) return "Word";
  if (mimeType.includes("spreadsheet")) return "Spreadsheet";
  return "File";
}

/** A file Echo can turn into words. Anything else is open-in-Google only. */
export function readableAsText(mimeType: string): boolean {
  if (DRIVE_EXPORTABLE[mimeType]) return true;
  return mimeType === "text/plain" || mimeType === "text/csv" || mimeType === "text/markdown";
}

/** How to fetch this file's text, or null when Echo should not try. */
export function readPathFor(fileId: string, mimeType: string): string | null {
  const exportAs = DRIVE_EXPORTABLE[mimeType];
  if (exportAs) {
    return `/drive/v3/files/${fileId}/export?mimeType=${encodeURIComponent(exportAs)}`;
  }
  if (readableAsText(mimeType)) return `/drive/v3/files/${fileId}?alt=media`;
  return null;
}

/** Escape a person's words for a Drive name search. Empty = recent files. */
export function driveQuery(term: string): string {
  const safe = term.replace(/['\\]/g, "");
  const notTrashed = "trashed = false";
  if (!safe) return notTrashed;
  return `${notTrashed} and name contains '${safe}'`;
}
