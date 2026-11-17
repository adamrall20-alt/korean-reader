# PROJECT_STATUS.md — Korean Reader

## Current Project State

**Status:** Phase 8 implemented; live verification remains for several additions
**Current Phase:** Phase 8 — Additional Features
**Last Updated:** 17 November 2026

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

## In Progress / Verification Remaining

- Live verification of subtitle audio capture and playback in the user's Kimchi Sentence Mining Anki note type.
- Live verification of the Kimchi Reader status CSV import.
- Live verification of selectable definition mining.
- Interface refinement while preserving the established design; visual verification of the latest refinements is pending.

## Phase 8 known word import — 17 November 2026

Settings → Anki → Import known words reads a selected deck and its subdecks through AnkiConnect. The preview reports unique Korean focus words, words already known, and notes without a usable focus word. Confirming the preview updates the local vocabulary and refreshes subtitle underlines. Existing definitions and mined sentences are preserved. Imported words with no mined sentences are excluded from Anki sync.

Automated verification: 67 tests passed, type checking passed, and the Chrome production build succeeded. An isolated Chrome test with a simulated Anki connection verified the Settings flow, repeat imports, subtitle underline updates, and mining an imported word. The user confirmed that approximately 6,000 words imported from a live Anki deck and appeared in the JSON export.

The toolbar now counts all local words marked known, including existing imports, and refreshes when vocabulary changes. The New words counter still counts mined words absent from Anki. All 68 tests, type checking, and the production build passed. An isolated Chrome check confirmed the open popup updated after saving 6,000 test words and after marking one unknown.

## Phase 8 lookup refinement — 17 November 2026

When Kiwi identifies a noun plus 이다, clicking the subtitle word looks up the noun first if 이다 is already known and the noun is still unknown. For example, 학생이에요 opens 학생 and keeps 학생이에요 as the original form. The subtitle remains underlined until both headwords are known.

Verified with the bundled Kiwi model for 학생이에요, 의사예요 and 학생입니다. Automated tests, type checking and the Chrome production build passed. The user confirmed the lookup works in live use.

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

Latest dated automated verification recorded: 17 November 2026. Counts below are historical checkpoints, not a single combined run; see the dated Phase 8 entries for the latest feature-specific results.

| Check | Command | Result |
|---|---|---|
| Unit/component tests | `npm run test:run` | Pass — latest recorded feature verification: 71 tests; earlier checkpoints are listed in dated entries |
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
- KRDict lookup collects matching homonym definitions from its first search page; pronunciation, part of speech and optional details come from the first matching entry.
- A KRDict API key is required before live dictionary definitions can be retrieved.
- Audio capture uses estimated boundaries for rendered and rolling captions; live YouTube timing and playback in the user's Anki template remain to be verified.
- Live verification of Kimchi Reader CSV import and definition selection remains pending.

## Pending Investigation

- Native caption DOM reliability across YouTube layouts, live streams and auto-generated captions.
- Dictionary result caching and expiry policy.
- AnkiConnect communication permissions and CORS configuration.
- Tailwind CSS behaviour inside a Shadow DOM content-script UI.
- Appropriate dictionary cache expiry and clearing strategy.

## Development Notes

Phase 1 is complete and verified in Chrome. Korean captions are replaced by the custom overlay, native captions return when Korean captions stop, non-Korean captions remain native, video controls are unaffected and miniplayers keep their own captions.

The production build is at `.output/chrome-mv3`. See `README.md` for setup, testing and manual verification instructions.

Phase 6 is complete according to the user. Phase 7 interface refinement and Phase 8 additional features have been implemented; the remaining live checks are listed at the top of this document.


## Phase 6 verification — 16 November 2026

The user confirmed Phase 5 is complete. The automated suite passed 56 tests, type checking passed, and the production extension built successfully. Additional tests cover a missing dictionary entry and a KRDict HTTP failure. A Chrome test with simulated captions, dictionary responses and AnkiConnect passed mining, sync, duplicate handling, adding a sentence and saving the Anki note ID.

The automated Chrome check used simulated services. The user subsequently confirmed that live testing across multiple YouTube videos, unusual conjugations and the complete workflow was completed.

A Phase 6 follow-up fixed auto-generated captions that could update faster than word analysis completed. The reader now groups YouTube roll-up fragments into short phrases, keeps the latest phrase waiting for analysis, and hides the native roll-up once the interactive overlay renders. All 58 tests passed. Chrome fixture checks passed for both rolling and predefined captions, including underlines, lookup, mining, and simulated Anki sync. The reported YouTube video (`KTIByn_rIWM`) passed a live retest after reloading the unpacked extension and refreshing the video tab. Around 1:04 the auto-generated caption rendered as a grouped phrase with underlined word buttons, and clicking 보통 returned a KRDict definition.


## Popup refinement — 17 November 2026

The toolbar popup now shows the supplied penguin logo and star background, Anki connection controls, and known and new word counts. Known counts mined entries found in Anki; new counts mined entries not found in Anki. Both counts require a configured connection and show a dash when unavailable. Vocabulary management and JSON export, along with Anki connection and deck configuration, are available in Settings. Sync remains an explicit action.

Automated verification: 58 tests passed, type checking passed, and the production build succeeded. Visual verification in Chrome remains pending. The user subsequently confirmed the Phase 6 live reliability checks were completed; this targeted refinement does not mark Phase 7 complete.


## Phase 7 — 17 November 2026

The user confirmed the wireframes and Figma mockups, local vocabulary storage and JSON export, and remaining Phase 6 checks are complete. Interface refinement is in progress. The initial polish removes outdated development-phase badges from Settings and adds a consistent keyboard-focus indicator while preserving the existing visual design. All 58 automated tests, type checking and the production build passed; visual verification in Chrome remains pending.

## Phase 8 image capture — 17 November 2026

Selecting a subtitle word pauses the video and snapshots its video pixels. Mining saves that image with the sentence locally. Anki sync uploads the first captured image for the word and fills the mapped Image field on new notes, or an empty Image field on an existing note. Existing images are preserved. If the browser blocks pixel access, the popup reports that the image is unavailable and the word can still be saved. Protected or cross-origin video, and live YouTube/Anki behavior, require user verification.

Automated verification: 71 tests passed, type checking passed, and the Chrome production build succeeded.

## Kimchi Reader import — 17 November 2026

Settings now accepts Kimchi Reader word status CSV exports and marks status 2 words known, preserving existing vocabulary details. The Storage vocabulary section is collapsed by default. The supplied CSV contains 13,220 status 2 rows; live import remains to be verified. Automated suite (71 tests), type checking and production build passed.


## Phase 8 audio capture — 17 November 2026

Mining replays the selected subtitle, records its original audio and returns the paused video to the selection point. The clip is stored with its sentence. Select **Add Audio** on a saved sentence without audio to capture it again. Explicit Anki sync fills the mapped Audio field on a new note or an existing note whose Audio field is empty. Capture or upload failures still allow the sentence to be saved.

Verification passed in isolated Chrome with local video and a segmented MediaSource fixture. Both exact cue bounds and rendered caption boundaries produced decodable audio, restored the paused position and skipped ads. The automated suite, type check and Chrome build passed. Live YouTube playback, caption boundary accuracy and playback in the user's Anki note template remain to be verified. Rendered and rolling captions use estimated boundaries. Chrome may block capture on protected video or skip ranges that cannot be replayed.

## Phase 8 definition selection — 17 November 2026

The dictionary popup displays available definitions and lets the user select one or more before mining a new word. Selected rows are lighter grey; a sole definition is selected by default. Only selected definitions are stored and sent to Anki. Korean definitions and on-device translations share their selection. Saving another sentence for an existing word preserves its existing definitions. Matching KRDict homonym definitions are included from the first search page. Live verification remains pending.
