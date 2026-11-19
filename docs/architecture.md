# Architecture — Korean Reader

## Plain-English overview

Korean Reader is a Chrome extension that turns Korean YouTube subtitles into a vocabulary workflow. The extension reads the caption text YouTube is already showing, analyzes the Korean locally, and places an interactive subtitle layer over the video. Clicking a word asks the dictionary service for an entry. Choosing **Mine Word** saves the selected meaning, sentence, video details, and available media. Choosing **Known** records the headword's local known status. The user can later review mined vocabulary and explicitly send it to Anki.

The extension is split into three parts. The YouTube page part watches captions and displays the subtitle and dictionary interfaces. The background part coordinates work, runs Korean analysis, accesses local storage, and makes external requests. The popup and Settings pages let the user manage vocabulary, keys, imports, and Anki settings. They communicate through typed extension messages so each part has a clear job.

| System | What it does | Why it is used |
|---|---|---|
| Chrome Manifest V3 + WXT | Packages the extension, its page scripts, background worker and settings pages. | WXT provides a structured build workflow while Manifest V3 is Chrome's extension platform. |
| Vue 3 + TypeScript | Builds the interactive subtitle, popup and Settings interfaces. | Vue handles changing UI state; TypeScript makes message and data shapes clearer and safer to maintain. |
| Tailwind CSS | Styles the extension interfaces. | Shared utility styling keeps the compact interfaces consistent without a separate styling framework. |
| Kiwi WebAssembly + bundled model | Splits Korean text into words and identifies dictionary forms locally in the background worker. | Korean grammar needs morphological analysis; bundling the runtime and model avoids sending subtitle text to a processing service and complies with MV3's no-remote-code rule. |
| KRDict API | Supplies Korean dictionary entries and details. | It provides the project's selected Korean-English dictionary. The user supplies the key, stored locally; only lookup terms are sent. |
| IndexedDB | Stores vocabulary, dictionary cache, sentences, screenshots and audio clips. | It supports larger structured local records and keeps the user's collection on their device. |
| `chrome.storage.local` | Stores settings such as the KRDict key and Anki configuration. | It is the browser's built-in local store for extension settings. |
| AnkiConnect | Sends notes and media to Anki Desktop and imports known words from a selected deck. | It reuses the user's existing Anki note type and local collection; review scheduling stays in Anki. |
| Vitest + Vue Test Utils + jsdom | Tests services and UI components. | They provide fast automated checks without requiring a browser for every change. Chrome fixture checks cover extension flows where browser behavior matters. |

The background service worker is the single owner of the extension's stored data and network calls. It can stop when idle under Manifest V3, so operations are message-driven and the worker wakes when needed. Dictionary lookups contact KRDict; AnkiConnect calls go to the local Anki Desktop endpoint. The current build stores vocabulary and progress locally. The [Phase 10 plan](account-sync.md) describes proposed account-scoped storage and Firebase sync.

Current status is Phase 8. Screenshot/audio capture, Anki known-word imports and definition selection are implemented; their remaining live checks are listed in [PROJECT_STATUS.md](../PROJECT_STATUS.md).

## 1. Purpose

Korean Reader is a personal Chrome Manifest V3 extension for learning Korean from YouTube. This document records the runtime structure and the decisions that must remain consistent as features are added.

The extension covers YouTube captions and the Phase 9 transcript sidebar, interactive words, dictionary lookup, local vocabulary management, progress statistics and Anki sync. Phase 8 added screenshot and audio capture, import tools and selectable definitions. Remaining live checks are tracked in [PROJECT_STATUS.md](../PROJECT_STATUS.md).

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
  ├─ reads vocabulary summary ─────────────────────► background / IndexedDB
  └─ Sync to Anki ─────────────────────────────────► background ──► AnkiConnect
```

## 5. Storage Model

### IndexedDB

`services/storage/database.ts` caches and reuses a single shared `IDBDatabase` connection across storage callers within a background service worker lifecycle, clearing and releasing it automatically on `versionchange` or `close` events (while still reopening transparently if the MV3 service worker restarts).

Object stores:

- `vocabulary` — one record per normalized dictionary headword. IndexedDB schema version 2 adds this store and preserves the existing dictionary cache. Version 3 adds the `status` index used for known-word reads and counts.
- `dictionaryCache` — cached KRDict results keyed by individual resolved headword/candidate (`headword-v1`) so different conjugations of a word reuse the cached entry without repeating requests, with fallback/legacy candidate-list (`exact-v4`) entries backfilled on hit.

### `chrome.storage.local`

- KRDict API key.
- Default Anki deck.
- Anki note type and field mapping.
- Subtitle appearance preferences.
- Other small user settings.
- `vocabularyRevision` — change notification for subtitle tabs, the toolbar popup and Statistics (see Vocabulary Model).

Do not store the API key in source code, a committed `.env` file or the built bundle.

## 6. Vocabulary Model

The stored record extends the dictionary entry with its known status, creation and update dates, optional machine-translated definitions, and one or more subtitle contexts. Each context includes the clicked form, subtitle text, YouTube URL and title, playback timestamp when available, and date mined.

- The normalized headword is the IndexedDB key. Adding a context uses a single read-write transaction to prevent duplicates across tabs.
- Repeating the same subtitle text from the same video leaves the stored record as it was. A different context can be saved explicitly using **Save Sentence**.
- Mining marks the word as known. The dictionary popup's **Known** action uses the same background storage operation as known-word imports. It preserves existing data, and a newly marked word starts with no mined contexts. Settings can toggle known status and edit English definitions. The Settings list (`VocabularyManager.vue`) holds records in a `shallowRef`, caches each record's lower-cased search text, debounces search by 250 ms, and renders 50 entries per page with a load-more control. Changing the search, filter or sort order returns to the first page; edits keep the revealed page.
- Subtitle tabs read known headwords from the background and refresh when the vocabulary revision changes. The background reads them through the `status` index (`getAllKeys('known')`), so screenshots and audio are not loaded. A revision for a single-word change (Known, Mine Word, status toggle, delete) carries `known`/`unknown` headword lists, which tabs apply to their cached set. A revision without these lists, such as after an Anki import, makes tabs reload the full set. Sub-word known checks (`services/korean/dictionary-forms.ts`) decompose Kiwi morphemes into lexical units across endings, particles, productive suffixes (`들`, `쯤`, `씩`, `끼리`), and copula (`VCP`) boundaries, require all parts (including explicit `이다`) to be known, treat colloquial contraction aliases symmetrically, and check unspaced compound nouns as a whole first before splitting into constituent parts (`resolveRenderTokens`). Unmatched clickable sub-words are underlined, while standalone particles and productive suffixes render as plain text without underlines.
- JSON export includes the complete vocabulary collection. Anki sync uses the stored contexts and saves the returned note ID and sync time.

## 7. Subtitle Overlay

The extension hides YouTube's native caption line and renders its own interactive overlay.

Implemented behaviour (Phase 1 and Phase 2):

- Captions are observed primarily with `MutationObserver` on `.ytp-caption-window-container` (reading `.ytp-caption-window-container :is(.caption-window, .ytp-caption-window-rollup)` with fallback to `.caption-window, .ytp-caption-window-rollup`). Fallback 250 ms polling runs only while on an active video page before the caption container mounts, and a one-shot settle timer is used only while a roll-up phrase is pending. Monitoring pauses automatically off video pages and while the tab is hidden (`visibilitychange`).
- Caption extraction reads DOM text nodes directly instead of `innerText` (avoiding synchronous layout recalculations) and caches visibility checks per read across shared container/player ancestors after fast-pathing inline-hidden attributes/styles. Polling/observing whole caption windows rather than trusting `video.textTracks` remains necessary because YouTube normally manages captions internally and leaves that API empty.
- Korean is detected from Hangul Unicode ranges (`U+1100–U+11FF`, `U+3131–U+318E`, `U+AC00–U+D7A3`). Caption-track metadata is also checked when YouTube exposes it.
- YouTube's native caption text is made transparent while the overlay is showing. The caption DOM remains in place and readable, avoiding the oscillation that `display: none` would cause.
- Only the active `#movie_player` is marked, so miniplayers and previews keep their native captions.
- The overlay is a Vue app mounted in a Shadow DOM host appended to the player. It renders the
  placeholder soft-font stack and makes only the subtitle word spans interactive.
- Clicking a word pauses the active YouTube video before opening the dictionary lookup.
- An explicit mine action records up to 12 seconds from the video element. It uses matching text-track cue times when available. Otherwise it seeks slightly before the first observation and stops when the selected rendered caption changes during replay. Roll-up timing uses the observations of the words in the grouped phrase.
- The content script records audio as WebM/Opus with no additional Chrome permission. It discards clips that are silent, interrupted or missing a usable playback range. The background worker validates and stores the clip with its sentence and uploads it to AnkiConnect during explicit sync.
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
- `services/korean/tokenizer.ts` uses `decomposeMorphemes` from `services/korean/dictionary-forms.ts` to split Kiwi morphemes into original-text-preserving clickable lexical tokens (merging overlapping mid-character contractions, leaving clean particles and productive suffixes `들`/`쯤`/`씩`/`끼리` as plain text, preserving `XPN` prefixes and word-forming `XSN` suffixes, and attaching `parts` to unspaced compound nouns for whole-or-split rendering).
- `services/korean/tokenize-client.ts` batches concurrent `tokenize` requests from the content script and transcript sidebar into microtask-coalesced messages (up to 50 unique lines per message) and shares a 500-line in-memory LRU cache per YouTube tab across the overlay, sidebar, and video rewinds (re-indexing compound `parts` alongside top-level tokens).
- The content script and `TranscriptRow` send caption lines through `tokenize-client.ts` via the typed `tokenize` message (skipping non-Korean lines).
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
