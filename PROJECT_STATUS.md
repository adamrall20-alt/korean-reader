# PROJECT_STATUS.md — Korean Reader

## Current Project State

**Status:** Phase 5 implemented and verified in Chrome with a loopback AnkiConnect fixture
**Current Phase:** Phase 6 — Reliability and Testing
**Last Updated:** 16 November 2026

## Completed

- [x] Initial product concept established.
- [x] Core user workflow defined.
- [x] Click-to-lookup interaction established.
- [x] Explicit Mine Word interaction established.
- [x] AnkiConnect selected for Anki integration.
- [x] Initial design direction established.
- [x] Preferred technology stack identified.
- [x] Development roadmap established.
- [x] Project documentation added.
- [x] WXT project configured.
- [x] Vue 3 configured.
- [x] TypeScript configured.
- [x] Tailwind CSS configured.
- [x] Chrome Manifest V3 configured.
- [x] Initial directory structure established.
- [x] Background, content, popup and options entrypoints created.
- [x] Popup and settings UI shells created.
- [x] Basic testing infrastructure established.
- [x] Automated tests pass.
- [x] Type check passes.
- [x] Production build succeeds.
- [x] Manual verification of the unpacked extension in Chrome.
- [x] YouTube video page detection, including `/watch`, `/shorts/` and `/live/` URLs.
- [x] Caption extraction from YouTube's rendered caption windows.
- [x] Korean detection using Hangul ranges and caption-track metadata where available.
- [x] Caption polling with deduplication and video timestamp capture.
- [x] Shadow DOM subtitle overlay using the placeholder soft-font stack.
- [x] Native caption hiding scoped to the active player.
- [x] Automatic fallback to native captions when Korean captions stop or extraction fails.
- [x] YouTube single-page navigation and caption toggle handling.
- [x] Kiwi WASM feasibility verified in Chrome.
- [x] Bundled Kiwi WASM and local model assets.
- [x] Background Korean tokenization message flow.
- [x] Korean subtitle words rendered as clickable spans.
- [x] Selected-word visual state without dictionary lookup.
- [x] KRDict lookup service and worker-safe XML response parsing.
- [x] KRDict API key storage through Settings.
- [x] Dictionary popup with definitions, pronunciation and part of speech.
- [x] Dictionary lookup errors and missing-entry messages.
- [x] English dictionary definitions in the popup.
- [x] IndexedDB dictionary-result caching.
- [x] Dictionary cache clearing from Settings.
- [x] Dictionary-form candidates built from Kiwi lexical morphemes.
- [x] Enlarged dictionary popup for improved readability.
- [x] Dictionary popup positioned within the browser viewport.
- [x] Dictionary popup shows up to three English definitions, with Korean definitions as a fallback.
- [x] YouTube video pauses when a subtitle word is selected.
- [x] Direct Settings button added to the toolbar popup.

- [x] Exact KRDict headword matching and optional entry details (pronunciation, conjugations, Hanja and examples).
- [x] Popup ignores older lookup responses and repositions after content changes.

- [x] On-demand Korean definition translation via Chrome’s on-device Translator API, covered with component tests.

- [x] Explicit vocabulary mining with one local record per normalized headword.
- [x] Red underlines for unknown subtitle words, updated when vocabulary status changes.
- [x] Save subtitle context, original form, video source, playback timestamp, and mining date.
- [x] Vocabulary panel with search, date sorting, status filtering, definition editing, deletion, and JSON export.

- [x] AnkiConnect connection and field mapping, one-click sync, duplicate detection, incremental sentence updates, and sync results.
- [x] Compact toolbar with an unsynced count and collapsed vocabulary management. Missing English is translated on-device when possible and saved before Anki sync.

The user confirmed the Phase 2–3 workflow on a live YouTube video, including on-device definition translation.

## In Progress

- [ ] Verify Phase 5 against the user’s AnkiConnect configuration, collection and existing card templates.

## Not Started

### Phase 6 — Reliability and Testing

Not started.

### Phase 7 — Interface Refinement

Not started.

## Phase 0 Checklist

- [x] Git repository initialised.
- [x] WXT project created.
- [x] Vue configured.
- [x] TypeScript configured.
- [x] Tailwind configured.
- [x] Chrome extension manifest configured.
- [x] Initial entrypoints created.
- [x] Basic UI shells created.
- [x] Basic testing infrastructure established.
- [x] Automated tests pass.
- [x] Type check passes.
- [x] Production build succeeds.
- [x] Extension loaded and verified in Chrome by the user.

## Phase 1 Checklist

- [x] Detect YouTube video pages.
- [x] Detect available subtitle tracks where YouTube exposes them.
- [x] Identify Korean subtitles.
- [x] Extract currently rendered subtitle text.
- [x] Detect subtitle changes.
- [x] Extract video timestamps.
- [x] Synchronise subtitle updates with playback.
- [x] Hide YouTube's native subtitle line and display the custom overlay.
- [x] Apply the placeholder softer subtitle font.
- [x] Fall back to native subtitles if extraction fails.
- [x] Handle videos without Korean subtitles.
- [x] Test different YouTube caption types in Chrome.

## Manual Verification

### Phase 0

Verified by the user in Chrome on 16 November 2026:

| Check | Result |
|---|---|
| Toolbar popup | Pass — UI rendered and background connection shown as connected |
| Settings page | Pass — opened and all planned categories rendered |
| YouTube content script | Pass — `[Korean Reader] Content script ready on YouTube.` logged |
| Background service worker | Pass — startup log observed |
| Reload behaviour | Pass — content script ran again after reloading the YouTube tab |

### Phase 1

Verified by the user in Chrome on 16 November 2026:

| Check | Result |
|---|---|
| Korean captions | Pass — native caption line replaced by the custom overlay |
| Caption changes | Pass — overlay text tracks caption changes during playback |
| Non-Korean captions | Pass — native captions remained visible and no overlay appeared |
| Video controls | Pass — play, seek, volume and subtitle controls unaffected |
| Miniplayer/preview | Pass — miniplayer captions remained native |
| Subtitle size | Pass — 1.5× the original size accepted as final |
| Captions stop | Pass — native captions returned when Korean captions stopped |

## Automated Verification

Last run: 16 November 2026

| Check | Command | Result |
|---|---|---|
| Unit/component tests | `npm run test:run` | Pass — 12 files, 56 tests |
| Headless Chrome smoke test | Temporary unpacked build and KRDict fixtures | Pass — bundled Kiwi, local key settings, exact lookup, pronunciation, cache reuse and clearing |
| Phase 4 Chrome fixture test | Unpacked extension with fixture captions and KRDict | Pass — explicit save, source metadata, duplicate handling, additional sentences, schema upgrade, cache isolation, status, edits, deletion and JSON export |
| Phase 5 Chrome fixture test | Unpacked extension with a loopback mock AnkiConnect server | Pass — connection, default settings, explicit sync, creation, duplicate skip, added sentence, and saved note ID |
| Type checking | `npm run compile` | Pass |
| Production build | `npm run build` | Pass — `.output/chrome-mv3`, approximately 114.9 MB |
| Packaging | `npm run zip` | Pass — `.output/korean-reader-0.1.0-chrome.zip`, approximately 89.2 MB |

## Current Technical Decisions

| Area | Decision |
|---|---|
| Extension framework | WXT 0.21 |
| Frontend | Vue 3.5 |
| Language | TypeScript 5.9 |
| Styling | Tailwind CSS 4.3 via `@tailwindcss/vite` |
| Build system | Vite 7 through WXT |
| Testing | Vitest 5, Vue Test Utils, jsdom |
| Storage | IndexedDB for data; `chrome.storage.local` for settings |
| Data ownership | Background service worker is the single source of truth |
| In-page UI isolation | Shadow DOM for the dictionary popup and subtitle UI |
| Korean processing | Kiwi 0.24.1 WASM with bundled `cong` model assets |
| Kiwi runtime | Background service worker; local assets; MV3 `wasm-unsafe-eval` CSP |
| Dictionary | KRDict; API key entered in Settings and stored locally; lookup runs in background |
| Anki integration | AnkiConnect; maximum one card per dictionary headword |
| Subtitle presentation | Hide native YouTube captions; render a custom overlay |
| Caption source | DOM caption windows polled every 250 ms; no YouTube API dependency |
| Korean detection | Hangul Unicode ranges plus caption-track language metadata when available |
| Caption fallback | Restore native captions after a 500 ms delay when Korean captions stop |
| Vocabulary status | Unknown by default; mining marks a word as known |
| Export | JSON in Phase 4; CSV export and import later |
| Version control | Git + GitHub |

## Known Issues

- Chrome MV3 service workers display as **Inactive** when they are idle. This is normal; opening the service worker console or sending a message wakes the worker.
- `npm install` reports engine warnings from two transitive packages (`nopt`, `abbrev`) because the local Node version is v24.14.0 while those packages declare support for v24.15.0 or newer. Installation, tests, type checking and the production build all succeed.
- YouTube usually leaves `video.textTracks` empty for its custom caption renderer. Korean detection therefore relies mainly on the rendered caption text; track metadata is used when it is present.
- Captions must be enabled in YouTube's player for extraction to work. The extension does not force captions on.
- KRDict homonyms sharing the same headword are resolved in dictionary order.
- Phase 3 requires the user's KRDict API key before definitions can be retrieved.
- Chrome loopback access passed against a fixture. AnkiConnect permissions and the existing card templates still need a live check.

## Pending Investigation

- Native caption DOM reliability across YouTube layouts, live streams and auto-generated captions.
- Dictionary result caching and expiry policy.
- AnkiConnect communication permissions and CORS configuration.
- Tailwind CSS behaviour inside a Shadow DOM content-script UI.
- Appropriate dictionary cache expiry and clearing strategy.

## Development Notes

Phase 1 is complete and verified in Chrome. Korean captions are replaced by the custom overlay, native captions return when Korean captions stop, non-Korean captions remain native, video controls are unaffected and miniplayers keep their own captions.

The production build is at `.output/chrome-mv3`. See `README.md` for setup, testing and manual verification instructions.

Phase 6 is the next milestone and requires user approval.


## Phase 6 verification — 16 November 2026

The user confirmed Phase 5 is complete. The automated suite passed 56 tests, type checking passed, and the production extension built successfully. Additional tests cover a missing dictionary entry and a KRDict HTTP failure. A Chrome test with simulated captions, dictionary responses and AnkiConnect passed mining, sync, duplicate handling, adding a sentence and saving the Anki note ID.

Live testing across multiple YouTube videos, unusual conjugations and the complete workflow remains to be verified. The automated Chrome check uses simulated services and does not establish those live results. No new failures were found in the checks run.

A Phase 6 follow-up fixed auto-generated captions that could update faster than word analysis completed. The reader now groups YouTube roll-up fragments into short phrases, keeps the latest phrase waiting for analysis, and hides the native roll-up once the interactive overlay renders. All 58 tests passed. Chrome fixture checks passed for both rolling and predefined captions, including underlines, lookup, mining, and simulated Anki sync. The reported YouTube video (`KTIByn_rIWM`) passed a live retest after reloading the unpacked extension and refreshing the video tab. Around 1:04 the auto-generated caption rendered as a grouped phrase with underlined word buttons, and clicking 보통 returned a KRDict definition.
