import dgram from 'node:dgram';
import os from 'node:os';
import { isLocalAddress } from './wifi-sync';

const DISCOVERY_PORT = 17422;

function ipv4(address: string): number {
  return address.split('.').reduce((number, part) => (number << 8) | Number(part), 0);
}

function dottedAddress(address: number): string {
  return [24, 16, 8, 0].map((shift) => (address >>> shift) & 255).join('.');
}

function interfaces() {
  return Object.values(os.networkInterfaces()).flatMap((entries) =>
    (entries ?? []).filter((entry) => entry.family === 'IPv4' && !entry.internal && isLocalAddress(entry.address)));
}

// Match the actual local subnet and the TCP interface reached by the peer.
export function localSyncAddress(remote: string, local?: string): string | undefined {
  if (!isLocalAddress(remote) || remote.startsWith('127.')) return undefined;
  return interfaces().find((entry) => (!local || local === entry.address) &&
    (ipv4(remote) & ipv4(entry.netmask)) === (ipv4(entry.address) & ipv4(entry.netmask)))?.address;
}

export async function startDiscovery(onMessage: (data: Buffer, host: string) => void, onError: () => void) {
  const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
  socket.on('message', (data, remote) => {
    if (data.byteLength <= 2048 && localSyncAddress(remote.address)) onMessage(data, remote.address);
  });
  await new Promise<void>((resolve, reject) => {
    socket.once('error', reject);
    socket.bind(DISCOVERY_PORT, () => {
      socket.off('error', reject);
      socket.on('error', onError);
      resolve();
    });
  });
  try {
    socket.setBroadcast(true);
  } catch (error) {
    socket.close();
    throw error;
  }

  return {
    broadcast(message: unknown) {
      const data = Buffer.from(JSON.stringify(message));
      const targets = new Set(interfaces().map((entry) => dottedAddress(ipv4(entry.address) | ~ipv4(entry.netmask))));
      for (const target of targets) socket.send(data, DISCOVERY_PORT, target, (error) => { if (error) onError(); });
    },
    close() { socket.close(); },
  };
}
