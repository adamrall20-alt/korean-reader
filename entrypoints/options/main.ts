import { observePreferences } from '@/services/storage/preferences';
import { createApp } from 'vue';
import '@/assets/tailwind.css';
import SettingsPanel from '@/components/SettingsPanel.vue';

const stop = observePreferences((theme) => { document.documentElement.dataset.theme = theme; });
window.addEventListener('pagehide', stop, { once: true });

createApp(SettingsPanel).mount('#app');
