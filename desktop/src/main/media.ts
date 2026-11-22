import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';

const DATA_URL_RE = /^data:([a-zA-Z0-9!#$&^_.+-]+\/[a-zA-Z0-9!#$&^_.+-]+)(?:;[^,]*)?;base64,([A-Za-z0-9+/=\s]+)$/;

const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
};

export interface DecodedDataUrl {
  mimeType: string;
  buffer: Buffer;
  extension: string;
}

export function decodeBase64DataUrl(dataUrl: string): DecodedDataUrl | null {
  const match = DATA_URL_RE.exec(dataUrl.trim());
  if (!match) return null;

  const mimeType = match[1]!.toLowerCase();
  const base64Body = match[2]!.replace(/\s+/g, '');
  if (!base64Body) return null;

  const buffer = Buffer.from(base64Body, 'base64');
  if (buffer.byteLength === 0) return null;

  const extension = MIME_TO_EXT[mimeType] ?? 'bin';
  return { mimeType, buffer, extension };
}

export interface SaveMediaResult {
  id: string;
  created: boolean;
}

export class LocalMediaStore {
  readonly mediaDir: string;

  constructor(mediaDir: string) {
    this.mediaDir = path.resolve(mediaDir);
    fs.mkdirSync(this.mediaDir, { recursive: true });
  }

  saveDataUrl(db: DatabaseSync, dataUrl: string): SaveMediaResult | null {
    const decoded = decodeBase64DataUrl(dataUrl);
    if (!decoded) return null;

    const sha256 = crypto.createHash('sha256').update(decoded.buffer).digest('hex');
    const existing = db
      .prepare('SELECT id, rel_path FROM media_assets WHERE sha256 = ?')
      .get(sha256) as { id?: string; rel_path?: string } | undefined;

    if (existing?.id && existing.rel_path) {
      const existingAbs = this.resolveSafePath(existing.rel_path);
      if (existingAbs && !fs.existsSync(existingAbs)) {
        fs.writeFileSync(existingAbs, decoded.buffer);
      }
      return { id: existing.id, created: false };
    }

    const id = crypto.randomUUID();
    const relPath = `${sha256}.${decoded.extension}`;
    const absPath = this.resolveSafePath(relPath);
    if (!absPath) return null;

    fs.writeFileSync(absPath, decoded.buffer);

    db.prepare(
      `INSERT INTO media_assets (id, sha256, mime_type, rel_path, byte_size, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(id, sha256, decoded.mimeType, relPath, decoded.buffer.byteLength, new Date().toISOString());

    return { id, created: true };
  }

  readAsDataUrl(db: DatabaseSync, assetId: string | null | undefined): string | undefined {
    if (!assetId) return undefined;
    const row = db
      .prepare('SELECT mime_type, rel_path FROM media_assets WHERE id = ?')
      .get(assetId) as { mime_type?: string; rel_path?: string } | undefined;

    if (!row?.mime_type || !row.rel_path) return undefined;
    const absPath = this.resolveSafePath(row.rel_path);
    if (!absPath || !fs.existsSync(absPath)) return undefined;

    const bytes = fs.readFileSync(absPath);
    return `data:${row.mime_type};base64,${bytes.toString('base64')}`;
  }

  hasFile(relPath: string): boolean {
    const absolute = this.resolveSafePath(relPath);
    return absolute !== null && fs.existsSync(absolute);
  }

  resolveSafePath(relPath: string): string | null {
    if (!relPath || path.isAbsolute(relPath) || relPath.includes('..')) {
      return null;
    }
    const resolved = path.resolve(this.mediaDir, relPath);
    if (!resolved.startsWith(`${this.mediaDir}${path.sep}`)) {
      return null;
    }
    return resolved;
  }
}
