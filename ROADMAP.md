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

## Phase 8 — Additional Features (current)
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

## Future Enhancements

These features are outside the initial development scope.

- [ ] Full transcript reader and dedicated reading panel.
- [ ] Click a subtitle line to jump to its timestamp.
- [ ] Vocabulary frequency information.
- [ ] Sentence-level grammar analysis.
- [ ] Additional dictionary sources.
- [ ] CSV export and vocabulary import.
- [ ] Advanced subtitle customisation.
- [ ] Stats and long term learning progress tracking.
- [ ] Web server and accounts?
- [ ] Make the settings navigation UI move down with the page as the user scrolls.
- [ ] Word frequency information in the dictionary popup.

Future enhancements should only be considered after the minimum viable product is complete.
