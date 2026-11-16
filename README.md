# Korean Reader

Personal Korean language-learning and vocabulary-mining Chrome extension. It is designed for personal use and is inspired by Kimchi Reader and Yomitan.

The long-term workflow is:

1. Watch a Korean video on YouTube.
2. Read Korean subtitles with individually clickable words.
3. Click a word to see its dictionary entry.
4. Mine the word explicitly.
5. Review saved vocabulary.
6. Synchronise newly mined words to Anki through AnkiConnect.

## Current Status

**Phase 5 — AnkiConnect sync is implemented and fixture-tested.**

Implemented:

- WXT + Vue 3 + TypeScript + Tailwind CSS project.
- Chrome Manifest V3 configuration.
- Background, content, popup and options entrypoints.
- Vocabulary toolbar popup and settings page.
- Background health check used by the popup.
- YouTube page detection for `/watch`, `/shorts/` and `/live/` URLs.
- Caption extraction from YouTube's rendered caption windows.
- Korean detection using Hangul ranges and track metadata where available.
- Shadow DOM subtitle overlay with the placeholder soft-font stack.
- Native caption hiding limited to the active player.
- Automatic fallback to native captions when Korean captions stop.
- Kiwi WASM tokenization with locally bundled model assets.
- Background tokenization messaging to keep analysis out of the YouTube page.
- Individual clickable Korean word spans with selected-word state.
- KRDict lookup popup with definitions, pronunciation and part of speech.
- Local KRDict API-key settings.
- IndexedDB dictionary-result caching with a Settings clear-cache action.
- Dictionary popup with up to three English definitions, Korean definitions as a fallback, and optional entry details.
- On-demand English translation of Korean definitions on desktop Chrome when its built-in Translator API is available.
- YouTube playback pauses when a subtitle word is selected.
- Red underlines for unknown Korean subtitle words, removed when the word is marked known.
- Explicit **Mine Word** and **Save Sentence** actions in the dictionary popup.
- Local vocabulary management with search, date sorting, known status, definition edits, deletion, and JSON export.
- Direct Settings shortcut in the toolbar popup.
- Component tests, type checking and a production build.

- AnkiConnect with deck and note type selection, configurable field mapping, and one-click sync for newly mined words, with a live unsynced count.

The user verified Phases 2–3 on live YouTube. Phase 4 passed in headless Chrome using
fixture captions and KRDict responses. A KRDict API key in Settings is needed for a
live lookup. Phase 5 passed a Chrome loopback test with mock AnkiConnect responses.
See [Anki setup](docs/anki-integration.md) for connecting to your collection.

## Project Structure

```text
korean-reader/
├── AGENTS.md
├── DESIGN_BRIEF.md
├── UI_DESIGN.md
├── TECH_STACK.md
├── ROADMAP.md
├── PROJECT_STATUS.md
├── README.md
├── .gitignore
├── package.json
├── package-lock.json
├── wxt.config.ts
├── tsconfig.json
├── vitest.config.ts
├── assets/
│   ├── tailwind.css
│   └── subtitle-overlay.css
├── design/
│   ├── references/
│   ├── mockups/
│   └── screenshots/
├── docs/
│   ├── architecture.md
│   ├── dictionary.md
│   └── anki-integration.md
├── public/
│   └── icon/
├── entrypoints/
│   ├── background.ts
│   ├── content.ts
│   ├── popup/
│   │   ├── index.html
│   │   └── main.ts
│   └── options/
│       ├── index.html
│       └── main.ts
├── components/
│   ├── DictionaryPopup.vue
│   ├── SubtitleReader.vue
│   ├── WordToken.vue
│   ├── MiningPanel.vue
│   └── SettingsPanel.vue
├── services/
│   ├── youtube/
│   │   ├── captions.ts
│   │   ├── native-captions.ts
│   │   ├── overlay.ts
│   │   └── presenter.ts
│   ├── dictionary/
│   ├── korean/
│   ├── anki/
│   └── storage/
├── types/
│   ├── messages.ts
│   └── youtube.ts
└── tests/
    ├── setup.ts
    ├── components/
    ├── entrypoints/
    └── services/
        └── youtube/
```

## Requirements

- Node.js 22 or newer.
- npm.
- Google Chrome desktop.

Anki Desktop and AnkiConnect will be needed for Phase 5. A KRDict API key is needed for
Phase 3 and is stored locally in the extension settings.

## Install

```bash
npm install
```

`npm install` runs `wxt prepare` automatically to generate WXT types.

## Development

Start the WXT development server:

```bash
npm run dev
```

WXT generates a development build and can launch a Chrome profile with the extension loaded. The development build is written to `.output/chrome-mv3-dev`.

## Build

```bash
npm run build
```

The production extension is written to:

```text
.output/chrome-mv3
```

## Load the extension in Chrome

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Select **Load unpacked**.
4. Choose the `korean-reader/.output/chrome-mv3` folder.
5. Pin **Korean Reader** to the toolbar if desired.

For development, use `.output/chrome-mv3-dev` after running `npm run dev`.

If captions appear as plain text with no clickable words, check the **Loaded from** path for Korean Reader in `chrome://extensions`. If it points to `.output/chrome-mv3`, click **Reload** on that entry and refresh the YouTube tab. If it points to another folder, check that folder before replacing the installation. Chrome stores vocabulary under the installed extension ID, which can change when you load from a different folder.

## Automated Checks

Run the tests once:

```bash
npm run test:run
```

Run TypeScript type checking:

```bash
npm run compile
```

Run the production build:

```bash
npm run build
```

Current automated result:

| Check | Result |
|---|---|
| `npm run test:run` | 12 test files, 54 tests passing |
| `npm run compile` | Passing |
| `npm run build` | Passing |

## Manual Verification Checklist

After loading `.output/chrome-mv3` in Chrome:

### 1. Popup

- Click the Korean Reader toolbar icon.
- The popup should show **Korean Reader**, a Settings button, the connection status, and the vocabulary panel.
- The status should change to **Connected** with the text “The background service worker is responding.”
- The footer should show `v0.1.0`.
- **Sync to Anki** becomes available after connecting Anki, mapping the required fields, and choosing a deck. The word list is under **Manage vocabulary**.

If the status is **Unavailable**, open `chrome://extensions`, click **Errors** or the background service worker link, and check for a startup error.

### 2. Settings page

- Click the Settings gear in the top-right of the Korean Reader popup. The extension options
  page should open directly. The Options entry in `chrome://extensions` remains available.
- A full-page Settings interface should open.
- It should list **General**, **Dictionary**, **Anki**, **Appearance** and **Storage**.
- Under Dictionary, the KRDict API key can be saved locally and the dictionary cache can be cleared.

### 3. YouTube content script

- Open any `https://www.youtube.com/watch?v=...` page.
- Open DevTools with `F12` or `Cmd+Option+I`.
- In the Console, look for:

  ```text
  [Korean Reader] Content script ready on YouTube.
  ```

- In the Elements panel, the `<html>` element should have:

  ```html
  data-korean-reader="ready"
  ```

- No overlay should appear until Korean captions are actually displayed.

YouTube’s console can contain unrelated errors from YouTube itself, advertising requests and other extensions. Messages such as `net::ERR_BLOCKED_BY_CLIENT`, `Permissions-Policy` warnings or `Unsafe attempt to load URL` are not caused by Korean Reader. The `[Korean Reader]` line is the one to check.

### 4. Background service worker

- On `chrome://extensions`, find Korean Reader.
- Click the **service worker** link under the extension.
- The worker console should show:

  ```text
  [Korean Reader] Background service worker started.
  ```

Chrome may later label the worker **Inactive** when it is idle. This is normal Manifest V3 behaviour. Opening the service worker console or sending a message wakes it again.

### 5. Reload behaviour

- Reload the extension from `chrome://extensions`.
- Reload the YouTube page.
- The popup should still connect and the content script log should appear again.

### 6. Korean subtitles (Phase 1)

Use a Korean video with captions available. Turn the video volume down or mute it before testing.

1. Enable subtitles in YouTube's player and choose Korean, including an auto-generated Korean track if available.
2. During dialogue, YouTube's native caption line should be replaced by the custom overlay.
3. The overlay should use the softer subtitle font and stay centred near the bottom of the video.
4. The overlay text should change in time with playback.
5. Leave a silent moment: native captions should return after about half a second, then the overlay should take over again when Korean speech resumes.
6. Switch to a non-Korean caption track. Native captions should remain and the overlay should disappear.
7. Disable captions entirely. No overlay should appear.
8. Switch to another video. The old overlay should not linger.
9. Check that play, seek, volume and subtitle controls remain fully clickable beneath or around the overlay.
10. If YouTube shows a miniplayer or preview with captions, its captions should not be hidden.

Captions must be enabled for extraction to work; the extension does not turn them on automatically. If the overlay never appears while Korean captions are visible, include the video URL, caption type (manual or auto-generated) and any `[Korean Reader]` console messages in the report.

### 7. Vocabulary mining (Phase 4)

1. Click a Korean subtitle word and confirm it appears in the dictionary popup.
2. Click **Mine Word**. Open the toolbar panel and confirm it lists the word as **Known**.
3. Expand its sentence and check the source link and timestamp.
4. Reopen the same subtitle word to check its saved state. Find it in a different sentence and click **Save Sentence**. The toolbar panel should show both sentences under one word.
5. Check search, the status filter, definition editing, and **Export JSON**. Delete the test entry when finished.

## Project Documentation

- `AGENTS.md` — working instructions for the development agent.
- `DESIGN_BRIEF.md` — product requirements and behaviour.
- `UI_DESIGN.md` — visual direction and interface rules.
- `TECH_STACK.md` — technology and architecture decisions.
- `ROADMAP.md` — implementation order and task tracking.
- `PROJECT_STATUS.md` — current status and known issues.
- `docs/architecture.md` — runtime architecture and data ownership.
- `docs/dictionary.md` — planned KRDict integration.
- `docs/anki-integration.md` — AnkiConnect setup, note mapping, and sync behaviour.

## Privacy

- Vocabulary and dictionary cache data are stored locally.
- No accounts, analytics or tracking.
- The KRDict API key will be stored in `chrome.storage.local`, never in source control.
- The content script will not receive API credentials.

## Scripts

| Script | Purpose |
|---|---|
| `npm run dev` | Start WXT in development mode |
| `npm run build` | Build the production Chrome extension |
| `npm run zip` | Create a distributable zip |
| `npm run compile` | Type-check with `vue-tsc` |
| `npm test` | Run Vitest in watch mode |
| `npm run test:run` | Run Vitest once |
