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

- [ ] Complete the bundled Kiwi WebAssembly feasibility spike.
- [ ] Implement Korean tokenisation.
- [ ] Integrate Kiwi or a suitable browser-compatible alternative.
- [ ] Identify individual Korean words.
- [ ] Identify dictionary forms.
- [ ] Preserve original subtitle forms.
- [ ] Display individual words as clickable elements.
- [ ] Implement click-to-select behaviour.
- [ ] Implement selected-word state.
- [ ] Ensure hovering does not trigger dictionary lookups.

Completion criteria:

Individual Korean words can be selected accurately without disrupting subtitle playback.

## Phase 3 — Dictionary Integration

**Goal:** Implement Korean-English dictionary lookup.

Tasks:

- [ ] Investigate KRDict API.
- [ ] Obtain API credentials.
- [ ] Implement dictionary service.
- [ ] Retrieve dictionary definitions.
- [ ] Match conjugated words to dictionary forms.
- [ ] Support multiple definitions.
- [ ] Display parts of speech.
- [ ] Display grammatical information where available.
- [ ] Implement dictionary popup.
- [ ] Open the popup directly above the selected word.
- [ ] Keep the popup inside the viewport and close it on an outside click.
- [ ] Cache dictionary results locally.
- [ ] Store the KRDict API key locally through the Settings page.
- [ ] Handle missing dictionary entries.

Completion criteria:

Clicking a Korean subtitle word displays its correct dictionary information in a compact popup.

## Phase 4 — Vocabulary Mining

**Goal:** Allow users to collect vocabulary.

Tasks:

- [ ] Design the one-entry-per-headword vocabulary data structure.
- [ ] Implement IndexedDB storage in the background service worker.
- [ ] Implement the Mine Word button.
- [ ] Save dictionary information.
- [ ] Save original subtitle context.
- [ ] Save YouTube video information.
- [ ] Save video timestamps.
- [ ] Detect existing vocabulary entries.
- [ ] Default unmarked words to unknown and mark mined words as known.
- [ ] Add the known/unknown toggle and filter.
- [ ] Allow additional example sentences to be saved for an existing word.
- [ ] Display mining confirmation.
- [ ] Implement the vocabulary management interface.
- [ ] Implement search and filtering.
- [ ] Implement vocabulary deletion.
- [ ] Implement JSON vocabulary export.

Completion criteria:

Words can be explicitly mined and retrieved from persistent local storage.

## Phase 5 — AnkiConnect Integration

**Goal:** Synchronise collected vocabulary with Anki.

Tasks:

- [ ] Implement AnkiConnect service.
- [ ] Detect whether AnkiConnect is available.
- [ ] Implement connection status.
- [ ] Retrieve Anki decks.
- [ ] Retrieve note types.
- [ ] Retrieve note fields.
- [ ] Implement deck selection.
- [ ] Implement note type selection.
- [ ] Implement field mapping.
- [ ] Implement duplicate detection by dictionary headword.
- [ ] Enforce a maximum of one Anki card per headword.
- [ ] Implement single-note creation.
- [ ] Implement bulk-note creation.
- [ ] Join additional example sentences in the Sentence field with newlines.
- [ ] Update an existing note's Sentence field when new example sentences are added.
- [ ] Display synchronisation results.
- [ ] Handle connection failures.
- [ ] Retrieve and verify Kimchi Sentence Mining note type fields.
- [ ] Implement Kimchi Sentence Mining field mapping.
- [ ] Populate required fields; leave Image and Audio empty until capture is implemented.
- [ ] Verify compatibility with existing card templates.
- [ ] Test front and back card rendering in Anki.

Completion criteria:

Selected vocabulary can be reliably synchronised into the user's chosen Anki deck.

## Phase 6 — Reliability and Testing

**Goal:** Ensure the complete workflow works reliably.

Tasks:

- [ ] Test the complete YouTube-to-Anki workflow.
- [ ] Test missing dictionary entries.
- [ ] Test unusual Korean conjugations.
- [ ] Test duplicate vocabulary.
- [ ] Test missing subtitles.
- [ ] Test Anki connection failures.
- [ ] Test storage persistence.
- [ ] Test different YouTube videos.
- [ ] Resolve major bugs.
- [ ] Confirm successful production build.

Completion criteria:

The minimum viable product works reliably under normal usage conditions.

## Phase 7 — Interface Refinement

**Goal:** Improve the visual experience after core functionality is complete.

Tasks:

- [ ] Refine spacing and typography.
- [ ] Improve popup positioning.
- [ ] Refine interactive states.
- [ ] Improve responsive layouts.
- [ ] Add subtle animations where useful.
- [ ] Refine dark and light appearances.
- [ ] Improve loading and error states.

Completion criteria:

The interface feels consistent, polished and comfortable to use.

## Future Enhancements

These features are outside the initial development scope.

- [ ] Full transcript reader and dedicated reading panel.
- [ ] Click a subtitle line to jump to its timestamp.
- [ ] Known-word highlighting.
- [ ] Vocabulary frequency information.
- [ ] Screenshot capture for Anki cards.
- [ ] Audio capture.
- [ ] Sentence-level grammar analysis.
- [ ] Additional dictionary sources.
- [ ] CSV export and vocabulary import.
- [ ] Advanced subtitle customisation.

Future enhancements should only be considered after the minimum viable product is complete.