import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';
import { prototypeExtensionKey } from './services/account/extension-key';

export default defineConfig({
  modules: ['@wxt-dev/module-vue'],
  manifest: ({ browser, manifestVersion }) => {
    const clientId = process.env.WXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID;
    const accountEnabled = browser === 'chrome' && manifestVersion === 3 &&
      Boolean(process.env.WXT_PUBLIC_FIREBASE_API_KEY && process.env.WXT_PUBLIC_FIREBASE_AUTH_DOMAIN &&
        process.env.WXT_PUBLIC_FIREBASE_PROJECT_ID && process.env.WXT_PUBLIC_FIREBASE_APP_ID && clientId);
    return {
      name: 'Korean Reader',
      description: 'Personal Korean vocabulary mining for YouTube.',
      permissions: accountEnabled ? ['storage', 'identity'] : ['storage'],
      ...(accountEnabled && clientId ? {
        key: prototypeExtensionKey,
        oauth2: { client_id: clientId, scopes: ['openid', 'email', 'profile'] },
      } : {}),
      host_permissions: ['https://krdict.korean.go.kr/*', 'http://127.0.0.1/*', ...(accountEnabled ? [
        'https://identitytoolkit.googleapis.com/*', 'https://securetoken.googleapis.com/*',
        'https://firestore.googleapis.com/*',
      ] : [])],
      action: {
        default_title: 'Korean Reader',
      },
      content_security_policy: {
        extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self';",
      },
    };
  },
  vite: () => ({
    plugins: [tailwindcss()],
  }),
});
