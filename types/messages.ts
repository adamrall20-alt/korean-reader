export interface PingMessage {
  type: 'ping';
}

export interface PingResponse {
  ok: boolean;
  version: string;
}

export type ExtensionMessage = PingMessage;
