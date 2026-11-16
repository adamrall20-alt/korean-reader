import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  modules: ['@wxt-dev/module-vue'],
  manifest: {
    name: 'Korean Reader',
    description: 'Personal Korean vocabulary mining for YouTube.',
    permissions: ['storage'],
    action: {
      default_title: 'Korean Reader',
    },
  },
  vite: () => ({
    plugins: [tailwindcss()],
  }),
});
