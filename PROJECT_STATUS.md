# PROJECT_STATUS.md — Korean Reader

## Current Project State

**Status:** Phase 0 complete and verified in Chrome
**Current Phase:** Phase 1 — YouTube Integration (awaiting approval)
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

## In Progress

- [ ] Awaiting user approval to begin Phase 1.

## Not Started

### Phase 1 — YouTube Integration

Phase 0 is verified. Phase 1 has not started and requires user approval.

### Phase 2 — Interactive Korean Words

Not started.

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

## Manual Verification

Verified by the user in Chrome on 16 November 2026:

| Check | Result |
|---|---|
| Toolbar popup | Pass — UI rendered and background connection shown as connected |
| Settings page | Pass — opened and all planned categories rendered |
| YouTube content script | Pass — `[Korean Reader] Content script ready on YouTube.` logged |
| Background service worker | Pass — startup log observed |
| Reload behaviour | Pass — content script ran again after reloading the YouTube tab |

## Automated Verification

Last run: 16 November 2026

| Check | Command | Result |
|---|---|---|
| Unit/component tests | `npm run test:run` | Pass — 4 files, 10 tests |
| Type checking | `npm run compile` | Pass |
| Production build | `npm run build` | Pass — `.output/chrome-mv3` |
| Packaging | `npm run zip` | Pass — `.output/korean-reader-0.1.0-chrome.zip` |

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
| Vocabulary status | Unknown by default; mining marks a word as known |
| Export | JSON in Phase 4; CSV export and import later |
| Version control | Git + GitHub |

## Known Issues

- Chrome MV3 service workers display as **Inactive** when they are idle. This is normal; opening the service worker console or sending a message wakes the worker.
- `npm install` reports engine warnings from two transitive packages (`nopt`, `abbrev`) because the local Node version is v24.14.0 while those packages declare support for v24.15.0 or newer. Installation, tests, type checking and the production build all succeed.
- Kiwi browser compatibility has not been verified.
- AnkiConnect browser-origin/CORS behaviour has not been verified.

## Pending Investigation

- Bundled Kiwi WebAssembly feasibility, size and Manifest V3 CSP requirements.
- KRDict API registration, authentication and response formats.
- YouTube subtitle DOM reliability and native-caption fallback behaviour.
- AnkiConnect communication permissions and CORS configuration.
- Tailwind CSS behaviour inside a Shadow DOM content-script UI.
- Appropriate dictionary cache expiry and clearing strategy.

## Development Notes

Phase 0 is complete and verified in Chrome. No Phase 1 functionality has been started.

The production build is at `.output/chrome-mv3`. See `README.md` for setup, testing and manual verification instructions.

Phase 1 begins only after user approval.
