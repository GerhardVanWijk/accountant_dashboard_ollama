/** SHA-256 hex digest of a File's content — used for "already imported"/duplicate-file detection (Part 27), via the browser's native SubtleCrypto (no new dependency). */
export async function sha256Hex(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Strips characters unsafe for a Storage object path, mirroring useJournalAttachments.ts's convention. */
export function safeFileName(fileName: string): string {
  return fileName.replace(/[^A-Za-z0-9._-]/g, '_');
}
