import type { KnownWordHistory } from './statistics';

export const accountActions = ['sign-in', 'sign-out', 'import', 'sync', 'edit'] as const;
export type AccountAction = typeof accountActions[number];
export interface AccountMessage {
  type: 'phase10-account';
  action: AccountAction;
  word?: string;
  known?: boolean;
}

export interface AccountView {
  email: string | null;
  imported: boolean;
  count: number;
  pending: number;
  lastSync: number | null;
  history: KnownWordHistory | null;
  timeZone: string | null;
  notice?: string;
}

export type AccountResponse = { ok: true; view: AccountView } | { ok: false; error: string };

export const accountEnabled = import.meta.env.CHROME && import.meta.env.MANIFEST_VERSION === 3 &&
  Boolean(import.meta.env.WXT_PUBLIC_FIREBASE_API_KEY && import.meta.env.WXT_PUBLIC_FIREBASE_AUTH_DOMAIN &&
    import.meta.env.WXT_PUBLIC_FIREBASE_PROJECT_ID && import.meta.env.WXT_PUBLIC_FIREBASE_APP_ID &&
    import.meta.env.WXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID);

export function isAccountMessage(message: unknown): message is AccountMessage {
  if (!accountEnabled || !message || typeof message !== 'object') return false;
  const candidate = message as Partial<AccountMessage>;
  return candidate.type === 'phase10-account' && accountActions.includes(candidate.action!) &&
    (candidate.action !== 'edit' || (typeof candidate.word === 'string' && typeof candidate.known === 'boolean'));
}
