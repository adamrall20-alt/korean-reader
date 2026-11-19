# ROADMAP.md — Korean Reader

## Development Philosophy

Develop Korean Reader incrementally.

Each milestone should result in working, testable functionality.

Do not begin a new milestone until the current milestone has been tested and approved by the user.

Prioritise the minimum viable product before optional enhancements.

---

## Phase 0 — Project Foundation

**Goal:** Establish the development environment and extension structure.

Tasks:

- [x] Initialise Git repository.
- [x] Configure WXT.
- [x] Configure Vue 3.
- [x] Configure TypeScript.
- [x] Configure Tailwind CSS.
- [x] Configure Chrome Manifest V3.
- [x] Establish initial directory structure.
- [x] Create initial extension entrypoints.
- [x] Confirm the extension builds.
- [x] Establish basic testing infrastructure.
- [x] Load the extension into Chrome and verify the popup, options page and YouTube content script.

Completion criteria:

The extension loads successfully in Chrome and displays a basic working interface.

Phase 0 was verified in Chrome on 16 November 2026. The popup connected to the background worker, the options page opened, and the YouTube content script logged readiness.

## Phase 1 — YouTube Integration

**Goal:** Extract and display Korean YouTube subtitles.

Tasks:

- [x] Detect YouTube video pages.
- [x] Detect available subtitle tracks.
- [x] Identify Korean subtitles.
- [x] Extract currently rendered subtitle text.
- [x] Detect subtitle changes.
- [x] Extract video timestamps.
- [x] Synchronise subtitle updates with playback.
- [x] Hide YouTube's native subtitle line and display the custom overlay.
- [x] Apply the placeholder softer subtitle font.
- [x] Fall back to native subtitles if extraction fails.
- [x] Handle videos without Korean subtitles.
- [x] Test different YouTube caption types.

Completion criteria:

Korean subtitles can be reliably detected and displayed during video playback.

Phase 1 is implemented and was verified in Chrome on 16 November 2026. Caption extraction reads YouTube's rendered caption windows, because YouTube normally does not expose caption tracks through `video.textTracks`.

## Phase 2 — Interactive Korean Words

**Goal:** Make subtitle vocabulary individually interactive.

Tasks:

- [x] Complete the bundled Kiwi WebAssembly feasibility spike.
- [x] Implement Korean tokenisation.
- [x] Integrate Kiwi as the browser-compatible analyser.
- [x] Identify individual Korean words.
- [x] Identify dictionary forms for dictionary lookup.
- [x] Preserve original subtitle forms.
- [x] Display individual words as clickable elements.
- [x] Implement click-to-select behaviour.
- [x] Implement selected-word state.
- [x] Pause YouTube playback when a word is selected.
- [x] Ensure hovering does not trigger dictionary lookups.

Completion criteria:

Individual Korean words can be selected accurately without disrupting subtitle playback.

Phase 2 is complete and verified through the Phase 3 dictionary flow.

## Phase 3 — Dictionary Integration

**Goal:** Implement Korean-English dictionary lookup.

Tasks:

- [x] Investigate KRDict API.
- [x] Obtain API credentials.
- [x] Implement dictionary service.
- [x] Retrieve dictionary definitions.
- [x] Match conjugated forms through Kiwi lexical morphemes and dictionary-form candidates.
- [x] Support multiple definitions.
- [x] Display parts of speech.
- [x] Display pronunciation where available.
- [x] Implement dictionary popup.
- [x] Open the popup directly above the selected word.
- [x] Keep the popup inside the viewport and close it on an outside click.
- [x] Cache dictionary results locally in IndexedDB.
- [x] Provide a Settings action to clear the dictionary cache.
- [x] Show up to three English definitions, falling back to Korean definitions when needed.
- [x] Store the KRDict API key locally through the Settings page.
- [x] Handle missing dictionary entries.

Completion criteria:

Clicking a Korean subtitle word displays its dictionary headword, English definitions and available entry details.

## Phase 4 — Vocabulary Mining

**Goal:** Allow users to collect vocabulary.

Tasks:

- [x] Design the one-entry-per-headword vocabulary data structure.
- [x] Implement IndexedDB storage in the background service worker.
- [x] Implement the Mine Word button.
- [x] Save dictionary information.
- [x] Save original subtitle context.
- [x] Save YouTube video information.
- [x] Save video timestamps.
- [x] Detect existing vocabulary entries.
- [x] Default unmarked words to unknown and mark mined words as known.
- [x] Add the known/unknown toggle and filter.
- [x] Underline unknown subtitle words in red.
- [x] Allow additional example sentences to be saved for an existing word.
- [x] Display mining confirmation.
- [x] Implement the vocabulary management interface.
- [x] Implement search and filtering.
- [x] Implement definition editing and vocabulary deletion.
- [x] Implement JSON vocabulary export.

Completion criteria:

Words can be explicitly mined and retrieved from persistent local storage. The user confirmed live use; see PROJECT_STATUS.md for dated verification.

## Phase 5 — AnkiConnect Integration

**Goal:** Synchronise collected vocabulary with Anki.

Tasks:

- [x] Implement AnkiConnect service.
- [x] Detect whether AnkiConnect is available.
- [x] Implement connection status.
- [x] Retrieve Anki decks.
- [x] Retrieve note types.
- [x] Retrieve note fields.
- [x] Implement deck selection.
- [x] Implement note type selection.
- [x] Implement field mapping.
- [x] Implement duplicate detection by dictionary headword.
- [x] Enforce a maximum of one Anki card per headword.
- [x] Implement single-note creation.
- [x] Implement bulk-note creation.
- [x] Join additional example sentences in the Sentence field with newlines.
- [x] Update an existing note's Sentence field when new example sentences are added.
- [x] Display synchronisation results.
- [x] Handle connection failures.
- [x] Retrieve and verify Kimchi Sentence Mining note type fields.
- [x] Implement Kimchi Sentence Mining field mapping.
- [x] Populate mapped fields, including optional captured image and audio when available.
- [x] Verify compatibility with the user’s existing card templates in Anki.
- [x] Test front and back card rendering in Anki.

Completion criteria:

The user confirmed Phase 5 is complete. Later Phase 8 work extended the same integration with media, known-word imports and safer duplicate handling.

## Phase 6 — Reliability and Testing

**Goal:** Ensure the complete workflow works reliably.

Tasks:

- [x] Test the complete YouTube-to-Anki workflow.
- [x] Test missing dictionary entries.
- [x] Test unusual Korean conjugations.
- [x] Test duplicate vocabulary.
- [x] Test missing subtitles.
- [x] Test Anki connection failures.
- [x] Test storage persistence.
- [x] Test different YouTube videos.
- [x] Resolve major bugs.
- [x] Confirm successful production build.

Completion criteria:

The automated suite passes 56 tests, type checking, and the production build. A Chrome test with simulated captions, dictionary responses, and AnkiConnect passed the mining-to-sync workflow, duplicate handling, and sentence updates.

The user confirmed that the remaining live checks across multiple YouTube videos, unusual conjugations, and the complete workflow are complete.

## Phase 7 — Interface Refinement

**Goal:** Improve the visual experience after core functionality is complete.
The user confirmed that the wireframes and Figma mockups have already been completed. Preserve the established interface while making final refinements.

Tasks:

- [x] Refine spacing and typography.
- [x] Improve popup positioning.
- [x] Refine interactive states.
- [x] Improve responsive layouts.
- [x] Add subtle animations where useful.
- [x] Refine dark and light appearances.
- [x] Improve loading and error states.
- [x] Create a logo for the extension.
- [x] Implement the JSON local vocabulary storage in the settings page.

Completion criteria:

The interface feels consistent, polished and comfortable to use.

## Phase 8 — Additional Features
**Goal:** Extend the established workflow with richer Anki cards and imports.

Tasks:

- [x] Move Anki deck configuration and field mapping to the Settings page.
- [x] Screenshot capture for Anki cards.
- [x] Subtitle audio capture and Anki attachment (isolated Chrome verification passed; live YouTube and note-template playback verification pending).
- [x] Import known words from an Anki deck through AnkiConnect in Settings.
- [x] Fix word checking against common conjugations, prefering the noun over the verb when both are valid dictionary entries.
- [x] For words with multiple dictionary definitions, allow the user to select which definitions to mine and sync to Anki (live verification pending).
- [x] Match known nouns and pronouns with the plural suffix 들 and particles in subtitles.
- [x] Add a Known button beside Mine Word to update local status without mining.

Phase 8 is in progress. The remaining items are live verification of captured audio on YouTube and in the user's Anki card template, live verification of the Kimchi Reader CSV import, and live verification of definition selection. See PROJECT_STATUS.md for current details.

## Phase 9 — Interactive Transcript Sidebar (current)

**Goal:** Add a resizable YouTube transcript sidebar that allows users to browse subtitles, navigate video timestamps, and interact with vocabulary using existing Korean Reader functionality.

Tasks:

- [x] Add an **Open Sidebar** button to the extension's main toolbar popup UI, positioned directly below the Connect and Sync to Anki controls.
- [x] The sidebar must remain closed by default and only open when the user clicks Open Sidebar.
- [x] Add a collapsible, resizable sidebar beside the YouTube video, with a draggable edge to adjust its width.
- [x] Load the full Korean transcript when available, with timestamps for each line. If unavailable, explain the fallback and collect rendered Korean captions as playback progresses.
- [x] Clicking the arrow and timestamp button beside a line jumps to its start.
- [x] Automatically highlight the currently playing subtitle line.
- [x] Add automatic scrolling to follow the current subtitle, with an option to disable auto-scroll.
- [x] Add a search bar to find words or phrases within the transcript.
- [x] Make individual Korean words clickable, reusing the existing dictionary popup, Known button, and Mine Word functionality. Clicking a word pauses playback and opens its definition without seeking. Selecting Mine Word seeks to the cue start before capturing media and saving.
- [x] Reuse existing subtitle extraction and processing logic rather than creating a separate system.
- [x] Handle video navigation, unavailable subtitles, fullscreen, and theatre mode without breaking the layout.
- [x] Ensure the sidebar can be closed and reopened without losing functionality.

**Implementation requirements:**

- Preserve the existing Korean Reader colour scheme, styling, and UI elements.
- Avoid duplicating dictionary, vocabulary, or Anki functionality.
- Ensure existing clickable YouTube subtitles continue working normally.
- Keep the sidebar responsive and avoid unnecessary processing during playback.
- Inspect the existing codebase before implementation and verify functionality after changes.

Implementation and fixture verification are complete. See PROJECT_STATUS.md for live verification status.

### Korean transcript language fix

YouTube can serve an English transcript while the video player displays Korean captions. A single Korean name or phrase in the English response was enough for the sidebar to accept the entire transcript.

- [x] Prefer Korean caption tracks and try the next Korean track if the first is unavailable.
- [x] Request Korean from YouTube's transcript panel and select the Korean track when the transcript exposes a language menu.
- [x] Check that most letters in the full transcript are Hangul. If that check fails, collect the Korean captions shown during playback.

## Statistics

- [x] Open Statistics in a new browser tab from the toolbar popup.
- [x] Start from the current local known-word count and chart changes after opt-in.
- [x] Show live review counts, a seven-day scheduled total, and known-word overlap for the configured Anki deck.

## Phase 10 — Accounts and Progress Sync (prototype)

**Goal:** Let users optionally sign in with Google and carry their known-word progress between Chrome profiles.

- [x] Approve and implement the first prototype milestone.
- [x] Verify the 13,000-word import, merge, revision conflicts and account isolation in the Firestore emulator.
- [ ] Validate live Google sign-in and two-profile sync on Firebase Spark.
- [ ] Implement account and guest data separation, automatic merging, and offline sync.
- [ ] Extend Statistics with account history, backdated progress and sync status.
- [ ] Add registration capacity controls and verify account isolation and recovery before open sign-up.

See the [Phase 10 plan](docs/account-sync.md) for decisions, scope and verification.

Repeat imports and **Sync now** merge newly known local vocabulary into an existing account snapshot. Imports are idempotent and preserve account-side removals. Automated checks cover this merge; see [PROJECT_STATUS.md](PROJECT_STATUS.md). Local Known actions are not yet automatically queued.

## Phase 11 — Performance Optimisations and Korean Highlighting

**Goal:** Improve responsiveness for large vocabularies (13,000+ known words) and upgrade Korean word highlighting to match Kimchi Reader–style sub-word splitting and conjugation/affix handling.

Work through these updates one at a time, in order from simplest to most complex:

- [x] **11.1 IndexedDB connection reuse:** Cache and reuse a single `IDBDatabase` connection in `services/storage/database.ts` (releasing on `versionchange`/`close`) instead of opening and closing on every call.
- [x] **11.2 Fast known-word index lookup and lightweight popup summary:** Read known headwords via the IndexedDB `status` index (`getAllKeys('known')`) instead of loading all full records with images/audio, add a lightweight summary endpoint for the toolbar popup, and avoid resending all 13,000+ headwords to YouTube tabs on single-word updates.
- [x] **11.3 Paginate and debounce the Settings vocabulary list:** Render `VocabularyManager.vue` in pages (e.g., 50–100 entries with a load-more control) and debounce search filtering so 13,000+ entries do not stall the Settings page.
- [x] **11.4 Batch and cache Kiwi tokenization:** Batch visible `TranscriptSidebar` rows into a single `tokenize` request instead of one IPC call per row, and keep an in-memory cache of recently tokenized lines shared across overlay, sidebar, and rewinds.
- [x] **11.5 Headword-level dictionary cache:** Cache KRDict entries by resolved headword/individual candidate in `services/dictionary/krdict.ts` so different conjugations of the same word reuse the cached entry without redundant API requests.
- [x] **11.6 Batch AnkiConnect sync lookups:** Batch duplicate checks (`findNotes` / `notesInfo`) during `syncVocabulary` instead of running serial requests per headword.
- [x] **11.7 Lighter YouTube caption monitoring:** Pause caption polling off video pages and on hidden tabs, prefer `MutationObserver` over constant 250 ms polling where reliable, and avoid repeated `getComputedStyle` / `innerText` layout checks.
- [ ] **11.8 Kimchi Reader–style word highlighting and conjugation engine (Option B):**
  - Decompose Kiwi morphemes into real lexical word units across grammatical boundaries (`EC`, `ETM`, `ETN`, `J*`, `VCP`) instead of combining multi-verb or unspaced chunks into invalid forms (e.g., `먹어봤어요` → `먹다` + `보다`, `할수있어요` → `하다` + `수` + `있다`).
  - Visually split multi-word chunks into adjacent clickable sub-word tokens (with no extra spacing) so only unknown parts are underlined and particles are not underlined; fall back to multi-headword checks on fused mid-character contractions (e.g., `할거야`, `뭔데요`).
  - Support particle stripping on adverbs (`MAG`, e.g., `아직도` → `아직`), preserve prefixes (`XPN`, e.g., `신제품`) and word-forming suffixes (`XSN`, e.g., `선생님`, `대학생`, `가능성`, `현실적`), strip productive grammatical suffixes (`들`, `쯤`, `씩`, `끼리`), and fix `이다` copula constructions with suffixes/particles (`학생들이에요`, `선생님이에요`, `집에서예요`).
  - Confirm remaining rule preferences before implementation: whether `이다` requires explicit known status, colloquial contraction aliases (`이거`↔`이것`, `재밌다`↔`재미있다`), and unspaced compound nouns (`한국어공부`).

## Future Enhancements

These features are outside the initial development scope.

- [ ] Vocabulary frequency information.
- [ ] Sentence-level grammar analysis.
- [ ] Additional dictionary sources.
- [x] Subtitle size, text colour, unknown word underline colour and font.
- [ ] Stats and long term learning progress tracking.
- [x] Keep the Settings navigation visible while scrolling on wider screens.
- [x] Word frequency information in the dictionary popup.

Future enhancements should only be considered after the minimum viable product is complete.
