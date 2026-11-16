# PROJECT_STATUS.md — Korean Reader

## Current Project State

**Status:** Phase 1 implemented; awaiting browser verification
**Current Phase:** Phase 1 — YouTube Integration
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

## In Progress

- [ ] Manual verification of Korean subtitle replacement in Chrome.

## Not Started

### Phase 2 — Interactive Korean Words

Not started. Requires Phase 1 verification and user approval.

### Phase 3 — Dictionary Integration

Not started.

### Phase 4 — Vocabulary Mining

Not started.

### Phase 5 — AnkiConnect Integration

Not started.

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
- [ ] Test different YouTube caption types in Chrome.

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

Pending user verification in Chrome:

| Check | Expected result |
|---|---|
| Korean captions | Native caption line is replaced by the custom overlay with the softer font |
| Caption changes | Overlay text tracks caption changes during playback |
| Captions stop | Native captions return within about half a second |
| Non-Korean captions | Native captions remain visible and no overlay appears |
| No Korean track | No overlay appears and native captions behave normally |
| Video navigation | Overlay hides when switching videos and resumes on Korean captions |
| Video controls | Overlay does not block play, seek, volume or subtitle controls |
| Miniplayer/preview | Miniplayers keep their own native captions |

## Automated Verification

Last run: 16 November 2026

| Check | Command | Result |
|---|---|---|
| Unit/component tests | `npm run test:run` | Pass — 8 files, 30 tests |
| Type checking | `npm run compile` | Pass |
| Production build | `npm run build` | Pass — `.output/chrome-mv3` |
| Packaging | `npm run zip` | Pass — `.output/korean-reader-0.1.0-chrome.zip` (Phase 0) |

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
| Korean processing | Kiwi (browser feasibility still to be verified) |
| Dictionary | KRDict; API key entered in Settings and stored locally |
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
- Kiwi browser compatibility has not been verified.
- AnkiConnect browser-origin/CORS behaviour has not been verified.

## Pending Investigation

- Native caption DOM reliability across YouTube layouts, live streams and auto-generated captions.
- Bundled Kiwi WebAssembly feasibility, size and Manifest V3 CSP requirements.
- KRDict API registration, authentication and response formats.
- AnkiConnect communication permissions and CORS configuration.
- Tailwind CSS behaviour inside a Shadow DOM content-script UI.
- Appropriate dictionary cache expiry and clearing strategy.

## Development Notes

Phase 1 is implemented and passes automated checks. Browser verification of Korean caption replacement is still required before Phase 1 is marked complete and Phase 2 begins.

The production build is at `.output/chrome-mv3`. See `README.md` for setup, testing and manual verification instructions.

Phase 2 begins only after Phase 1 is verified and the user approves.
