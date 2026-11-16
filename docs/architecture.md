# Architecture — Korean Reader

## 1. Purpose

Korean Reader is a personal Chrome Manifest V3 extension for learning Korean from YouTube. This document records the runtime structure and the decisions that must remain consistent as features are added.

Phase 0 implements the foundation. Phase 1 implements YouTube caption extraction and the custom subtitle overlay. Phases 2 and 3 implement interactive words, dictionary lookup and local dictionary caching. Phase 4 adds local vocabulary mining and management. Phase 5 adds selected-word sync through a loopback AnkiConnect endpoint.

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

Object stores:

- `vocabulary` — one record per normalized dictionary headword. IndexedDB schema version 2 adds this store and preserves the existing dictionary cache.
- `dictionaryCache` — cached KRDict results keyed by the ordered lookup candidates.

### `chrome.storage.local`

- KRDict API key.
- Default Anki deck.
- Anki note type and field mapping.
- Subtitle appearance preferences.
- Other small user settings.

Do not store the API key in source code, a committed `.env` file or the built bundle.

## 6. Vocabulary Model

The stored record extends the dictionary entry with its known status, creation and update dates, optional machine-translated definitions, and one or more subtitle contexts. Each context includes the clicked form, subtitle text, YouTube URL and title, playback timestamp when available, and date mined.

- The normalized headword is the IndexedDB key. Adding a context uses a single read-write transaction to prevent duplicates across tabs.
- Repeating the same subtitle text from the same video leaves the stored record as it was. A different context can be saved explicitly using **Save Sentence**.
- Mining marks the word as known. The toolbar popup can toggle known status and edit English definitions.
- Subtitle tabs read known headwords from the background and refresh when the vocabulary revision changes. Exact text, Kiwi predicate forms, and nouns with particles can match a known headword. Unmatched words are underlined in red.
- JSON export includes the complete vocabulary collection. Anki sync uses the stored contexts and saves the returned note ID and sync time.

## 7. Subtitle Overlay

The extension hides YouTube's native caption line and renders its own interactive overlay.

Implemented behaviour (Phase 1 and Phase 2):

- Captions are read from YouTube's rendered DOM every 250 ms, using `.ytp-caption-window-container .caption-window` with a fallback to `.caption-window`.
- Polling reads whole caption exports rather than trusting `video.textTracks`, because YouTube normally manages captions internally and leaves that API empty.
- Korean is detected from Hangul Unicode ranges (`U+1100–U+11FF`, `U+3131–U+318E`, `U+AC00–U+D7A3`). Caption-track metadata is also checked when YouTube exposes it.
- YouTube's native caption text is made transparent while the overlay is showing. The caption DOM remains in place and readable, avoiding the oscillation that `display: none` would cause.
- Only the active `#movie_player` is marked, so miniplayers and previews keep their native captions.
- The overlay is a Vue app mounted in a Shadow DOM host appended to the player. It renders the
  placeholder soft-font stack and makes only the subtitle word spans interactive.
- Clicking a word pauses the active YouTube video before opening the dictionary lookup.
- Kiwi tokenization runs through the background `tokenize` message before native captions are
  hidden. If analysis fails, native captions remain visible.
- When Korean captions stop, native captions are restored after a 500 ms delay. If extraction never produces Korean text, native captions were never hidden.
- The presenter resets immediately when the video ID changes, and the monitor reacts to YouTube's single-page navigation events.
- Use a high z-index and avoid blocking video controls.

## 8. Dictionary Popup

- Opens only when a word is clicked.
- Appears directly above the selected word.
- Shifts horizontally or below the word only when there is not enough room above.
- Remains inside the browser viewport.
- Closes when the user clicks outside it.
- Updates when another word is clicked.
- Hovering never triggers a lookup or opens the popup.
- The popup uses enlarged text and displays up to three definitions, preferring English and falling back to Korean. It repositions
  after the lookup finishes, and earlier responses cannot replace a newer selection.
- Clicking a word never mines it. Mining requires the explicit Mine Word button.

## 9. Korean Processing

Kiwi 0.24.1 is bundled with the extension as WebAssembly and local `cong` model assets.
Chrome Manifest V3 forbids remote code, so all runtime files are packaged under `public/`.
The resulting production extension is approximately 114.9 MB before zip compression.

The background service worker owns Kiwi initialization and tokenization:

- `services/korean/kiwi.ts` lazily initializes one Kiwi instance and loads local assets.
- `services/korean/tokenizer.ts` converts Kiwi morphemes into original-text-preserving
  clickable word segments.
- The content script sends caption lines through the typed `tokenize` message.
- The subtitle overlay renders the returned segments without exposing dictionary or storage logic.

The manifest includes `wasm-unsafe-eval` for extension pages. Dictionary-form candidates are
generated from Kiwi lexical morphemes before KRDict lookup.

## 10. Testing

- Unit and component tests use Vitest and Vue Test Utils.
- `tests/` contains the test suite.
- Run `npm run test:run` for a one-off run and `npm run compile` for type checking.
- Test expected behaviour, invalid input, API failures, storage failures and unexpected interactions as features are added.
- Browser-level testing is added only when it provides clear value.

## 11. Current Implementation State

Implemented:

- WXT, Vue 3, TypeScript, Tailwind CSS and Manifest V3 configuration.
- Background, content, popup and options entrypoints.
- Basic popup and settings shells.
- Background ping used by the popup to verify the messaging path.
- YouTube page detection and DOM-based caption extraction.
- Korean caption detection, timestamp capture and change polling.
- Shadow DOM subtitle overlay, scoped native caption hiding and automatic fallback.
- Phase 1 verification in Chrome on 16 November 2026.
- Local vocabulary persistence, mining controls, a toolbar management panel and JSON export.
- Unit, component and service tests plus a successful production build.

- AnkiConnect discovery, mapping, single and bulk sync, and existing-note sentence updates. See `docs/anki-integration.md`.

Key Phase 1 modules:

| Module | Responsibility |
|---|---|
| `services/youtube/captions.ts` | Page/video lookup, caption extraction, Korean detection, timestamps, polling monitor |
| `services/youtube/native-captions.ts` | Scoped native caption hiding style and class |
| `services/youtube/overlay.ts` | Shadow DOM host and Vue overlay lifecycle |
| `services/youtube/presenter.ts` | Show/hide timing, active-player scoping and native-caption fallback |
| `components/SubtitleReader.vue` | Reactive subtitle line rendering |
| `assets/subtitle-overlay.css` | Overlay positioning, font stack and legibility styling |
