# Architecture — Korean Reader

## 1. Purpose

Korean Reader is a personal Chrome Manifest V3 extension for learning Korean from YouTube. This document records the runtime structure and the decisions that must remain consistent as features are added.

Phase 0 currently implements the foundation only. Later sections describe planned behaviour and are marked accordingly.

## 2. Runtime Components

| Component | Location | Responsibility |
|---|---|---|
| Background service worker | `entrypoints/background.ts` | Owns IndexedDB, settings, KRDict and AnkiConnect requests; coordinates messages |
| Content script | `entrypoints/content.ts` | Runs on YouTube, reads captions, renders the custom subtitle overlay and dictionary popup in a Shadow DOM |
| Toolbar popup | `entrypoints/popup/` + `components/MiningPanel.vue` | Vocabulary review and Anki synchronisation UI |
| Options page | `entrypoints/options/` + `components/SettingsPanel.vue` | Settings UI, including the local KRDict key |
| Services | `services/` | Isolated YouTube, dictionary, Korean, Anki and storage logic |
| Shared types | `types/` | Message payloads and shared data types |

## 3. Data Ownership

The background service worker is the single source of truth for application data.

- IndexedDB is opened and modified only by the background service worker.
- Settings and the KRDict API key live in `chrome.storage.local` and are read by the background.
- The content script never reads the API key, never opens extension-origin IndexedDB and never calls KRDict or AnkiConnect directly.
- The popup and options page request data through the background rather than keeping separate copies of application state.
- Messages are defined in `types/messages.ts` and validated before use.

### Why

Content scripts run in the YouTube page's context. Their IndexedDB access would not be the extension-origin database, and exposing credentials to page-adjacent code is avoidable. Centralising data and API access in the background keeps one source of truth and keeps the API key out of the page.

The Manifest V3 service worker can stop when idle. Messages from the content script, popup or options page wake it again. Do not rely on in-memory state surviving between messages.

## 4. Message Flow

```text
YouTube page
  └─ content script
       ├─ reads the currently displayed caption
       ├─ renders the custom subtitle overlay
       └─ on word click: opens dictionary popup
            ├─ sends lookup request ──────────────► background
            │                                        ├─ checks IndexedDB dictionary cache
            │                                        ├─ calls KRDict when needed
            │                                        └─ caches result
            └─ receives dictionary result ◄──────────┘

Dictionary popup
  └─ Mine Word ───────────────────────────────────► background
                                                     ├─ writes vocabulary entry
                                                     └─ marks word as known

Toolbar popup
  ├─ lists vocabulary ─────────────────────────────► background / IndexedDB
  └─ Sync to Anki ─────────────────────────────────► background ──► AnkiConnect
```

## 5. Storage Model

### IndexedDB

Planned object stores:

- `vocabulary` — one record per dictionary headword.
- `dictionaryCache` — cached KRDict results keyed by the searched form.

### `chrome.storage.local`

- KRDict API key.
- Default Anki deck.
- Anki note type and field mapping.
- Subtitle appearance preferences.
- Other small user settings.

Do not store the API key in source code, a committed `.env` file or the built bundle.

## 6. Vocabulary Model

Planned record shape:

```ts
interface VocabularyContext {
  sentence: string;
  sourceUrl: string;
  sourceTitle: string;
  timestamp?: number;
  minedAt: string;
}

interface VocabularyEntry {
  id: string;
  headword: string;
  originalForm: string;
  definitions: string[];
  partOfSpeech?: string;
  pronunciation?: string;
  contexts: VocabularyContext[];
  status: 'known' | 'unknown';
  ankiNoteId?: number;
  ankiSyncedAt?: string;
  createdAt: string;
  updatedAt: string;
}
```

Rules:

- One vocabulary record per dictionary headword.
- A word that has not been marked defaults to `unknown`.
- Mining a word sets `status` to `known`. The user can toggle it later.
- Additional example sentences are appended to `contexts`, not stored as duplicate vocabulary records.
- A maximum of one Anki card is allowed per headword.
- All saved sentences are placed in the Anki `Sentence` field, separated by newlines.

## 7. Subtitle Overlay

The extension hides YouTube's native caption line and renders its own interactive overlay.

- Use a softer placeholder font stack until the final font is chosen.
- Keep the overlay synchronised with the currently displayed caption.
- If extraction fails, leave the native captions visible rather than showing nothing.
- Render the overlay and dictionary popup in a Shadow DOM so YouTube CSS does not leak in.
- Use a high z-index and avoid blocking video controls.
- Handle YouTube's single-page navigation and caption enable/disable changes.

## 8. Dictionary Popup

- Opens only when a word is clicked.
- Appears directly above the selected word.
- Shifts horizontally or below the word only when there is not enough room above.
- Remains inside the browser viewport.
- Closes when the user clicks outside it.
- Updates when another word is clicked.
- Hovering never triggers a lookup or opens the popup.
- Clicking a word never mines it. Mining requires the explicit Mine Word button.

## 9. Korean Processing

Kiwi is the preferred analyser. Chrome Manifest V3 forbids remote code, so any Kiwi build must be bundled.

Before Phase 2, run a feasibility spike covering:

- bundled WebAssembly size;
- required Content Security Policy changes;
- performance on typical subtitle lines;
- whether the analyser should run in the content script, background worker or another extension context.

If bundled Kiwi is not practical, present alternatives and trade-offs before changing the stack.

## 10. Testing

- Unit and component tests use Vitest and Vue Test Utils.
- `tests/` contains the test suite.
- Run `npm run test:run` for a one-off run and `npm run compile` for type checking.
- Test expected behaviour, invalid input, API failures, storage failures and unexpected interactions as features are added.
- Browser-level testing is added only when it provides clear value.

## 11. Current Phase 0 State

Implemented:

- WXT, Vue 3, TypeScript, Tailwind CSS and Manifest V3 configuration.
- Background, content, popup and options entrypoints.
- Basic popup and settings shells.
- Background ping used by the popup to verify the messaging path.
- Component tests and a successful production build.

Not implemented:

- Subtitle detection or overlay.
- Korean tokenisation.
- Dictionary lookup.
- Vocabulary storage or mining.
- AnkiConnect integration.
- KRDict key entry.
