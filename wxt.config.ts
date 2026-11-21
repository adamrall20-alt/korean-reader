import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';
import { prototypeExtensionKey } from './services/account/extension-key';

export default defineConfig({
  modules: ['@wxt-dev/module-vue'],
  manifest: ({ browser, manifestVersion, mode }) => {
    const clientId = process.env.WXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID;
    const accountEnabled = browser === 'chrome' && manifestVersion === 3 &&
      Boolean(process.env.WXT_PUBLIC_FIREBASE_API_KEY && process.env.WXT_PUBLIC_FIREBASE_AUTH_DOMAIN &&
        process.env.WXT_PUBLIC_FIREBASE_PROJECT_ID && process.env.WXT_PUBLIC_FIREBASE_APP_ID && clientId);
    const testBuild = mode === 'account-test';
    const name = testBuild ? 'Korean Reader (Account Test)' : 'Korean Reader';
    return {
      name,
      description: 'Korean vocabulary mining for YouTube and Korean webpages.',
      permissions: accountEnabled ? ['storage', 'activeTab', 'scripting', 'identity'] : ['storage', 'activeTab', 'scripting'],
      ...(accountEnabled && clientId ? {
        ...(testBuild ? { key: prototypeExtensionKey } : {}),
        oauth2: { client_id: clientId, scopes: ['openid', 'email', 'profile'] },
      } : {}),
      host_permissions: ['https://krdict.korean.go.kr/*', 'http://127.0.0.1/*', ...(accountEnabled ? [
        'https://identitytoolkit.googleapis.com/*', 'https://securetoken.googleapis.com/*',
        'https://firestore.googleapis.com/*',
      ] : [])],
      action: {
        default_title: name,
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
