import http from 'node:http';
import type { AddressInfo } from 'node:net';
import type { DatabaseSync } from 'node:sqlite';
import type { ImportSummary } from '../shared/api';
import { importVocabularyJson } from './importer';
import { saveKnownWordHistory } from './stats';
import type { LocalMediaStore } from './media';

export const DESKTOP_BRIDGE_HOST = '127.0.0.1';
export const DESKTOP_BRIDGE_PORT = 17421;
const MAX_BODY_BYTES = 50 * 1024 * 1024; // 50 MB for bulk sync with media

export interface DesktopBridgeServer {
  port: number;
  close(): Promise<void>;
}

function isAllowedOrigin(origin: string | undefined): boolean {
  if (!origin) return true;
  return origin.startsWith('chrome-extension://');
}

function sendJson(
  res: http.ServerResponse,
  statusCode: number,
  payload: unknown,
  origin?: string,
): void {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  };
  if (origin && isAllowedOrigin(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS';
    headers['Access-Control-Allow-Headers'] = 'Content-Type';
  }
  res.writeHead(statusCode, headers);
  res.end(JSON.stringify(payload));
}

function readRequestBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let totalBytes = 0;

    req.on('data', (chunk: Buffer) => {
      totalBytes += chunk.byteLength;
      if (totalBytes > MAX_BODY_BYTES) {
        reject(new Error('Payload too large.'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => {
      resolve(Buffer.concat(chunks).toString('utf8'));
    });

    req.on('error', reject);
  });
}

interface BridgeOptions {
  db: DatabaseSync;
  mediaStore: LocalMediaStore;
  port?: number;
  onImport?: (summary: ImportSummary) => void;
  onKnownHistory?: () => void;
}

export function createBridgeHandler({ db, mediaStore, onImport, onKnownHistory }: BridgeOptions) {
  return async (req: http.IncomingMessage, res: http.ServerResponse) => {
    const origin = req.headers.origin;
    if (!isAllowedOrigin(origin)) {
      sendJson(res, 403, { ok: false, error: 'Origin not allowed.' });
      return;
    }

    if (req.method === 'OPTIONS') {
      sendJson(res, 204, {}, origin);
      return;
    }

    const url = new URL(req.url ?? '/', `http://${DESKTOP_BRIDGE_HOST}`);

    if (req.method === 'GET' && url.pathname === '/health') {
      const row = db.prepare('SELECT COUNT(*) AS count FROM cards').get() as { count?: number };
      sendJson(
        res,
        200,
        { ok: true, app: 'korean-reader-desktop', totalCards: Number(row?.count ?? 0) },
        origin,
      );
      return;
    }

    if (req.method === 'GET' && url.pathname === '/headwords') {
      const rows = db.prepare('SELECT headword FROM cards').all() as Array<{ headword: string }>;
      sendJson(res, 200, { ok: true, headwords: rows.map((r) => r.headword) }, origin);
      return;
    }

    if (req.method === 'POST' && url.pathname === '/known-history') {
      try {
        saveKnownWordHistory(db, JSON.parse(await readRequestBody(req)));
        sendJson(res, 200, { ok: true }, origin);
      } catch (error) {
        sendJson(res, 400, { ok: false, error: error instanceof Error ? error.message : 'Could not save history.' }, origin);
        return;
      }
      onKnownHistory?.();
      return;
    }

    if (req.method === 'POST' && url.pathname === '/import') {
      try {
        const rawBody = await readRequestBody(req);
        const parsed = JSON.parse(rawBody) as unknown;
        const entries = Array.isArray(parsed)
          ? parsed
          : parsed && typeof parsed === 'object' && Array.isArray((parsed as { entries?: unknown }).entries)
            ? (parsed as { entries: unknown[] }).entries
            : null;

        if (!entries) {
          sendJson(res, 400, { ok: false, error: 'Expected a JSON array of vocabulary entries.' }, origin);
          return;
        }

        const summary = importVocabularyJson(db, mediaStore, JSON.stringify(entries));
        if (summary.cardsAdded > 0 || summary.cardsUpdated > 0 || summary.contextsAdded > 0 || summary.contextsUpdated > 0) {
          onImport?.(summary);
        }
        sendJson(res, 200, { ok: true, summary }, origin);
      } catch (error) {
        sendJson(
          res,
          400,
          { ok: false, error: error instanceof Error ? error.message : 'Import failed.' },
          origin,
        );
      }
      return;
    }

    sendJson(res, 404, { ok: false, error: 'Not found.' }, origin);
  };
}

export async function startDesktopBridge(options: BridgeOptions): Promise<DesktopBridgeServer> {
  const port = options.port ?? DESKTOP_BRIDGE_PORT;
  const server = http.createServer(createBridgeHandler(options));

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, DESKTOP_BRIDGE_HOST, () => {
      server.off('error', reject);
      resolve();
    });
  });

  const address = server.address() as AddressInfo;
  return {
    port: address.port,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}
