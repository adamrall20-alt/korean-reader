# TECH_STACK.md — Korean Reader

**Current scope:** Chrome handles mining and dictionary lookups. The desktop app handles review, practice, stats and Anki file import. Study data stays local.

## 1. Architecture Overview

Korean Reader is a locally operated Google Chrome extension.

Chrome uses local storage and KRDict for dictionary data. Desktop uses local SQLite, managed attachment files and FSRS.

Its main responsibilities are:

1. YouTube subtitle extraction.
2. Korean morphological analysis.
3. Dictionary lookup.
4. Vocabulary storage.
5. Desktop study and offline imports.
6. User interface rendering.

## 2. Core Technologies

### Extension Framework

**WXT**

Use WXT to manage Chrome extension development, entrypoints, building and Manifest V3 configuration.

Documentation: https://wxt.dev/

### Frontend Framework

**Vue 3**

Use Vue 3 for interface components and reactive state management.

### Programming Language

**TypeScript**

Use TypeScript throughout the application.

Avoid untyped JavaScript unless required by a third-party integration.

### Styling

**Tailwind CSS**

Use Tailwind CSS v4 for consistent styling and rapid interface development. It is compiled through the `@tailwindcss/vite` plugin. The shared style entry point is `assets/tailwind.css`.

Do not load remote fonts or remote stylesheets. The extension must work offline.

### Build System

**Vite**, managed through WXT.

## 3. Browser Extension Architecture

Use Chrome Extension Manifest V3.

Separate responsibilities between:

- Content scripts.
- Background service worker.
- Extension interface.
- Storage and application services.

### Data Ownership

The background service worker is the single source of truth for:

- IndexedDB vocabulary and dictionary cache data.
- `chrome.storage.local` settings, including the KRDict API key.
- KRDict API requests.
- Local desktop bridge requests.
- Duplicate detection.

The content script must never read the KRDict key, open extension-origin IndexedDB, or call KRDict or the desktop bridge directly. It sends typed messages to the background.

The popup and options pages also request data through the background rather than maintaining their own copies of application state. This avoids multiple competing sources of truth.

The background validates and stores the interface theme and subtitle appearance as separate preferences in `chrome.storage.local`. YouTube content scripts can request the public display preferences. Storage change notifications apply saved settings to open extension pages and subtitle overlays.

### Content Scripts

Responsible for:

- Detecting YouTube pages.
- Detecting rendered subtitles.
- Extracting subtitle text.
- Identifying subtitle updates.
- Hiding native captions and rendering the custom interactive subtitle overlay.
- Rendering the dictionary popup in an isolated Shadow DOM so YouTube styles do not leak into it.
- Sending dictionary lookup, mining and mark-known requests to the background.

### Transcript sidebar

Full transcripts use loaded Korean browser text tracks where available, then YouTube's same origin timed text or transcript response for the current watch page. A small page script reads YouTube's player metadata and returns only timed cue text to the isolated content script. No new extension permissions are needed. If YouTube's response is missing or fails, the sidebar uses the existing rendered caption monitor. Collected lines are kept for the current video in the tab. Timing can be estimated when YouTube exposes only rendered text.

The modern transcript request asks for Korean in its own request context. The older transcript endpoint can provide a Korean language option that the extension follows directly. Because YouTube can still return its default language, the sidebar checks that most letters are Hangul before accepting a full transcript. This check preserves occasional foreign phrases in Korean transcripts and rejects English transcripts that contain only a few Korean names or words.

The sidebar shares the background Kiwi tokenizer and the existing dictionary and vocabulary actions. It analyses Korean rows near the viewport through `services/korean/tokenize-client.ts`, which batches visible rows into a single `tokenize` request (up to 50 unique lines per message) and shares a 500-line per-tab in-memory cache with the subtitle overlay and video rewinds rather than submitting the full transcript at once. Mining seeks to the cue start before using the existing frame and audio capture.

### Background Service Worker

Responsible for:

- Coordinating extension functionality.
- Managing messages between extension components.
- IndexedDB and settings access.
- Dictionary and local desktop bridge calls.
- Handling operations requiring background execution.

Do not rely on the service worker remaining continuously active. It can be woken by messages.

### Interface

Responsible for:

- Dictionary popup inside the YouTube page.
- Vocabulary mining interface in the toolbar popup.
- Settings page.
- User interactions.

## 4. Korean Language Processing

Preferred library: Kiwi.

Repository: https://github.com/bab2min/Kiwi

Use Kiwi for:

- Korean tokenisation.
- Morphological analysis.
- Part-of-speech identification.
- Identifying dictionary forms.
- Analysing conjugated Korean words.

Before implementation, investigate the most suitable browser-compatible integration.

Consider WebAssembly or a lightweight local processing service.

Do not assume the native Kiwi library can execute directly inside a Chrome extension.

Chrome Manifest V3 forbids loading remote code, so Kiwi 0.24.1 is bundled as WebAssembly with local model assets and runs in the background worker. Feasibility was verified in Chrome. This keeps analysis local but makes the production bundle large (about 115 MB before zip compression).

## 5. Dictionary Integration

Preferred primary dictionary: National Institute of Korean Language (KRDict).

Website: https://krdict.korean.go.kr/

Use its official dictionary API where available.

Requirements:

- Store API credentials outside version-controlled source code.
- Handle API errors.
- Cache dictionary results locally.
- Avoid unnecessary repeated API requests.
- Support multiple definitions.
- Preserve dictionary metadata.

The KRDict API key is entered by the user in the Settings page and stored in `chrome.storage.local`. It must not be committed to Git, injected into the built bundle, or read by the content script. Only the background service worker uses it.

Investigate API registration, authentication, usage restrictions and response formats before implementation.

## 6. Local Storage

Use IndexedDB for persistent application data.

Potential stored information:

- Vocabulary entries.
- Dictionary cache.
- Example sentences.
- Source video information.
- Mining timestamps.
- Synchronisation status.
- User preferences where appropriate.

Use Chrome Storage API for appropriate extension configuration and settings.

IndexedDB access is centralised in the background service worker. Content scripts run in the YouTube page context and must not own extension-origin IndexedDB. Avoid maintaining multiple competing sources of truth.

### Known-word history

The IndexedDB statistics store keeps a baseline and the latest known-word count for each date. Chrome snapshots are delivered to Desktop over the loopback bridge and stored in SQLite. A separate IndexedDB store persists Known word revisions and offline changes. Chrome can link to Desktop with a local code and exchange Known statuses over the bridge. The Stats page lives in Desktop.

## 7. Desktop study and Anki package import

Electron runs the Vue renderer and holds SQLite and filesystem access in the main process. Profile stores the username in SQLite settings and calculates its progress from the Stats review history and Known-word count. TypeScript FSRS schedules cards from review ratings. A separate SQL table stores multiple-choice results. Desktop imports .apkg ZIP packages using `fflate`, Node SQLite and Node Zstandard decompression for modern collections and media. See [desktop architecture](docs/desktop-architecture.md) for the database and IPC details.

## 8. Application Architecture

Organise functionality into separate modules.

Suggested service responsibilities:

### youtube/

Subtitle detection, extraction and timestamp handling.

### korean/

Tokenisation, morphological analysis and dictionary-form identification.

### dictionary/

KRDict API communication, result processing and caching.

### desktop/

The extension bridge sends mined content and known-word snapshots to Desktop over loopback.

### storage/

IndexedDB operations and persistent application data.

### Messages

Message payloads are defined in `types/messages.ts`. Keep message handling on the background side and validate incoming payloads rather than trusting their shape.

### Components

Vue components should focus on presentation and user interaction.

Business logic should remain in appropriate services rather than being duplicated across components.

## 9. Testing

Use appropriate automated testing tools.

The current setup uses:

- Vitest for unit and component testing.
- Vue Test Utils for component tests.
- jsdom as the test DOM.
- Playwright later, only where browser-level extension testing is useful.

Test important functionality independently. Tests live in `tests/`. Run `npm run test:run` for a single non-watching run and `npm run compile` for type checking.

Prioritise tests for Korean word processing, dictionary lookup, storage and desktop imports as those features are added.

## 10. Dependencies and Constraints

- Prefer free and open-source dependencies.
- Avoid unnecessary external APIs.
- Avoid paid infrastructure.
- Do not introduce a cloud backend without approval.
- Do not expose API credentials.
- Maintain Chrome Manifest V3 compatibility.
- Document significant architectural decisions.

## 11. Architecture Flexibility

The technologies above represent the preferred initial stack.

If a specific library is unsuitable or incompatible with browser extension restrictions, explain the problem and propose alternatives before making significant architectural changes.

Reliability and compatibility take priority over strict adherence to a particular library.

## Word frequency

The background worker loads the bundled Shiberu Korean Word Frequency List 2026 (CC BY 4.0) on demand and matches normalized dictionary headwords. The original list, source credits and licence are in `public/frequency`. An absent headword displays `#80,000+`; segmentation or spelling differences can also cause absence.

## Transcript vocabulary coverage

`services/korean/coverage.ts` builds a unique lexical headword index from Kiwi morphemes, canonicalising supported contraction aliases. Counts are independent of known status and visual compound splitting; a known whole nominal compound can satisfy its component words. `TranscriptSidebar.vue` analyses every loaded Korean cue on opening, sequentially in batches of at most 50 through the existing tokenization client. Per-component line results avoid reanalysis when live captions grow or known status changes. Analysis is local, requires no dictionary calls or new permissions, and stale async results are ignored on cue/video changes and unmount. Sidebar rows retain their existing lazy analysis and shared cache.

The header displays known/total × 100 to one decimal; the exact count is available in its title and accessible label. Search does not affect coverage. Empty, loading, failure and partial collected-transcript states are explicit. Full-video coverage depends on a full transcript being available; it does not force unavailable YouTube subtitles to load.
