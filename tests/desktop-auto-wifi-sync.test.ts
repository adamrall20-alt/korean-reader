import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { afterEach, expect, it, vi } from 'vitest';
import { AutoWifiSync } from '../desktop/src/main/auto-wifi-sync';
import { openDesktopDatabase } from '../desktop/src/main/db';
import { importVocabularyJson } from '../desktop/src/main/importer';
import { LocalMediaStore } from '../desktop/src/main/media';
import { createPairingKey, derivePairSecret, type TrustedDevice } from '../desktop/src/main/wifi-pairing';
import { createSampleMinedEntry } from '../desktop/src/shared/fixtures';

const network = vi.hoisted(() => ({
  discoverers: new Map<string, (data: Buffer, host: string) => void>(),
  host: '',
}));

vi.mock('../desktop/src/main/wifi-discovery', () => ({
  localSyncAddress: (_remote: string, local?: string) => local,
  startDiscovery: async (receive: (data: Buffer, host: string) => void) => {
    const host = network.host;
    network.discoverers.set(host, receive);
    return {
      broadcast(message: unknown) {
        for (const [other, callback] of network.discoverers) {
          if (other !== host) callback(Buffer.from(JSON.stringify(message)), host);
        }
      },
      close() { network.discoverers.delete(host); },
    };
  },
}));

const cleanups: (() => void)[] = [];
const leftHost = '192.168.3.100';
const rightHost = '192.168.3.101';
afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup();
  network.discoverers.clear();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

function simulateHttp() {
  let nextPort = 24000;
  const listeners = new Map<number, { listen: http.RequestListener; host: string }>();
  const calls: string[] = [];
  vi.spyOn(os, 'networkInterfaces').mockReturnValue({
    first: [{ address: leftHost, netmask: '255.255.255.0', family: 'IPv4', mac: '00:00:00:00:00:01', internal: false, cidr: null }],
    second: [{ address: rightHost, netmask: '255.255.255.0', family: 'IPv4', mac: '00:00:00:00:00:02', internal: false, cidr: null }],
  });
  vi.spyOn(http, 'createServer').mockImplementation(((_options: unknown, listen: http.RequestListener) => {
    const emitter = new EventEmitter();
    const port = nextPort++;
    return Object.assign(emitter, {
      listen(_port: number, host: string, ready: () => void) {
        listeners.set(port, { listen, host: host === '0.0.0.0' ? network.host : host });
        ready();
      },
      close() { listeners.delete(port); emitter.emit('close'); },
      closeAllConnections() {},
      address() { return { port }; },
    });
  }) as typeof http.createServer);
  vi.spyOn(http, 'request').mockImplementation(((options: http.RequestOptions, receive: (res: http.IncomingMessage) => void) => {
    const request = new EventEmitter();
    return Object.assign(request, {
      setTimeout() {},
      end(body: string | Buffer) {
        const entry = listeners.get(Number(options.port));
        const route = String(options.path);
        calls.push(route);
        queueMicrotask(() => {
          if (!entry || entry.host !== options.host) {
            request.emit('error', new Error('Peer is offline.'));
            return;
          }
          const headers = Object.fromEntries(Object.entries(options.headers ?? {}).map(([key, value]) => [key.toLowerCase(), value]));
          const input = Object.assign(Readable.from([Buffer.from(body)]), { url: route, method: 'POST', headers,
            socket: { localAddress: entry.host, remoteAddress: entry.host === leftHost ? rightHost : leftHost } });
          let statusCode = 200;
          const response = {
            headersSent: false,
            writeHead(code: number) { statusCode = code; this.headersSent = true; return response; },
            end(bytes?: string | Buffer, done?: () => void) {
              receive(Object.assign(Readable.from(bytes ? [Buffer.from(bytes)] : []), { statusCode }) as http.IncomingMessage);
              done?.();
              return response;
            },
          };
          entry.listen(input as unknown as http.IncomingMessage, response as unknown as http.ServerResponse);
        });
      },
    });
  }) as unknown as typeof http.request);
  return calls;
}

function device(host: string, id: string, name: string, confirm: () => Promise<boolean>) {
  const database = openDesktopDatabase(':memory:');
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'kr-auto-sync-'));
  const media = new LocalMediaStore(folder);
  const codes: string[] = [];
  let trusted: TrustedDevice | undefined;
  let automatic = true;
  const complete = vi.fn();
  const newController = () => new AutoWifiSync({
    db: database.db, media, identity: { id, name }, trusted, automatic,
    async persist(peer, enabled) { trusted = peer; automatic = enabled; },
    confirmPair: async (_name, code) => { codes.push(code); return confirm(); },
    onComplete: complete,
  });
  let controller = newController();
  cleanups.push(() => { controller.close(); database.close(); fs.rmSync(folder, { recursive: true, force: true }); });
  return {
    codes, complete, id,
    controller: () => controller,
    trusted: () => trusted,
    async start() { network.host = host; await controller.findDevices(); },
    async restart() {
      controller.close();
      controller = newController();
      network.host = host;
      await controller.activate();
    },
    add(headword: string) {
      importVocabularyJson(database.db, media, JSON.stringify([{ ...createSampleMinedEntry(), headword }]));
    },
    cards: () => database.db.prepare('SELECT headword FROM cards ORDER BY headword').all().map(({ headword }) => headword),
  };
}

it('derives the same six-digit display code and unique secret on both sides', () => {
  const left = createPairingKey();
  const right = createPairingKey();
  const nonce = 'c'.repeat(32);
  const start = derivePairSecret('a', 'b', left.publicKey, right.publicKey, nonce, left);
  const end = derivePairSecret('a', 'b', left.publicKey, right.publicKey, nonce, right);
  expect(start.code).toMatch(/^\d{6}$/);
  expect(start).toEqual(end);
  expect(derivePairSecret('a', 'b', left.publicKey, right.publicKey, 'd'.repeat(32), right).secret).not.toEqual(end.secret);
});

it('pairs once, syncs only after changes, remembers trust, pauses automatic sync, and allows manual sync', async () => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
  const calls = simulateHttp();
  const left = device(leftHost, 'a'.repeat(32), 'Mac', async () => true);
  const right = device(rightHost, 'b'.repeat(32), 'Windows', async () => true);
  left.add('학교');
  right.add('수업');
  await left.start();
  await right.start();
  expect(left.controller().state().nearby).toEqual([{ name: 'Windows', id: right.id }]);
  await left.controller().pair(right.id);
  expect(left.codes).toEqual(right.codes);
  expect(left.codes).toHaveLength(1);
  expect(left.trusted()?.secret).toBe(right.trusted()?.secret);

  await vi.advanceTimersByTimeAsync(48_000);
  expect(left.cards()).toEqual(right.cards());
  expect(left.cards()).toHaveLength(2);
  const initial = calls.filter((call) => call === '/sync').length;
  expect(initial).toBeGreaterThan(0);
  await vi.advanceTimersByTimeAsync(24_000);
  expect(calls.filter((call) => call === '/sync')).toHaveLength(initial);

  await left.restart();
  await vi.advanceTimersByTimeAsync(24_000);
  expect(calls.filter((call) => call === '/sync')).toHaveLength(initial);
  expect(left.controller().state().paired?.id).toBe(right.id);
  expect(left.codes).toHaveLength(1);

  await left.controller().setAutomatic(false);
  right.add('단어');
  await vi.advanceTimersByTimeAsync(24_000);
  expect(left.cards()).toHaveLength(2);
  await left.controller().syncNow();
  expect(left.cards()).toEqual(right.cards());
  expect(left.cards()).toHaveLength(3);

  await left.controller().setAutomatic(true);
  right.add('책');
  right.controller().notifyLocalChange();
  await new Promise((resolve) => setTimeout(resolve, 250));
  expect(left.cards()).toEqual(right.cards());
  expect(left.cards()).toHaveLength(4);
  left.add('연필');
  left.controller().notifyLocalChange();
  await new Promise((resolve) => setTimeout(resolve, 250));
  expect(left.cards()).toEqual(right.cards());
  expect(left.cards()).toHaveLength(5);
  await left.controller().forget();
  right.add('눈');
  await vi.advanceTimersByTimeAsync(24_000);
  expect(left.cards()).toHaveLength(5);
  expect(left.controller().state().paired).toBeUndefined();
});

it('does not persist trust or transfer a library if either screen rejects the code', async () => {
  simulateHttp();
  const left = device(leftHost, 'a'.repeat(32), 'Mac', async () => true);
  const right = device(rightHost, 'b'.repeat(32), 'Windows', async () => false);
  await left.start();
  await right.start();
  await expect(left.controller().pair(right.id)).rejects.toThrow('declined');
  expect(left.trusted()).toBeUndefined();
  expect(right.trusted()).toBeUndefined();
  expect(left.complete).not.toHaveBeenCalled();
});
