import { browser } from 'wxt/browser';
import type { PingMessage, PingResponse } from '@/types/messages';

function isPingMessage(message: unknown): message is PingMessage {
  return (
    typeof message === 'object' &&
    message !== null &&
    (message as { type?: unknown }).type === 'ping'
  );
}

export default defineBackground(() => {
  console.info('[Korean Reader] Background service worker started.');

  browser.runtime.onInstalled.addListener((details) => {
    console.info(`[Korean Reader] Extension ${details.reason}.`);
  });

  browser.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
    if (!isPingMessage(message)) {
      return false;
    }

    const response: PingResponse = {
      ok: true,
      version: browser.runtime.getManifest().version,
    };
    sendResponse(response);
    return false;
  });
});
