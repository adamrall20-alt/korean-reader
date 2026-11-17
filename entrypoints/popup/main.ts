import { observePreferences } from '@/services/storage/preferences';
import { createApp } from 'vue';
import '@/assets/tailwind.css';
import MiningPanel from '@/components/MiningPanel.vue';

const stop = observePreferences((theme) => { document.documentElement.dataset.theme = theme; });
window.addEventListener('pagehide', stop, { once: true });

createApp(MiningPanel).mount('#app');
