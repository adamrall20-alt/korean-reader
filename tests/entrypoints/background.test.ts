import { beforeAll, describe, expect, it, vi } from 'vitest';

const { listeners } = vi.hoisted(() => ({
  listeners: {
    installed: [] as Array<(...args: unknown[]) => void>,
    message: [] as Array<(...args: unknown[]) => boolean | undefined>,
  },
}));

vi.mock('wxt/browser', () => ({
  browser: {
    runtime: {
      getURL: (path: string) => `chrome-extension://test${path}`,
      getManifest: () => ({ version: '0.1.0' }),
      onInstalled: {
        addListener: (listener: (...args: unknown[]) => void) => {
          listeners.installed.push(listener);
        },
      },
      onMessage: {
        addListener: (listener: (...args: unknown[]) => boolean | undefined) => {
          listeners.message.push(listener);
        },
      },
    },
  },
}));

describe('background entrypoint', () => {
  beforeAll(async () => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.stubGlobal('defineBackground', (main: () => void) => main());
    await import('@/entrypoints/background');
  });

  it('registers the install and message listeners', () => {
    expect(listeners.installed).toHaveLength(1);
    expect(listeners.message).toHaveLength(1);
  });

  it('responds to a ping with the extension version', () => {
    const messageListener = listeners.message[0]!;
    const sendResponse = vi.fn();
    const result = messageListener({ type: 'ping' }, {}, sendResponse);

    expect(result).toBe(false);
    expect(sendResponse).toHaveBeenCalledWith({ ok: true, version: '0.1.0' });
  });

  it('ignores messages it does not understand', () => {
    const messageListener = listeners.message[0]!;
    const sendResponse = vi.fn();
    const result = messageListener({ type: 'unknown' }, {}, sendResponse);

    expect(result).toBe(false);
    expect(sendResponse).not.toHaveBeenCalled();
  });
  it('rejects malformed mining requests and blocks vocabulary listing from YouTube', () => {
    const messageListener = listeners.message[0]!;
    const sender = { url: 'https://www.youtube.com/watch?v=abcdefghijk' };
    const sendResponse = vi.fn();

    expect(messageListener({ type: 'mine-word', entry: {} }, sender, sendResponse)).toBe(false);
    expect(messageListener({ type: 'list-vocabulary' }, sender, sendResponse)).toBe(false);
    expect(sendResponse).not.toHaveBeenCalled();
  });

});
