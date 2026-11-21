# Desktop App Plan — Korean Reader

**Status:** Product direction agreed on 21 November 2026. Implementation milestones are proposed and awaiting approval.

## Product goal

Make Korean Reader the complete workflow for learning from Korean immersion. Mine a word from YouTube or a webpage in Chrome. Open Korean Reader Desktop to review it on a schedule or practise with A/B/C/D questions based on the original sentence. A new user can complete that loop without installing Anki.

The desktop home screen should answer two questions at a glance. How many cards are due today, and can I start a quick practice session? The Library gives the user a place to find a word, choose its main sentence, play the captured clip or return to the original source.

## Agreed release decisions

| Decision | Plan |
| --- | --- |
| First release | Mac first, with daily SRS, multiple-choice practice, Anki migration and automatic delivery from Chrome. Windows follows as its own milestone. |
| Existing Anki decks | Import cards and media from selected decks. Imported cards start with fresh Korean Reader schedules. |
| Newly mined words | Prototype with a file import. Ship the first usable Mac release with automatic delivery on the same computer. |
| Existing reading workflow | Keep explicit **Mine Word** and **Known** actions in the Chrome extension. Anki export remains available for users who choose it. |

## Technical direction

- **Desktop shell.** Evaluate Electron first for the existing Vue 3, TypeScript and Tailwind stack. Keep desktop entry points and platform-specific code separate from the WXT extension. Share data types, pure study logic and suitable UI components. Approve the shell and storage choice after Phase D0.
- **Data ownership.** Chrome owns mining and subtitle coverage. Desktop owns the local study library, selected study context, schedules, review history and practice results. Browser-to-desktop delivery sends mined content. A Known-only entry has no study card, and a quiz result never changes the browser's Known status.
- **Study identity.** Default to one scheduled card per NFC-normalised headword, with multiple saved contexts and one preferred sentence. Preserve imported contexts and alternate meanings. Use stable source IDs and content matching to merge confirmed overlaps. Preview uncertain matches and let the user keep them distinct. Later imports must preserve learned schedules and user edits.
- **Local storage.** Evaluate SQLite for structured data and managed local files for attachments. Commit each review event and its next due date together. Store attachment references and load media when a card is opened. Version imports, backups and schema migrations.
- **Scheduling.** Evaluate the TypeScript FSRS implementation against the desktop runtime. Keep a review log so updates, undo and restored data can be verified. Use a consistent local study day when building daily queues.
- **Scope.** The first two platform releases use local storage, local question generation and Chrome for mining. Cross-computer sync of cards, media and review progress, mobile, and mining directly inside the desktop app require separate product decisions. The [existing Firebase prototype](docs/account-sync.md) covers known words and progress history.

## Phase D0 — Desktop Foundation and Feasibility

**Goal:** Prove that a separate desktop build can reuse Korean Reader's data and run on the target Mac.

Tasks:

- [x] Read the [extension roadmap](ROADMAP.md), [technical stack](TECH_STACK.md) and [project status](PROJECT_STATUS.md). Trace the vocabulary export, the saved context fields and Chrome's mining write path.
- [x] Build a small Vue desktop window on Apple silicon using sample fixtures. Render a Korean sentence, replay representative captured audio and open the saved source in the default browser.
- [x] Evaluate Electron and the local storage options for packaging, migrations, backups and media playback. Verify that the selected FSRS implementation works in the proposed runtime.
- [x] Agree on the first data schema and the API boundary between the desktop renderer and local storage. Keep filesystem and process access in the desktop main process and expose only the app actions the UI needs.
- [x] Establish separate desktop build and test commands. Check that the existing Chrome extension still builds and that its normal entry points are unchanged.
- [x] Confirm release targets and installer approach. Start verification on the owner's Apple-silicon Mac. Confirm Intel Mac and Windows architectures before promising support for them.

**Completion criteria:** A desktop build opens on the target Mac, displays and plays a representative mined entry, and has documented framework and storage decisions ready for the owner's approval.

## Phase D1 — Library and Korean Reader Import

**Goal:** Get the user's existing Korean Reader sentences and attachments into a usable local study library.

Tasks:

- [ ] Import the current `korean-reader-vocabulary.json` format. Read the focus word, definitions, pronunciation where present, original forms, sentences, source details and available media.
- [ ] Preview new cards, updated cards, skipped Known-only words and invalid entries. Confirm before writing. Report row-level errors and provide a repeatable retry after a failed import.
- [ ] Upsert existing words and add new contexts without duplicating identically sourced sentences. Preserve user-selected study contexts and desktop edits when the same content is reimported.
- [ ] Add Library search by Korean word or definition, a card detail view, context selection, source links, and audio and image playback.
- [ ] Handle missing or corrupt media with visible feedback while keeping usable text. Keep library search and startup responsive with a representative large export and media-heavy fixtures.
- [ ] Test a real export, an older export with missing optional fields, duplicate imports, interrupted saves and app restart.

**Completion criteria:** The owner can import real Korean Reader vocabulary, find a card and play its saved media. A second import adds only new content and preserves the owner's changes.

## Phase D2 — Daily Spaced Repetition

**Goal:** Run a complete daily study session in Korean Reader without opening Anki.

Tasks:

- [ ] Add a **Review due cards** entry point with due and new counts, a daily new-card limit, and a clear finished-for-today state. Let a large imported deck enter study gradually.
- [ ] Show the selected Korean sentence and highlight the focus word where its saved occurrence can be located reliably. Reveal the definition, pronunciation and available image or audio after the user attempts recall.
- [ ] Add **Again**, **Hard**, **Good** and **Easy** ratings with keyboard controls. Save the review event and updated schedule together. Protect against double submission and allow undo of the last rating.
- [ ] Restore an unfinished session after closing the app. Provide a basic summary of cards reviewed and upcoming due counts.
- [ ] Test first review, missed recall, relearning, multiple reviews on one day, time-zone and daylight-saving boundaries, restart, retry and undo. Verify that updating a card's content leaves its schedule intact.
- [ ] Test a real study session offline on the owner's Mac.

**Completion criteria:** The owner can complete an offline review session, reopen the app and see the correct cards due on the expected days. New cards, retries and undo retain consistent history.

## Phase D3 — Multiple-Choice Practice

**Goal:** Turn the user's mined sentences into short, replayable A/B/C/D practice sessions.

Tasks:

- [ ] Add **Quick practice** with a suggested default of 10 questions. Weight selection toward recently mined words and words the user struggled with during recall. Save practice results separately from FSRS ratings.
- [ ] Start with meaning in context. Show the mined sentence and ask for the meaning of the highlighted form. Use the selected meaning or an unambiguous saved definition as the answer.
- [ ] Add sentence completion once the app can identify the chosen occurrence. Use the exact form from the saved sentence, including relevant conjugation. Skip examples with repeated or ambiguous matches unless a saved span identifies the target.
- [ ] Generate three distinct wrong options from eligible local vocabulary. Match part of speech or answer type where reliable. Exclude duplicate glosses, known alternate answers and contextually plausible substitutes the generator cannot disambiguate. Skip a question when four sound options are unavailable.
- [ ] Shuffle answer positions, accept A/B/C/D and 1–4 shortcuts, give immediate feedback and reveal the original sentence, meaning and available media. Show missed words at the end.
- [ ] Check that small libraries get a shorter session or a useful empty state. Test synonym cases, missing definitions, missing audio, conjugation, repeated tokens and files from both import sources.
- [ ] Have the owner play a real session and review the quality of the wrong options before expanding question types.

**Completion criteria:** A real mining library produces a usable practice session with one defensible answer per question in the reviewed sample. Quiz responses leave due dates and review history intact.

## Phase D4 — Anki Cards and Media Migration

**Goal:** Bring selected Anki decks into the desktop library with fresh Korean Reader schedules.

Tasks:

- [ ] Prototype a read-only migration with the existing AnkiConnect setup. Compare it with Anki deck-package import if connecting or retrieving media proves unreliable. Pick one first-release route after testing the owner's deck.
- [ ] Preview selected decks and map Focus Word, Sentence, Definition, Pronunciation, Image and Audio. Prioritise the Korean Reader and Kimchi Sentence Mining note types. Preview custom field mappings before importing.
- [ ] Convert notes to local study cards and preserve multiple usable sentences and local media. Render sanitised content using Korean Reader's review layout. Report unsupported note structures and missing files.
- [ ] Match confirmed overlap with existing Korean Reader cards using stored note IDs where applicable and matching words and sentences. Preserve desktop review progress, merge missing context and attachments, and flag conflicting definitions or ambiguous identities for preview.
- [ ] Show new cards, duplicates, conflicts and unavailable media before applying changes. Create fresh schedules for newly imported cards. Verify a repeated import and a partially failed media transfer.
- [ ] Test one real selected deck with audio and images. Close Anki and verify that both review modes still work using the copied local data.

**Completion criteria:** The owner's selected Anki material can be reviewed independently of Anki after migration. Existing desktop schedules survive overlapping imports, and import results explain omissions and retries.

## Phase D5 — Automatic Delivery from Chrome

**Goal:** A word mined in Chrome appears in the desktop Library automatically on the same computer.

Tasks:

- [ ] Prototype Chrome Native Messaging with a stable extension ID and a registered local host. Compare installer burden and delivery behaviour against an authenticated local bridge if the native host creates a practical blocker. Approve the transport before integrating it.
- [ ] Add a desktop destination in extension settings, with opt-in, connection status, pending count, and a manual retry or backfill for existing mined cards.
- [ ] Queue successfully stored mining updates from YouTube and webpages. Persist the queue across Chrome service-worker restarts. Send bounded payloads with stable update IDs, and acknowledge each delivery only after it is durably accepted.
- [ ] Cover new words, additional sentences and media captured after an initial save. Preserve desktop edits and schedules. A browser deletion or Known toggle leaves the desktop study card available.
- [ ] Make delivery recover after the app is closed, Chrome restarts or the host is unavailable. Document whether the selected transport delivers while the app is closed or drains pending updates on next launch.
- [ ] Limit bridge access to the authorised installation and validate protocol version, payload size and media types. Verify that ordinary webpages cannot submit bridge messages.
- [ ] Test real mining from YouTube and a webpage, repeated delivery, queue replay, app upgrades and interrupted media sends. Verify the existing Chrome mining and optional Anki workflow with desktop delivery enabled and disabled.

**Completion criteria:** After pairing, a freshly mined word appears without a manual file export. A temporary outage recovers without losing the word, creating duplicates or resetting a schedule.

## Phase D6 — First Mac Release

**Goal:** Deliver a Mac build the owner can use as their daily Korean study app.

Tasks:

- [ ] Package the Apple-silicon build and document the install, Chrome pairing, first import and first review. Verify signing and notarisation requirements for the intended distribution route.
- [ ] Add a versioned local backup and restore for library content, media, schedules, review history, practice history and preferences. Preview restoration, validate the archive before applying it, and exclude connection credentials.
- [ ] Verify updates preserve the library and bridge pairing. Test a failed migration, disk write failure, backup restore and reinstall from a clean macOS profile.
- [ ] Ship a keyboard-friendly review flow with visible focus, readable Korean text, and working light and dark themes. Keep the existing Korean Reader visual identity.
- [ ] Ask the owner to complete an end-to-end acceptance session. Import part of their Anki library, mine a new sentence, review a due card, play a quiz, quit and reopen, then confirm the saved state.
- [ ] Record remaining issues and update the project's user-facing setup documentation and status after acceptance.

**Completion criteria:** The owner has an installable Mac app and has completed the full mine-to-review workflow with Anki closed. Backup restoration and a packaged update have been exercised.

## Phase D7 — Windows Release

**Goal:** Deliver the same mining and study workflow on Windows from the shared desktop codebase.

Tasks:

- [ ] Verify the Windows installer on real Windows hardware or a representative VM, starting with x64. Register and remove the Chrome bridge correctly for the intended install scope.
- [ ] Verify filesystem paths, Korean font fallback, audio playback, keyboard shortcuts, import sizes and recovery from the desktop app being closed.
- [ ] Test install, upgrade and reinstall with a populated library. Restore a Mac-created backup on Windows and confirm media, due dates and review history.
- [ ] Run the full end-to-end acceptance flow against the packaged Windows build and retest the Mac build and Chrome extension.
- [ ] Publish supported OS and architecture details with install and troubleshooting steps after the owner approves the release.

**Completion criteria:** A clean Windows installation can pair with Chrome, import real material, receive newly mined words, complete both study modes and restore a portable backup.

## Milestone workflow

Work through one approved phase at a time. For each checkpoint, verify the normal user flow and failure recovery, run the relevant automated checks, update project documentation and make a local Git commit. Share what passed, any remaining live checks and the specific flow Adam can try before starting the next phase.

The proposed first-release defaults are one scheduled card per headword, active-recall ratings for SRS, and 10-question untimed practice. Validate those defaults in the owner's first live study session. Approach D0 as a technical spike and confirm platform and installer choices before committing to them.

## Technical references

- [Electron introduction](https://www.electronjs.org/docs/latest/) and [code signing](https://www.electronjs.org/docs/latest/tutorial/code-signing)
- [Chrome Native Messaging](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging)
- [Anki FSRS settings](https://docs.ankiweb.net/deck-options.html#fsrs) and [TypeScript FSRS](https://github.com/open-spaced-repetition/ts-fsrs)
- [Anki deck exports and media options](https://docs.ankiweb.net/exporting.html)
