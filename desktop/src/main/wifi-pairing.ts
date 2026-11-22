import crypto from 'node:crypto';

export const DEVICE_ID = /^[a-f0-9]{32}$/;
export const TOKEN = /^[a-f0-9]{32}$/;
const PUBLIC_KEY = /^[A-Za-z0-9_-]{59}$/;

export interface DeviceIdentity {
  id: string;
  name: string;
}

export interface TrustedDevice extends DeviceIdentity {
  secret: string;
}

export function readIdentity(value: unknown): DeviceIdentity {
  const candidate = value as DeviceIdentity | null;
  if (!candidate || typeof candidate.id !== 'string' || !DEVICE_ID.test(candidate.id) ||
      typeof candidate.name !== 'string' || !candidate.name.trim() || candidate.name.length > 100 ||
      /[\u0000-\u001f\u007f]/.test(candidate.name)) {
    throw new Error('Invalid Wi-Fi device identity.');
  }
  return { id: candidate.id, name: candidate.name };
}

export function randomToken(): string {
  return crypto.randomBytes(16).toString('hex');
}

export function signWifi(secret: Buffer, ...fields: unknown[]): string {
  return crypto.createHmac('sha256', secret).update(JSON.stringify(fields)).digest('hex');
}

export function matchesTag(actual: unknown, expected: string): boolean {
  return typeof actual === 'string' && /^[a-f0-9]{64}$/.test(actual) &&
    crypto.timingSafeEqual(Buffer.from(actual, 'hex'), Buffer.from(expected, 'hex'));
}

export function createPairingKey() {
  const keypair = crypto.generateKeyPairSync('x25519');
  return {
    publicKey: keypair.publicKey.export({ type: 'spki', format: 'der' }).toString('base64url'),
    privateKey: keypair.privateKey,
  };
}

export function pairCommitment(from: string, to: string, publicKey: string, nonce: string): string {
  return crypto.createHash('sha256').update(JSON.stringify(['kr-pair-v1', from, to, publicKey, nonce])).digest('hex');
}

export function derivePairSecret(
  initiator: string,
  responder: string,
  initiatorKey: string,
  responderKey: string,
  nonce: string,
  ownKey: ReturnType<typeof createPairingKey>,
) {
  if (!PUBLIC_KEY.test(initiatorKey) || !PUBLIC_KEY.test(responderKey) || !TOKEN.test(nonce)) {
    throw new Error('Invalid pairing key.');
  }
  const otherKey = ownKey.publicKey === initiatorKey ? responderKey : initiatorKey;
  const publicKey = crypto.createPublicKey({ key: Buffer.from(otherKey, 'base64url'), type: 'spki', format: 'der' });
  const shared = crypto.diffieHellman({ privateKey: ownKey.privateKey, publicKey });
  const transcript = JSON.stringify(['kr-pair-v1', initiator, responder, initiatorKey, responderKey, nonce]);
  const secret = Buffer.from(crypto.hkdfSync('sha256', shared, Buffer.from(transcript), 'korean-reader-wifi', 32));
  const number = parseInt(signWifi(secret, 'compare').slice(0, 12), 16) % 1_000_000;
  return { secret, code: String(number).padStart(6, '0') };
}
