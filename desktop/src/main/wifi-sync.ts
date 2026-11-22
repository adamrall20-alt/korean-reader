import crypto from 'node:crypto';
import http from 'node:http';
import os from 'node:os';
import type { DatabaseSync } from 'node:sqlite';
import type { LocalMediaStore } from './media';
import { createManifest, listManifestMedia, mergeManifest, readManifest, type LibraryManifest } from './sync-library';

const MAX_MESSAGE_BYTES = 64 * 1024 * 1024;
const INVITE_TIMEOUT_MS = 30 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 120_000;

interface SyncStore {
  db: DatabaseSync;
  media: LocalMediaStore;
}

export interface SyncOptions extends SyncStore {
  confirm: (incoming: number, current: number) => Promise<boolean>;
  beforeMerge?: () => void;
}

export function isLocalAddress(host: string): boolean {
  const parts = host.split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255) ||
      parts.join('.') !== host) return false;
  return parts[0] === 10 || parts[0] === 127 ||
    (parts[0] === 192 && parts[1] === 168) ||
    (parts[0] === 172 && parts[1]! >= 16 && parts[1]! <= 31) ||
    (parts[0] === 169 && parts[1] === 254);
}

export function listWifiAddresses(): string[] {
  return Object.values(os.networkInterfaces()).flatMap((entries) =>
    (entries ?? []).filter((item) => item.family === 'IPv4' && !item.internal && isLocalAddress(item.address))
      .map((item) => item.address));
}

export function seal(key: Buffer, purpose: string, value: unknown): Buffer {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(purpose));
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value)), cipher.final()]);
  if (encrypted.byteLength + 28 > MAX_MESSAGE_BYTES) throw new Error('A sync message exceeds the size limit.');
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]);
}

export function unseal(key: Buffer, purpose: string, bytes: Buffer): unknown {
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, bytes.subarray(0, 12));
  decipher.setAAD(Buffer.from(purpose));
  decipher.setAuthTag(bytes.subarray(12, 28));
  return JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString('utf8'));
}

async function readBytes(message: http.IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of message as AsyncIterable<Buffer>) {
    length += chunk.byteLength;
    if (length > MAX_MESSAGE_BYTES) throw new Error('A sync message exceeds the size limit.');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks, length);
}

function getAsset(store: SyncStore, hash: string): string | undefined {
  const row = store.db.prepare('SELECT id FROM media_assets WHERE sha256 = ?').get(hash);
  return typeof row?.id === 'string' ? store.media.readAsDataUrl(store.db, row.id) : undefined;
}

function saveAsset(store: SyncStore, hash: string, value: unknown): void {
  if (typeof value !== 'string') throw new Error('The other device is missing a media file.');
  const decoded = value.match(/^data:(?:audio|image)\/[a-zA-Z0-9.+-]+;base64,([A-Za-z0-9+/=]+)$/);
  if (!decoded || crypto.createHash('sha256').update(Buffer.from(decoded[1]!, 'base64')).digest('hex') !== hash) {
    throw new Error('A media file failed its integrity check.');
  }
  if (!store.media.saveDataUrl(store.db, value)) throw new Error('Could not store a media file.');
}

function missingMedia(store: SyncStore, hashes: string[]): string[] {
  return hashes.filter((hash) => {
    const entry = store.db.prepare('SELECT rel_path FROM media_assets WHERE sha256 = ?').get(hash);
    return typeof entry?.rel_path !== 'string' || !store.media.hasFile(entry.rel_path);
  });
}

function parseHash(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) throw new Error('Invalid media hash.');
  return value;
}

function parseInvite(invite: string): { host: string; port: number; key: Buffer } {
  const parts = /^KR1:([\d.]+):(\d{1,5}):([A-Za-z0-9_-]{43})$/.exec(invite.trim());
  if (!parts || !isLocalAddress(parts[1]!) || Number(parts[2]) < 1 || Number(parts[2]) > 65535) {
    throw new Error('Enter a valid Korean Reader Wi-Fi pairing code.');
  }
  return { host: parts[1]!, port: Number(parts[2]), key: Buffer.from(parts[3]!, 'base64url') };
}

export async function hostWifiSync(
  options: SyncOptions & { onComplete: () => void; onClose?: () => void },
  host: string,
  timeout = INVITE_TIMEOUT_MS,
): Promise<{ invite: string; close: () => void }> {
  if (!isLocalAddress(host) || (host !== '127.0.0.1' && !listWifiAddresses().includes(host))) {
    throw new Error('Choose an available local network address.');
  }
  const key = crypto.randomBytes(32);
  const seen = new Set<string>();
  let pending: LibraryManifest | undefined;
  let allowedUploads = new Set<string>();
  let allowedDownloads = new Set<string>();
  let busy = false;
  let closed = false;

  async function handle(route: string, value: unknown): Promise<unknown> {
    if (route === '/plan') {
      if (pending) throw new Error('This pairing code already has a transfer in progress.');
      const incoming = readManifest(value);
      const outgoing = createManifest(options.db);
      if (!await options.confirm(incoming.cards.length, outgoing.cards.length) || closed) {
        throw new Error('The other device declined or closed the invitation.');
      }
      allowedUploads = new Set(missingMedia(options, listManifestMedia(incoming)));
      allowedDownloads = new Set(listManifestMedia(outgoing));
      pending = incoming;
      return { manifest: outgoing, missing: [...allowedUploads] };
    }
    if (!pending) throw new Error('Start a sync first.');
    if (route === '/download') {
      const hash = parseHash(value);
      if (!allowedDownloads.has(hash)) throw new Error('This media file was not part of the sync.');
      const asset = getAsset(options, hash);
      if (!asset) throw new Error('A file in this library is missing from disk.');
      return asset;
    }
    if (route === '/upload') {
      const upload = value as { hash?: unknown; asset?: unknown } | null;
      const hash = parseHash(upload?.hash);
      if (!allowedUploads.has(hash)) throw new Error('This media file was not requested.');
      saveAsset(options, hash, upload?.asset);
      allowedUploads.delete(hash);
      return true;
    }
    if (route === '/commit') {
      if (allowedUploads.size) throw new Error('The media transfer is incomplete.');
      options.beforeMerge?.();
      mergeManifest(options.db, pending);
      pending = undefined;
      allowedDownloads.clear();
      options.onComplete();
      return true;
    }
    throw new Error('Invalid Wi-Fi sync request.');
  }

  let timer: ReturnType<typeof setTimeout> | undefined;
  const server = http.createServer({ requestTimeout: REQUEST_TIMEOUT_MS, maxHeaderSize: 4096 }, async (req, res) => {
    if (req.method !== 'POST' || req.headers.origin || req.headers['content-type'] !== 'application/octet-stream') {
      res.writeHead(403).end();
      return;
    }
    if (busy) {
      res.writeHead(409).end();
      return;
    }
    busy = true;
    const route = req.url ?? '';
    try {
      const bytes = await readBytes(req);
      const requestId = bytes.subarray(0, 12).toString('hex');
      const value = unseal(key, `request:${route}`, bytes);
      if (seen.has(requestId) || seen.size >= 250_000) throw new Error('Pairing code expired.');
      seen.add(requestId);
      timer?.refresh();
      let result: { ok: true; value: unknown } | { ok: false; error: string };
      try {
        result = { ok: true, value: await handle(route, value) };
      } catch (error) {
        result = { ok: false, error: error instanceof Error ? error.message : 'Wi-Fi sync failed.' };
      }
      res.writeHead(200, { 'Content-Type': 'application/octet-stream' });
      res.end(seal(key, `response:${route}:${requestId}`, result), () => {
        if (route === '/commit' && result.ok) close();
      });
    } catch {
      if (res.headersSent) res.destroy();
      else res.writeHead(403).end();
    } finally {
      busy = false;
    }
  });

  function close() {
    if (closed) return;
    closed = true;
    clearTimeout(timer);
    server.close();
    server.closeAllConnections();
  }

  server.once('close', () => options.onClose?.());
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, host, () => { server.off('error', reject); resolve(); });
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Could not start a Wi-Fi invitation.');
  timer = setTimeout(close, timeout);
  return { invite: `KR1:${host}:${address.port}:${key.toString('base64url')}`, close };
}

function request(
  destination: ReturnType<typeof parseInvite>,
  route: string,
  value: unknown,
): Promise<unknown> {
  const bytes = seal(destination.key, `request:${route}`, value);
  const id = bytes.subarray(0, 12).toString('hex');
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: destination.host, port: destination.port, path: route, method: 'POST', agent: false,
      headers: { 'Content-Type': 'application/octet-stream', 'Content-Length': bytes.length },
    }, async (res) => {
      try {
        if (res.statusCode !== 200) throw new Error('The other device is busy or the pairing code has expired.');
        const result = unseal(destination.key, `response:${route}:${id}`, await readBytes(res)) as
          { ok: true; value: unknown } | { ok: false; error: string };
        if (!result.ok) throw new Error(result.error);
        resolve(result.value);
      } catch (error) { reject(error); }
    });
    req.setTimeout(REQUEST_TIMEOUT_MS, () => req.destroy(new Error('Wi-Fi sync timed out.')));
    req.on('error', reject);
    req.end(bytes);
  });
}

export async function joinWifiSync(options: SyncOptions, invite: string): Promise<void> {
  const remote = parseInvite(invite);
  const outgoing = createManifest(options.db);
  const plan = await request(remote, '/plan', outgoing) as { manifest?: unknown; missing?: unknown };
  const incoming = readManifest(plan.manifest);
  if (!Array.isArray(plan.missing)) throw new Error('Invalid list of missing media.');
  if (!await options.confirm(incoming.cards.length, outgoing.cards.length)) throw new Error('Merge cancelled.');
  const allowed = new Set(listManifestMedia(outgoing));
  for (const value of plan.missing) {
    const hash = parseHash(value);
    if (!allowed.has(hash)) throw new Error('The paired device asked for a file outside this sync.');
    const asset = getAsset(options, hash);
    if (!asset) throw new Error('A file in this library is missing from disk.');
    await request(remote, '/upload', { hash, asset });
  }
  for (const hash of missingMedia(options, listManifestMedia(incoming))) {
    saveAsset(options, hash, await request(remote, '/download', hash));
  }
  await request(remote, '/commit', null);
  options.beforeMerge?.();
  mergeManifest(options.db, incoming);
}
