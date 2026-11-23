import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  modules: ['@wxt-dev/module-vue'],
  manifest: {
    name: 'Korean Reader',
    description: 'Korean and Japanese vocabulary mining for YouTube and webpages.',
    permissions: ['storage', 'activeTab', 'scripting'],
    host_permissions: ['https://krdict.korean.go.kr/*', 'http://127.0.0.1/*'],
    action: { default_title: 'Korean Reader' },
    content_security_policy: {
      extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self';",
    },
  },
  vite: () => ({
    plugins: [tailwindcss()],
  }),
});
