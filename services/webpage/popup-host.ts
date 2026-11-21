import { createApp, h, nextTick, reactive, type CSSProperties } from 'vue';
import { browser } from 'wxt/browser';
import DictionaryPopup from '@/components/DictionaryPopup.vue';
import overlayStyles from '@/assets/subtitle-overlay.css?inline';
import { isKnownHeadword } from '@/services/korean/dictionary-forms';
import type { DictionaryEntry, LookupMessage, LookupResponse } from '@/types/messages';
import type { InterfaceTheme } from '@/types/preferences';
import type { VocabularyContext } from '@/types/vocabulary';
import type { ParsedWordSelection } from '@/services/webpage/parser';

const PAGE_POPUP_STYLES = `
.kr-dictionary-popup { font-size: 15px; line-height: 1.55; padding: 16px 18px; border-radius: 12px; }
.kr-dictionary-close { font-size: 1.15em; }
.kr-dictionary-original { margin: 0 1.4em 0.4em 0; font-size: 0.87em; }
.kr-dictionary-heading { gap: 0.45em; }
.kr-dictionary-heading h2 { font-size: 1.48em; }
.kr-dictionary-heading .kr-frequency { font-size: 1em; }
.kr-dictionary-section { margin-top: 0.8em; }
.kr-dictionary-section h3 { font-size: 0.87em; }
.kr-dictionary-definitions { margin: 0.45em 0 0; padding-left: 1.3em; }
.kr-dictionary-examples { margin-top: 0.85em; padding-top: 0.7em; font-size: 0.87em; }
.kr-mining-actions { margin-top: 0.8em; }
`;

export function createPagePopupHost(doc: Document, onClose: () => void) {
  let host: HTMLElement | null = null;
  let app: ReturnType<typeof createApp> | null = null;
  let lookupGeneration = 0;
  let anchorElement: HTMLElement | null = null;
  let knownHeadwords = new Set<string>();
  let theme: InterfaceTheme = 'dark';

  const state = reactive({
    open: false,
    entry: null as DictionaryEntry | null,
    originalForm: '',
    loading: false,
    error: null as string | null,
    style: {} as CSSProperties,
    miningContext: undefined as VocabularyContext | undefined,
    savedContexts: [] as VocabularyContext[],
    isKnown: false,
  });

  function positionPopup() {
    if (!anchorElement || !anchorElement.isConnected) return;
    const rect = anchorElement.getBoundingClientRect();
    const margin = 8;
    const gap = 10;
    const viewportWidth = window.innerWidth || 1024;
    const viewportHeight = window.innerHeight || 768;

    const popupEl = host?.shadowRoot?.querySelector('.kr-dictionary-popup') as HTMLElement | null;
    const popupRect = popupEl?.getBoundingClientRect();
    const popupWidth = popupRect && popupRect.width > 0 ? popupRect.width : Math.min(416, viewportWidth - margin * 2);
    const popupHeight = popupRect && popupRect.height > 0 ? popupRect.height : 260;

    const halfWidth = popupWidth / 2;
    const minCenterX = Math.min(halfWidth + margin, viewportWidth / 2);
    const maxCenterX = Math.max(viewportWidth - halfWidth - margin, viewportWidth / 2);
    const centerX = Math.min(Math.max(rect.left + rect.width / 2, minCenterX), maxCenterX);

    const spaceAbove = rect.top - gap - margin;
    const spaceBelow = viewportHeight - rect.bottom - gap - margin;
    const placeBelow = spaceAbove < popupHeight && spaceBelow >= spaceAbove;

    const topY = placeBelow
      ? Math.min(rect.bottom + gap, Math.max(margin, viewportHeight - Math.min(popupHeight, viewportHeight - margin * 2) - margin))
      : Math.max(rect.top - gap, Math.min(viewportHeight - margin, Math.min(popupHeight, viewportHeight - margin * 2) + margin));
    const maxHeight = Math.max(160, Math.min(416, placeBelow ? viewportHeight - topY - margin : topY - margin));

    state.style = {
      left: `${centerX}px`,
      top: `${topY}px`,
      transform: placeBelow ? 'translate(-50%, 0)' : 'translate(-50%, -100%)',
      width: 'min(416px, calc(100vw - 16px))',
      maxHeight: `${maxHeight}px`,
    };
  }

  function close() {
    lookupGeneration += 1;
    state.open = false;
    state.entry = null;
    state.error = null;
    state.loading = false;
    anchorElement = null;
    onClose();
  }

  function onDocumentPointerDown(event: PointerEvent) {
    if (!state.open) return;
    const path = event.composedPath();
    if (host && path.includes(host)) return;
    if (anchorElement && path.includes(anchorElement)) return;
    close();
  }

  function onKeyDown(event: KeyboardEvent) {
    if (event.key === 'Escape' && state.open) close();
  }

  function mount() {
    if (host) return;
    host = doc.createElement('div');
    host.id = 'kr-page-popup-host';
    host.dataset.theme = theme;
    host.style.cssText = 'position: fixed; inset: 0; z-index: 2147483647; pointer-events: none;';
    const shadow = host.attachShadow({ mode: 'open' });
    const styleEl = doc.createElement('style');
    styleEl.textContent = `${overlayStyles}\n${PAGE_POPUP_STYLES}`;
    shadow.appendChild(styleEl);

    const mountPoint = doc.createElement('div');
    shadow.appendChild(mountPoint);
    (doc.body ?? doc.documentElement).appendChild(host);

    app = createApp({
      render() {
        if (!state.open) return null;
        return h(DictionaryPopup, {
          entry: state.entry,
          originalForm: state.originalForm,
          loading: state.loading,
          error: state.error,
          style: state.style,
          miningContext: state.miningContext,
          savedContexts: state.savedContexts,
          isKnown: state.isKnown,
          onClose: close,
          onResize: positionPopup,
        });
      },
    });
    app.mount(mountPoint);

    doc.addEventListener('pointerdown', onDocumentPointerDown, true);
    doc.addEventListener('keydown', onKeyDown, true);
  }

  async function openForWord(selection: ParsedWordSelection) {
    mount();
    anchorElement = selection.element;
    state.open = true;
    state.originalForm = selection.token.text;
    state.entry = null;
    state.error = null;
    state.loading = true;
    state.savedContexts = [];
    state.isKnown = false;
    state.miningContext = {
      originalForm: selection.token.text,
      sentence: selection.sentence,
      sourceTitle: doc.title || location.hostname,
      sourceUrl: location.href,
    };
    positionPopup();

    const currentGeneration = ++lookupGeneration;
    try {
      const response: LookupResponse | undefined = await browser.runtime.sendMessage({
        type: 'lookup',
        word: selection.token.text,
        morphemes: selection.token.morphemes,
      } satisfies LookupMessage);
      if (currentGeneration !== lookupGeneration) return;
      if (!response?.ok) {
        state.error = response?.error ?? 'Dictionary lookup failed.';
      } else if (!response.entry) {
        state.error = `No dictionary entry found for “${selection.token.text}”.`;
      } else {
        state.entry = response.entry;
        state.savedContexts = response.savedContexts ?? [];
        state.isKnown = isKnownHeadword(response.entry.headword, knownHeadwords);
      }
    } catch {
      if (currentGeneration === lookupGeneration) {
        state.error = 'Could not reach Korean Reader. Reload the page and try again.';
      }
    } finally {
      if (currentGeneration === lookupGeneration) {
        state.loading = false;
        await nextTick();
        positionPopup();
      }
    }
  }

  return {
    openForWord,
    close,
    setKnownHeadwords(headwords: ReadonlySet<string>) {
      knownHeadwords = new Set(headwords);
      if (state.entry) {
        state.isKnown = isKnownHeadword(state.entry.headword, knownHeadwords);
      }
    },
    setTheme(nextTheme: InterfaceTheme) {
      theme = nextTheme;
      if (host) host.dataset.theme = theme;
    },
    destroy() {
      close();
      doc.removeEventListener('pointerdown', onDocumentPointerDown, true);
      doc.removeEventListener('keydown', onKeyDown, true);
      app?.unmount();
      app = null;
      host?.remove();
      host = null;
    },
  };
}
