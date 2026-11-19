# PROJECT_STATUS.md — Korean Reader

## Current Project State

**Status:** Phase 9 implemented and verified with automated tests, a Chrome fixture and one live YouTube video. Live sidebar mining into Anki remains unverified.

**Current Phase:** Phase 9 — Interactive Transcript Sidebar

**Last Updated:** 19 November 2026

**Phase 10 prototype:** The opt-in Chrome test build supports Google sign-in wiring, explicit known-word and history import, and test edits with an account-specific offline queue. All 103 tests passed with the emulator, including the 13,000-word import, two-client merge and account isolation. Type checking and both Chrome builds passed. An isolated Chrome profile verified the stable extension ID, signed-out account messaging and guest history. The owner confirmed live sign-in and sync in the separate test build after Firestore tester approval. The normal unpacked build can now enable the same panel using an OAuth client for its existing extension ID. The normal build was rebuilt with its own OAuth client and checked in a clean Chrome profile under the original extension ID. Live sign-in on the existing installation and Firebase Spark usage measurements remain pending. Account deletion and launch registration controls remain open. See the [prototype setup and test steps](docs/account-sync-setup.md).

**Cloud sync UI draft — 19 November 2026:** Statistics now has a responsive account card with Google sign-in and sign-out, an account progress summary, and separate import and sync buttons. The visible test headword controls have been removed. Type checking and the Chrome production build passed. The automated suite passed 102 tests with one Firestore emulator test skipped. A component check with simulated account responses covered sign-in, import, a sync failure and sign-out. Live visual and Google account verification of the draft remain pending.

## Phase 9 transcript sidebar

The toolbar's **Open Sidebar** button opens a searchable, resizable transcript on YouTube watch pages. It sits above recommendations in standard desktop layout, overlays theatre and narrow layouts, and hides during fullscreen. The active line follows playback, with an Auto-scroll toggle. If the full Korean transcript cannot load, the panel collects rendered captions for the current video while playback progresses. Reopening the panel on the same video retains the collected lines. Navigating to a different video clears them.

The sidebar shares Korean Reader's word analysis, dictionary, Known status and mining flow. A word lookup leaves playback alone. Choosing Mine Word seeks to the selected line and pauses before taking the frame and attempting audio capture. The existing explicit Anki sync remains the way to send mined vocabulary to Anki.

Verification: 91 tests passed, type checking passed, and the production build succeeded. An isolated Chrome fixture verified the full caption track, drag resizing, highlighting, seek, dictionary opening, search, theatre/fullscreen behavior, navigation, fallback and reopen. The sidebar loaded all 214 lines returned by YouTube's current transcript panel for the live Korean video `KTIByn_rIWM`. That check did not save anything to live Anki. Transcript availability depends on what YouTube returns, and some sources expose only approximate timing.

Language fix verification: 95 tests passed, type checking passed, and the production build succeeded. A Chrome fixture confirmed that the sidebar rejects an English transcript containing a Korean name and collects the Korean caption shown in the player. The live reference video still loaded its full 214-line Korean transcript. The video from the original report was not retested directly.

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
- [x] Dictionary popup Known button and underline matching for the plural suffix 들.
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

## Settings and subtitle appearance — 18 November 2026

General now saves the light or dark interface theme. Appearance saves subtitle size, text colour, unknown word underline colour and a local font preset, with a preview and a restore defaults control. Open YouTube tabs receive saved changes immediately. The Settings navigation stays visible while scrolling on wider screens.

Verification: 82 tests passed, type checking passed, and the Chrome production build succeeded. An isolated Chrome check with sample captions verified sticky desktop navigation, the narrow screen layout, theme changes, styling updates in an open video tab, and persistence after Settings reload.

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
| Unit/component tests | `npm run test:run` | Pass — latest recorded feature verification: 81 tests; earlier checkpoints are listed in dated entries |
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
| Vocabulary status | Unknown by default. Mining or selecting **Known** marks the dictionary headword as known. |
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

## Phase 8 subtitle underlines and Known action — 17 November 2026

The subtitle reader recognises the plural suffix 들 on a noun or pronoun, including forms with particles. An imported 여러분 now clears the underline on 여러분들의. The dictionary popup places **Known** beside **Mine Word** and shares its styling. Clicking **Known** saves the resolved headword's local status, preserves any existing mined data, and refreshes the subtitle underline. A new known-only entry is excluded from Anki sync until a sentence is mined for it.

All 81 automated tests passed, type checking passed, and the Chrome production build succeeded. An isolated Chrome test with fixture captions and simulated dictionary and Anki responses verified the reported word form, button placement and styling, immediate underline updates, persistence after reload, and mining after marking a word known. The original YouTube session was not used for this verification.

## Word frequency — 18 November 2026

The dictionary popup displays a local Shiberu frequency rank for the resolved headword. `#80,000+` indicates an absent list entry; it does not prove the word is rare. A failed list load leaves the rank hidden. Live visual verification remains pending.

## Transcript word playback — 18 November 2026

Selecting a transcript word pauses playback while opening its dictionary definition, without seeking. Mining still seeks to the selected line for media capture. Live YouTube verification remains pending.

## Statistics — 18 November 2026

The toolbar's bar-graph icon opens Statistics in a separate Chrome tab. **Start tracking** captures the current known-word count. The graph then records count-changing vocabulary activity by day, with a table for exact totals. The baseline persists locally across reloads. Existing vocabulary is preserved by the database upgrade.

The Anki panel uses the deck saved in Settings and shows reviews left today, scheduled reviews for the next seven days, and the percentage of unique focus words marked known locally. The figures refresh on demand and require Anki Desktop and AnkiConnect. The vocabulary graph is available offline.

Verification: 97 automated tests passed, type checking passed, and the Chrome production build succeeded. An isolated Chrome test verified the new tab, upgrading an existing vocabulary database, the 13,000 to 13,005 example with concurrent additions, status and deletion adjustments, rollback on a failed history write, persistence on reload, and the Anki panel with simulated responses and a connection failure. Comparison against the user's live Anki deck and scheduler settings remains pending.

## Compound noun lookup and Known feedback — 19 November 2026

The bundled Kiwi model splits 복싱장에서 into 복싱 + 장 + 에서. Lookup now tries the complete nominal headword 복싱장 before falling back to individual nouns. Known-word matching uses the same compound form, so a known 복싱장 clears the underline on 복싱장에서. Knowing only 복싱 does not automatically mark the distinct compound 복싱장 known. Existing vocabulary is preserved.

The disabled Known button now displays ✓ Known and names the known headword in its tooltip. Only an active save uses the waiting cursor; an already-known word no longer appears to be loading.

Verification: 105 automated tests passed (one emulator test skipped), type checking passed, and the Chrome production build succeeded. Regression coverage includes compound lookup order, compound status with a particle, and the already-known button state. Confirmed the reported word's segmentation using the bundled Kiwi model. Live YouTube verification remains pending.

## Repeat account imports and manual sync — 19 November 2026

Fixed the installation import marker silently skipping all later imports from the same Chrome profile. Repeated imports now merge newly known words while preserving the original account history and revision-based removals. Once account progress is cached, Sync now also merges the profile's local known words. Both actions show a completion message with the refreshed total; failures retain the previous successful timestamp.

Verification: 108 tests passed with one Firestore emulator test skipped; type checking and the Chrome production build passed. New regression coverage reproduces eight new words after an earlier import, repeat-import idempotency, preservation of account removals/history, manual sync uploads, and failure feedback. The emulator could not start with the system Java version (requires Java 21+). Live account verification remains pending. Automatic queueing of normal vocabulary changes, local unknown-status propagation, and complete account/guest separation remain future Phase 10 work; the pending counter currently counts explicit account edits only.


## Phase 10 sync follow-up — 19 November 2026

Fixed repeat imports from an already-imported Chrome profile silently skipping newly known words. **Sync now** also merges local known words into an existing account snapshot before refreshing it. Imports remain idempotent, preserve the original account history, and use word revisions to preserve account-side unknown statuses. The Cloud sync card reports completion with the refreshed account total; failed requests retain the previous successful-sync time. In the reported case, syncing the eight new words should update the account from 13,307 to 13,315.

Verification: 108 tests passed and one Firestore emulator test was skipped; type checking and the Chrome production build passed. The emulator could not start because the installed Java version is below 21. Live verification in the signed-in Chrome profile remains pending. Local Known actions are not automatically queued; the pending counter currently tracks explicit account edits only. Automatic vocabulary integration, local unknown-status propagation and full account/guest separation remain incomplete Phase 10 work.

## IndexedDB connection reuse — 19 November 2026

`services/storage/database.ts` now caches and reuses a single shared `IDBDatabase` connection across `vocabulary`, `statistics`, and `dictionaryCache` operations instead of opening and closing the database on every request. The cached handle clears automatically on open failures, `versionchange`, or `close` events, and exposes `closeDatabase()` for explicit teardown. Storage callers in `services/storage/vocabulary.ts`, `services/storage/statistics.ts`, and `services/dictionary/cache.ts` no longer close the shared connection after individual transactions.

Verification: 115 tests passed (one Firestore emulator test skipped), type checking passed, and the Chrome production build passed.

## Fast known-word lookup and popup summary — 19 November 2026 (Phase 11.2)

- **Known headwords:** YouTube tabs and the Anki import/deck-statistics preview now read known headwords through the IndexedDB `status` index (`getAllKeys('known')`). Full records with screenshots and audio are no longer loaded for these reads.
- **Toolbar popup:** The popup uses a new `get-vocabulary-summary` request, limited to extension pages. It returns the known-word count, from the index, and mined entries with context screenshots and audio removed. The popup no longer receives the whole vocabulary.
- **Single-word changes:** After Known, Mine Word, a status toggle or a delete, the background writes a `vocabularyRevision` with the changed headword. YouTube tabs update their cached known set from it and no longer reload every headword. Anki imports and older revision values still make tabs reload the full set. If a full reload is already in progress when a single-word change arrives, the tab starts a new reload so older data cannot replace the change.

Verification: 126 tests passed and one Firestore emulator test was skipped. Type checking and the Chrome production build passed. New tests cover index-only reads, summary media stripping, storage failures, background change messages, summary access limits, and content-script delta handling, including out-of-order reloads and an unavailable background. Live timing with the 13,000-word vocabulary in Chrome has not been measured yet.

## Paginated, debounced Settings vocabulary list — 19 November 2026 (Phase 11.3)

The Settings vocabulary list renders 50 entries at a time. A **Show N more** button reveals the next page, and a "Showing X of Y words" count appears when there is more than one page. Search filtering waits 250 ms after typing stops, and each record's search text is built once and cached. The list keeps loaded records in a shallow reactive reference instead of making every field of 13,000+ records reactive. Changing the search, status filter or sort order returns to the first page. Editing, toggling or deleting a word keeps the pages already revealed. JSON export still includes every entry.

Verification: 130 tests passed and one Firestore emulator test was skipped. Type checking and the Chrome production build passed. New component tests cover paging, load-more, page retention after an edit, page reset on filter changes, debounced and rapid typing, empty results, clearing the search, and recovery after a load failure. Settings responsiveness with the live 13,000-word vocabulary has not been measured in Chrome.

## Batched and cached Kiwi tokenization — 19 November 2026 (Phase 11.4)

`services/korean/tokenize-client.ts` now mediates `tokenize` messages for each YouTube tab across the subtitle overlay (`entrypoints/content.ts`) and transcript sidebar (`components/TranscriptRow.vue`). Concurrent tokenization requests made in the same task (such as all newly visible sidebar rows in one `IntersectionObserver` callback) are deduplicated and coalesced into a single `tokenize` message (split into chunks of up to 50 lines), and recently analysed lines are stored in a shared 500-entry LRU cache in memory so video rewinds, repeated lines, and sidebar reopening reuse cached tokens without extra IPC calls. Non-Korean transcript cues skip observation and tokenization altogether.

Verification: 138 tests passed and one Firestore emulator test was skipped. Type checking and the Chrome production build passed. New unit and component tests cover microtask batching, duplicate-line deduplication, line-index re-indexing, cache hits across overlay and sidebar, in-flight request sharing, batch-limit splitting, LRU eviction, failure non-caching/retry, empty input, and non-Korean row skipping. Live profiling in Chrome has not been measured yet.

## Headword-level dictionary cache — 19 November 2026 (Phase 11.5)

`services/dictionary/krdict.ts` now caches KRDict entries under individual headword/candidate keys (`headword-v1`) in addition to preserving candidate-list fallback caching (`exact-v4`). When looking up a word, it checks the primary candidate by headword first, then falls back to any existing `exact-v4` list entry (backfilling the headword key when hit), and checks `headword-v1` before fetching fallback candidates. Successful KRDict responses cache both the matched candidate and the normalized dictionary headword so different conjugations or particle forms reuse the cached entry without extra API calls, while restoring the clicked `originalForm`.

Verification: 142 tests passed and one Firestore emulator test was skipped. Type checking and the Chrome production build passed. New tests verify cache reuse across conjugations, fallback candidate cache hits, legacy `exact-v4` backfilling, and fallback to KRDict when cache reads or writes fail. Live Chrome profiling with KRDict has not been run yet.

## Batched AnkiConnect sync lookups — 19 November 2026 (Phase 11.6)

`services/anki/sync.ts` now shares a 20-headword batch lookup helper (`fetchBatchNotes`) across `countUnsynced` and `syncVocabulary` so duplicate checks (`findNotes` and `notesInfo`) run in batches of up to 20 mined headwords rather than serially per word. Local vocabulary loading, existing-note conflict detection, missing-field updates, media uploads, and failed-batch error isolation remain preserved.

Verification: 144 tests passed and one Firestore emulator test was skipped. Type checking and the Chrome production build passed. New tests verify single-batch lookup across mixed updated/existing/new/conflicted headwords, 20-headword batch splitting, and batch-level failure isolation. Live Anki Desktop timing has not been measured yet.

## Lighter YouTube caption monitoring — 19 November 2026 (Phase 11.7)

`services/youtube/captions.ts` now uses `MutationObserver` on `.ytp-caption-window-container` (plus a shallow `childList`/visibility observer on the player, ignoring class changes such as `ytp-autohide` and `korean-reader-native-captions-hidden`) instead of constant 250 ms polling once the caption container is mounted, falling back to polling only while waiting for the container and using a one-shot timer only while a rolling caption is pending. Monitoring pauses automatically off YouTube video pages and while `document.hidden` is true, and caption reading avoids `innerText` layout reads while caching `getComputedStyle` results per snapshot across shared container/player ancestors and fast-pathing inline-hidden nodes.

Verification: 149 tests passed and one Firestore emulator test was skipped. Type checking and the Chrome production build passed. New tests verify layout-free DOM text extraction (`innerText` unread), cached ancestor visibility / `getComputedStyle` reduction, `MutationObserver` emission with zero active timers, fallback-polling-to-observer upgrade, off-video-page pause/resume, and hidden-tab pause/resume (including cancelling pending rolling timers). Live Chrome profiling on YouTube has not been run yet.

## Kimchi Reader–style word highlighting and conjugation engine — 19 November 2026 (Phase 11.8)

Upgraded Korean morphological decomposition, sub-word splitting, and known-status matching in `services/korean/dictionary-forms.ts`, `services/korean/tokenizer.ts`, `services/korean/tokenize-client.ts`, `components/SubtitleReader.vue`, `components/TranscriptRow.vue`, `components/WordToken.vue`, `assets/subtitle-overlay.css`, and `entrypoints/background.ts`:

- **Morphological decomposition & visual splitting:** Multi-word and auxiliary chunks now split across grammatical boundaries (`EC`, `ETM`, `ETN`, `J*`, `VCP`) into adjacent zero-gap clickable sub-words (e.g., `먹어` + `봤어요`, `할` + `수` + `있어요`, `학생` + `이에요`) while rendering standalone particles and productive suffixes (`들`, `쯤`, `씩`, `끼리`) as non-clickable plain text without underlines. Prefixes (`XPN`) and word-forming suffixes (`XSN`, e.g., `선생님`, `대학생`, `가능성`, `현실적`) stay attached, and adverb particles (`아직도`) strip cleanly.
- **Confirmed highlighting rules:** All constituent parts (including explicit `이다` on copula forms and fused mid-character contractions like `뭔데요` or `할건데`) must be known before underlines are removed; colloquial contraction aliases (`이거`↔`이것`, `재밌다`↔`재미있다`, `거`↔`것`, `뭐`↔`무엇`, etc.) share known status across underlines, dictionary lookup ordering, and the popup Known state; unspaced compound nouns (`한국어공부`, `복싱장`) stay whole when known as a whole and otherwise split into separate clickable sub-tokens (`resolveRenderTokens`).

Verification: 163 tests passed and one Firestore emulator test was skipped. Type checking and the Chrome production build passed. New unit and component tests cover multi-verb/auxiliary splitting, particle and productive-suffix stripping, `XPN`/`XSN` preservation, copula forms with suffixes/particles and explicit `이다` status, fused contractions, symmetric contraction aliases, compound-whole-vs-split rendering in both the subtitle overlay and transcript sidebar, compound `parts` ID re-indexing, and background alias lookup resolution. Live visual checking on YouTube in Chrome has not been run yet.


## Simplified penguin logo — 19 November 2026

Updated the toolbar popup, Settings and Statistics headers to use `assets/penguin-simple.png`. Regenerated all five Chrome extension icons (16, 32, 48, 96 and 128 pixels) from the same asset. The original artwork remains available but is no longer referenced by the application.

Verification: 163 tests passed with one Firestore emulator test skipped; type checking and the Chrome production build passed. Confirmed the production bundle uses the simplified logo and includes the regenerated icons. Live visual verification in Chrome remains pending.


## Transparent penguin logo — 19 November 2026

Replaced the simplified logo with `assets/penguin-simple-transparent.png` in the popup, Settings and Statistics headers and regenerated all five Chrome extension icons from that transparent source. This supersedes the preceding logo update.

Verification: type checking, the Chrome production build and 163 tests passed; one Firestore emulator test was skipped. Live visual verification in Chrome remains pending.


## Penguin face logo — 19 November 2026

Updated the popup, Settings and Statistics headers to use `assets/penguin-face.png` and regenerated all five Chrome extension icons (16, 32, 48, 96 and 128 pixels) from that image. This supersedes the transparent penguin logo update. Updated UI_DESIGN.md to reflect the current asset.

Verification: type checking, the Chrome production build and 163 tests passed; one Firestore emulator test was skipped. Confirmed the production build includes the penguin face asset and regenerated icons. Live visual verification in Chrome remains pending.


## Selected concept 04 logo — 19 November 2026

Updated the popup, Settings and Statistics headers to use the supplied transparent `assets/New logo update.png`. Header images use contain sizing without rounded clipping to keep the complete tilted penguin and mint accents visible. Regenerated all five Chrome extension icons (16, 32, 48, 96 and 128 pixels) from the same source, preserving transparency. This supersedes the preceding penguin face logo update. UI_DESIGN.md records the current asset and rendering treatment.

Verification: 163 tests passed with one Firestore emulator test skipped; type checking and the Chrome production build passed. Confirmed icon dimensions and alpha channels, the new logo in the production assets and all three header imports, and matching icon files in the production bundle. Live visual verification in Chrome remains pending.
