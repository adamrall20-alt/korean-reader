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

- [ ] Initialise Git repository.
- [ ] Configure WXT.
- [ ] Configure Vue 3.
- [ ] Configure TypeScript.
- [ ] Configure Tailwind CSS.
- [ ] Configure Chrome Manifest V3.
- [ ] Establish initial directory structure.
- [ ] Create initial extension entrypoints.
- [ ] Confirm the extension builds.
- [ ] Load the extension into Chrome.
- [ ] Establish basic testing infrastructure.

Completion criteria:

The extension loads successfully in Chrome and displays a basic working interface.

## Phase 1 — YouTube Integration

**Goal:** Extract and display Korean YouTube subtitles.

Tasks:

- [ ] Detect YouTube video pages.
- [ ] Detect available subtitle tracks.
- [ ] Identify Korean subtitles.
- [ ] Extract currently rendered subtitle text.
- [ ] Detect subtitle changes.
- [ ] Extract video timestamps.
- [ ] Synchronise subtitle updates with playback.
- [ ] Display extracted subtitles in the extension.
- [ ] Handle videos without Korean subtitles.
- [ ] Test different YouTube caption types.

Completion criteria:

Korean subtitles can be reliably detected and displayed during video playback.

## Phase 2 — Interactive Korean Words

**Goal:** Make subtitle vocabulary individually interactive.

Tasks:

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
- [ ] Implement popup positioning.
- [ ] Implement popup closing behaviour.
- [ ] Cache dictionary results locally.
- [ ] Handle missing dictionary entries.

Completion criteria:

Clicking a Korean subtitle word displays its correct dictionary information in a compact popup.

## Phase 4 — Vocabulary Mining

**Goal:** Allow users to collect vocabulary.

Tasks:

- [ ] Design vocabulary data structure.
- [ ] Implement IndexedDB storage.
- [ ] Implement Mine Word button.
- [ ] Save dictionary information.
- [ ] Save original subtitle context.
- [ ] Save YouTube video information.
- [ ] Save video timestamps.
- [ ] Detect existing vocabulary entries.
- [ ] Display mining confirmation.
- [ ] Implement vocabulary management interface.
- [ ] Implement search and filtering.
- [ ] Implement vocabulary deletion.

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
- [ ] Implement duplicate detection.
- [ ] Implement single-note creation.
- [ ] Implement bulk-note creation.
- [ ] Display synchronisation results.
- [ ] Handle connection failures.
- [ ] Retrieve and verify Kimchi Sentence Mining note type fields.
- [ ] Implement Kimchi Sentence Mining field mapping.
- [ ] Populate all six Anki fields.
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

- [ ] Full transcript reader.
- [ ] Known-word highlighting.
- [ ] Vocabulary frequency information.
- [ ] Screenshot capture for Anki cards.
- [ ] Audio capture.
- [ ] Sentence-level grammar analysis.
- [ ] Additional dictionary sources.
- [ ] Vocabulary import and export.
- [ ] Advanced subtitle customisation.

Future enhancements should only be considered after the minimum viable product is complete.