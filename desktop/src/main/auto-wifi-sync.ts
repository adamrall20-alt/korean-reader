import crypto from 'node:crypto';
import http from 'node:http';
import type { WifiSyncState } from '../shared/api';
import { localSyncAddress, startDiscovery } from './wifi-discovery';
import { createPairingKey, derivePairSecret, matchesTag, pairCommitment, randomToken, readIdentity, signWifi, TOKEN,
  type DeviceIdentity, type TrustedDevice } from './wifi-pairing';
import { createManifest } from './sync-library';
import { hostWifiSync, joinWifiSync, seal, unseal, type SyncOptions } from './wifi-sync';

const CHECK_INTERVAL_MS = 8000;
const PAIRING_WINDOW_MS = 120_000;
const PEER_TIMEOUT_MS = 25_000;
const MAX_CONTROL_BYTES = 4096;

interface WifiOptions extends Omit<SyncOptions, 'confirm'> {
  identity: DeviceIdentity;
  trusted?: TrustedDevice;
  automatic: boolean;
  persist: (peer: TrustedDevice | undefined, automatic: boolean) => Promise<void>;
  confirmPair: (name: string, code: string) => Promise<boolean>;
  onComplete: () => void;
}

interface Endpoint {
  host: string;
  port: number;
}

interface Nearby extends Endpoint {
  identity: DeviceIdentity;
  at: number;
}

interface TrustedBeacon extends Nearby {
  challenge: string;
  revision: string;
  automatic: boolean;
}

interface PendingPair {
  peer: DeviceIdentity;
  challenge: string;
  commitment: string;
  host: string;
  key: ReturnType<typeof createPairingKey>;
  expires: number;
  secret?: Buffer;
  approved?: boolean;
}

async function readControlBody(message: http.IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of message as AsyncIterable<Buffer>) {
    length += chunk.length;
    if (length > MAX_CONTROL_BYTES) throw new Error('Wi-Fi request is too large.');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function post(endpoint: Endpoint, path: string, value: unknown): Promise<unknown> {
  const body = JSON.stringify(value);
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: endpoint.host, port: endpoint.port, path, method: 'POST', agent: false,
      signal: AbortSignal.timeout(path === '/pair/reveal' ? PAIRING_WINDOW_MS : 10_000),
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }, async (response) => {
      try {
        const result = await readControlBody(response) as { ok: boolean; value?: unknown; error?: string };
        if (!result.ok) throw new Error(result.error ?? 'The other device rejected the request.');
        resolve(result.value);
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
    req.end(body);
  });
}

export class AutoWifiSync {
  private trusted: TrustedDevice | undefined;
  private automatic: boolean;
  private pairingUntil = 0;
  private pairingGeneration = 0;
  private offer: PendingPair | undefined;
  private outgoingPair = false;
  private readonly nearby = new Map<string, Nearby>();
  private activePeer: TrustedBeacon | undefined;
  private challenge = randomToken();
  private previousChallenge = '';
  private readonly syncRequests = new Map<string, Set<string>>();
  private transport: { server: http.Server; discovery: Awaited<ReturnType<typeof startDiscovery>> } | undefined;
  private starting: Promise<void> | undefined;
  private timer: ReturnType<typeof setInterval> | undefined;
  private transfer: Awaited<ReturnType<typeof hostWifiSync>> | undefined;
  private syncing = false;
  private disposed = false;
  private lastSyncAt: number | undefined;
  private lastRevisions: { local: string; remote: string } | undefined;
  private localVersion: { changes: number; revision: string } | undefined;
  private error: string | undefined;

  constructor(private readonly options: WifiOptions) {
    this.trusted = options.trusted;
    this.automatic = options.automatic;
    const saved = options.db.prepare('SELECT value FROM settings WHERE key = ?').get('wifiSyncCheckpoint')?.value;
    if (typeof saved === 'string' && this.trusted) {
      try {
        const checkpoint = JSON.parse(saved);
        if (checkpoint.peer === this.trusted.id && /^[a-f0-9]{64}$/.test(checkpoint.local) &&
            /^[a-f0-9]{64}$/.test(checkpoint.remote) && Number.isSafeInteger(checkpoint.at)) {
          this.lastRevisions = { local: checkpoint.local, remote: checkpoint.remote };
          this.lastSyncAt = checkpoint.at;
        }
      } catch {
        // An invalid checkpoint only causes another sync check.
      }
    }
  }

  state(): WifiSyncState {
    const cutoff = Date.now() - PEER_TIMEOUT_MS;
    return {
      pairing: this.pairingUntil > Date.now(),
      automatic: this.automatic,
      paired: this.trusted && { id: this.trusted.id, name: this.trusted.name },
      nearby: [...this.nearby.values()].filter((entry) => entry.at >= cutoff)
        .map(({ identity }) => identity).sort((left, right) => left.name.localeCompare(right.name)),
      online: !!this.activePeer && this.activePeer.at >= cutoff,
      syncing: this.syncing || !!this.transfer,
      lastSyncAt: this.lastSyncAt,
      error: this.error,
    };
  }

  activate(): Promise<void> {
    if (this.disposed) return Promise.reject(new Error('Wi-Fi sync has closed.'));
    if (this.transport) return Promise.resolve();
    this.starting ??= this.startTransport().catch((error) => {
      if (!this.disposed) this.error = 'Wi-Fi discovery is unavailable.';
      throw error;
    }).finally(() => { this.starting = undefined; });
    return this.starting;
  }

  async findDevices(): Promise<void> {
    if (this.trusted) throw new Error('Forget the paired device before pairing a different one.');
    const generation = this.pairingGeneration;
    await this.activate();
    if (generation !== this.pairingGeneration) return;
    this.pairingUntil = Date.now() + PAIRING_WINDOW_MS;
    this.error = undefined;
    this.broadcast();
  }

  stopFinding(): void {
    this.pairingGeneration += 1;
    this.pairingUntil = 0;
    this.offer = undefined;
    this.nearby.clear();
    if (!this.trusted) this.stopTransport();
  }

  async setAutomatic(enabled: boolean): Promise<void> {
    await this.options.persist(this.trusted, enabled);
    this.automatic = enabled;
    this.broadcast();
  }

  async forget(): Promise<void> {
    if (this.syncing || this.transfer) throw new Error('Wait for the current transfer to finish.');
    await this.options.persist(undefined, this.automatic);
    this.clearCheckpoint();
    this.trusted = undefined;
    this.activePeer = undefined;
    this.lastSyncAt = undefined;
    this.lastRevisions = undefined;
    this.error = undefined;
    this.stopFinding();
  }

  async pair(id: string): Promise<void> {
    const remote = this.nearby.get(id);
    if (this.trusted || this.outgoingPair || this.offer || this.pairingUntil <= Date.now() ||
        !remote || Date.now() - remote.at > PEER_TIMEOUT_MS) {
      throw new Error('The nearby device is unavailable for pairing.');
    }
    this.outgoingPair = true;
    const generation = this.pairingGeneration;
    try {
      const key = createPairingKey();
      const nonce = randomToken();
      const self = this.options.identity;
      const offered = await post(remote, '/pair/offer', {
        target: id, peer: self, commitment: pairCommitment(self.id, id, key.publicKey, nonce),
      }) as { challenge: string; publicKey: string };
      if (!TOKEN.test(offered.challenge)) throw new Error('Invalid pairing challenge.');
      const { secret, code } = derivePairSecret(self.id, id, key.publicKey, offered.publicKey, nonce, key);
      const [approved, proof] = await Promise.all([
        this.options.confirmPair(remote.identity.name, code),
        post(remote, '/pair/reveal', { challenge: offered.challenge, publicKey: key.publicKey, nonce }),
      ]);
      if (!approved || this.pairingGeneration !== generation || this.disposed ||
          !matchesTag(proof, signWifi(secret, 'approved', offered.challenge))) {
        throw new Error('Pairing was cancelled.');
      }
      const ack = await post(remote, '/pair/confirm', {
        challenge: offered.challenge, proof: signWifi(secret, 'accepted', offered.challenge),
      });
      if (this.pairingGeneration !== generation || this.disposed || !matchesTag(ack, signWifi(secret, 'saved', offered.challenge))) {
        throw new Error('Pairing did not finish.');
      }
      await this.savePeer(remote.identity, secret);
    } finally {
      this.outgoingPair = false;
    }
  }

  async syncNow(): Promise<void> {
    if (!this.trusted) throw new Error('Pair a device first.');
    await this.activate();
    if (!this.activePeer || Date.now() - this.activePeer.at > PEER_TIMEOUT_MS) {
      this.broadcast();
      throw new Error('Open Korean Reader on the paired device and wait for it to appear online.');
    }
    await this.startSync(this.activePeer, true);
  }

  close(): void {
    this.disposed = true;
    this.stopFinding();
    this.stopTransport();
  }

  private async startTransport(): Promise<void> {
    const generation = this.pairingGeneration;
    const server = http.createServer({ requestTimeout: 10_000, headersTimeout: 10_000, maxHeaderSize: 4096 },
      (req, res) => { void this.handleRequest(req, res); });
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '0.0.0.0', () => {
        server.off('error', reject);
        server.on('error', () => { this.error = 'Wi-Fi listener is unavailable.'; });
        resolve();
      });
    });
    try {
      const discovery = await startDiscovery((data, host) => this.hear(data, host), () => {
        // A Wi-Fi interface may go away temporarily when a device sleeps or roams.
      });
      if (this.disposed || generation !== this.pairingGeneration) {
        discovery.close();
        throw new Error('Wi-Fi discovery was closed.');
      }
      this.error = undefined;
      this.transport = { server, discovery };
      this.timer = setInterval(() => {
        try {
          this.tick();
        } catch {
          this.error = 'Could not check for Wi-Fi updates.';
        }
      }, CHECK_INTERVAL_MS);
      this.broadcast();
    } catch (error) {
      server.close();
      server.closeAllConnections();
      throw error;
    }
  }

  private stopTransport(): void {
    clearInterval(this.timer);
    this.timer = undefined;
    this.transfer?.close();
    const current = this.transport;
    this.transport = undefined;
    if (current) {
      current.discovery.close();
      current.server.close();
      current.server.closeAllConnections();
    }
  }

  private revision(): string {
    const changes = Number(this.options.db.prepare('SELECT total_changes() AS count').get()?.count);
    if (this.localVersion?.changes === changes) return this.localVersion.revision;
    const manifest = createManifest(this.options.db);
    // Daily counts matter for detecting changes. Repeated captures of the same count do not.
    manifest.metadata.known_word_history = manifest.metadata.known_word_history.map(({ day, count }) => ({ day, count }));
    const revision = crypto.createHash('sha256').update(JSON.stringify(manifest)).digest('hex');
    this.localVersion = { revision, changes };
    return revision;
  }

  private tick(): void {
    if (this.offer && this.offer.expires <= Date.now()) this.offer = undefined;
    if (!this.trusted && this.pairingUntil <= Date.now() && !this.outgoingPair && !this.offer?.secret) {
      this.stopFinding();
      return;
    }
    this.previousChallenge = this.challenge;
    this.challenge = randomToken();
    for (const challenge of this.syncRequests.keys()) {
      if (challenge !== this.previousChallenge) this.syncRequests.delete(challenge);
    }
    this.broadcast();

    const peer = this.activePeer;
    if (this.trusted && peer && Date.now() - peer.at <= PEER_TIMEOUT_MS &&
        this.automatic && peer.automatic && this.options.identity.id < peer.identity.id &&
        !this.syncing && !this.transfer && (this.lastRevisions?.local !== this.revision() ||
        this.lastRevisions.remote !== peer.revision)) {
      void this.startSync(peer, false).catch(() => { this.error = 'Automatic sync will retry when both devices are available.'; });
    }
  }

  private broadcast(): void {
    const address = this.transport?.server.address();
    if (!this.transport || !address || typeof address === 'string' || this.disposed) return;
    const identity = this.options.identity;
    if (this.trusted) {
      const revision = this.revision();
      const secret = Buffer.from(this.trusted.secret, 'hex');
      this.transport.discovery.broadcast({
        code: 'kr-wifi-1', identity: { id: identity.id, name: 'Korean Reader' }, port: address.port,
        target: this.trusted.id, revision, challenge: this.challenge, automatic: this.automatic,
        tag: signWifi(secret, 'beacon', identity.id, this.trusted.id, address.port, revision, this.challenge, this.automatic),
      });
    } else if (this.pairingUntil > Date.now()) {
      this.transport.discovery.broadcast({ code: 'kr-wifi-1', identity, port: address.port });
    }
  }

  private hear(data: Buffer, host: string): void {
    try {
      const message = JSON.parse(data.toString('utf8'));
      if (message.code !== 'kr-wifi-1' || !Number.isInteger(message.port) || message.port < 1 || message.port > 65535) return;
      const identity = readIdentity(message.identity);
      if (identity.id === this.options.identity.id) return;
      const endpoint = { host, port: Number(message.port), at: Date.now() };
      if (this.offer && this.offer.expires <= Date.now()) this.offer = undefined;
    if (!this.trusted && this.pairingUntil > Date.now() && !message.target) {
        if (this.nearby.size < 100 || this.nearby.has(identity.id)) this.nearby.set(identity.id, { ...endpoint, identity });
      } else if (this.trusted?.id === identity.id && message.target === this.options.identity.id &&
          typeof message.revision === 'string' && /^[a-f0-9]{64}$/.test(message.revision) &&
          typeof message.challenge === 'string' && TOKEN.test(message.challenge) && typeof message.automatic === 'boolean' &&
          matchesTag(message.tag, signWifi(Buffer.from(this.trusted.secret, 'hex'), 'beacon',
            identity.id, message.target, endpoint.port, message.revision, message.challenge, message.automatic))) {
        this.activePeer = {
          ...endpoint, identity: this.trusted, challenge: message.challenge, revision: message.revision, automatic: message.automatic,
        };
      }
    } catch {
      // Ignore unrelated or malformed discovery datagrams.
    }
  }

  private clearCheckpoint(): void {
    this.options.db.prepare('DELETE FROM settings WHERE key = ?').run('wifiSyncCheckpoint');
  }

  private async savePeer(peer: DeviceIdentity, secret: Buffer): Promise<void> {
    const trusted = { ...peer, secret: secret.toString('hex') };
    this.clearCheckpoint();
    await this.options.persist(trusted, this.automatic);
    if (this.disposed) return;
    this.trusted = trusted;
    this.pairingUntil = 0;
    this.offer = undefined;
    this.nearby.clear();
    this.lastRevisions = undefined;
    this.error = undefined;
    this.broadcast();
  }

  private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const host = req.socket.remoteAddress ?? '';
    const local = localSyncAddress(host, req.socket.localAddress);
    const route = req.url ?? '';
    if (!local || req.method !== 'POST' || req.headers.origin || req.headers['content-type'] !== 'application/json' ||
        !['/pair/offer', '/pair/reveal', '/pair/confirm', '/sync'].includes(route)) {
      res.writeHead(403).end(JSON.stringify({ ok: false }));
      return;
    }
    try {
      const data = await readControlBody(req) as Record<string, unknown>;
      if (!data || typeof data !== 'object' || this.disposed) throw new Error('Invalid Wi-Fi request.');
      const value = route === '/sync' ? await this.offerSync(data, local) : await this.handlePair(route, data, host);
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }).end(JSON.stringify({ ok: true, value }));
    } catch (error) {
      res.writeHead(400, { 'Content-Type': 'application/json' })
        .end(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : 'Wi-Fi request failed.' }));
    }
  }

  private async handlePair(route: string, data: Record<string, unknown>, host: string): Promise<unknown> {
    if (this.trusted || this.outgoingPair) throw new Error('This device is unavailable for pairing.');
    if (route === '/pair/offer') {
      if (this.pairingUntil <= Date.now() || (this.offer && this.offer.expires > Date.now()) ||
          data.target !== this.options.identity.id || typeof data.commitment !== 'string' || !/^[a-f0-9]{64}$/.test(data.commitment)) {
        throw new Error('Open Find nearby devices to accept pairing.');
      }
      const peer = readIdentity(data.peer);
      if (peer.id === this.options.identity.id) throw new Error('Choose a different device.');
      const key = createPairingKey();
      const challenge = randomToken();
      this.offer = { peer, host, challenge, key, commitment: data.commitment, expires: Date.now() + PAIRING_WINDOW_MS };
      return { challenge, publicKey: key.publicKey };
    }

    const offer = this.offer;
    if (!offer || offer.expires <= Date.now() || offer.host !== host || offer.challenge !== data.challenge) {
      throw new Error('The pairing request expired.');
    }
    if (route === '/pair/reveal') {
      if (offer.secret || typeof data.publicKey !== 'string' || typeof data.nonce !== 'string' ||
          !matchesTag(offer.commitment, pairCommitment(offer.peer.id, this.options.identity.id, data.publicKey, data.nonce))) {
        throw new Error('Pairing verification failed.');
      }
      const { secret, code } = derivePairSecret(offer.peer.id, this.options.identity.id, data.publicKey, offer.key.publicKey, data.nonce, offer.key);
      offer.secret = secret;
      offer.approved = await this.options.confirmPair(offer.peer.name, code);
      if (!offer.approved || this.offer !== offer || offer.expires <= Date.now() || this.disposed) {
        this.offer = undefined;
        throw new Error('The other device declined the pairing request.');
      }
      return signWifi(secret, 'approved', offer.challenge);
    }

    if (!offer.approved || !offer.secret || !matchesTag(data.proof, signWifi(offer.secret, 'accepted', offer.challenge))) {
      throw new Error('Pairing was not approved.');
    }
    await this.savePeer(offer.peer, offer.secret);
    return signWifi(offer.secret, 'saved', offer.challenge);
  }

  private async offerSync(data: Record<string, unknown>, local: string): Promise<string> {
    const peer = this.trusted;
    if (!peer || this.syncing || this.transfer || data.from !== peer.id || typeof data.callerRevision !== 'string' ||
        !/^[a-f0-9]{64}$/.test(data.callerRevision) || typeof data.manual !== 'boolean' ||
        (!data.manual && !this.automatic) || typeof data.challenge !== 'string' ||
        (data.challenge !== this.challenge && data.challenge !== this.previousChallenge) ||
        typeof data.requestId !== 'string' || !TOKEN.test(data.requestId)) {
      throw new Error('The paired device is busy or unavailable.');
    }
    const secret = Buffer.from(peer.secret, 'hex');
    const purpose = ['sync', peer.id, this.options.identity.id, data.challenge, data.requestId, data.callerRevision, data.manual];
    const used = this.syncRequests.get(data.challenge) ?? new Set<string>();
    if (!matchesTag(data.proof, signWifi(secret, ...purpose)) || used.has(data.requestId) || used.size >= 256) {
      throw new Error('Could not authenticate the sync request.');
    }
    used.add(data.requestId);
    this.syncRequests.set(data.challenge, used);
    const revision = data.callerRevision;
    let localBeforeTransfer: string;
    let changedDuringTransfer = false;
    this.syncing = true;
    try {
      const transfer = await hostWifiSync({
        ...this.options,
        confirm: async () => {
          localBeforeTransfer = this.revision();
          return this.trusted === peer && !this.disposed;
        },
        beforeMerge: () => {
          if (this.disposed) throw new Error('Wi-Fi sync has closed.');
          changedDuringTransfer = localBeforeTransfer !== this.revision();
        },
        onComplete: () => this.complete(revision, changedDuringTransfer),
        onClose: () => { this.transfer = undefined; },
      }, local, 60_000);
      if (this.disposed || this.trusted !== peer) {
        transfer.close();
        throw new Error('Wi-Fi sync closed.');
      }
      this.transfer = transfer;
      return seal(secret, JSON.stringify(purpose), transfer.invite).toString('base64url');
    } finally {
      this.syncing = false;
    }
  }

  private async startSync(remote: TrustedBeacon, manual: boolean): Promise<void> {
    if (this.syncing || this.transfer) return;
    const peer = this.trusted;
    if (!peer || remote.identity.id !== peer.id || this.disposed) return;
    this.syncing = true;
    this.error = undefined;
    try {
      const from = this.options.identity.id;
      const callerRevision = this.revision();
      const requestId = randomToken();
      const purpose = ['sync', from, peer.id, remote.challenge, requestId, callerRevision, manual];
      const secret = Buffer.from(peer.secret, 'hex');
      const response = await post(remote, '/sync', {
        from, challenge: remote.challenge, requestId, callerRevision, manual,
        proof: signWifi(secret, ...purpose),
      });
      if (typeof response !== 'string' || this.disposed) throw new Error('Invalid Wi-Fi sync invitation.');
      const invite = unseal(secret, JSON.stringify(purpose), Buffer.from(response, 'base64url'));
      if (typeof invite !== 'string' || !invite.startsWith(`KR1:${remote.host}:`)) throw new Error('Invalid Wi-Fi sync address.');
      const localBeforeTransfer = this.revision();
      let changedDuringTransfer = false;
      await joinWifiSync({
        ...this.options,
        confirm: async () => !this.disposed && this.trusted === peer,
        beforeMerge: () => {
          if (this.disposed) throw new Error('Wi-Fi sync has closed.');
          changedDuringTransfer = localBeforeTransfer !== this.revision();
        },
      }, invite);
      if (!this.disposed) this.complete(remote.revision, changedDuringTransfer);
    } finally {
      this.syncing = false;
    }
  }

  private complete(remoteRevision: string, changedDuringTransfer: boolean): void {
    if (this.disposed) return;
    this.lastSyncAt = Date.now();
    this.lastRevisions = { local: changedDuringTransfer ? '' : this.revision(), remote: remoteRevision };
    if (this.trusted && !changedDuringTransfer) {
      const checkpoint = JSON.stringify({ peer: this.trusted.id, ...this.lastRevisions, at: this.lastSyncAt });
      this.options.db.prepare(`INSERT INTO settings VALUES (?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`)
        .run('wifiSyncCheckpoint', checkpoint, new Date().toISOString());
    } else {
      this.clearCheckpoint();
    }
    this.error = undefined;
    this.options.onComplete();
    this.broadcast();
  }
}
