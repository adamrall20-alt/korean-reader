# Korean Reader

Personal Korean language-learning and vocabulary-mining Chrome extension. It is designed for personal use and is inspired by Kimchi Reader and Yomitan.

The long-term workflow is:

1. Watch a Korean video on YouTube.
2. Read Korean subtitles with individually clickable words.
3. Click a word to see its dictionary entry.
4. Mine the word explicitly.
5. Review saved vocabulary.
6. Synchronise selected words to Anki through AnkiConnect.

## Current Status

**Phase 0 — Project Foundation is complete and verified in Chrome.**

Implemented:

- WXT + Vue 3 + TypeScript + Tailwind CSS project.
- Chrome Manifest V3 configuration.
- Background, content, popup and options entrypoints.
- Toolbar popup and settings page shells.
- Background health check used by the popup.
- Component tests, type checking and a production build.

Not implemented yet:

- YouTube subtitle detection.
- Custom subtitle overlay.
- Korean tokenisation or Kiwi integration.
- Dictionary lookup or KRDict key entry.
- Vocabulary storage or mining.
- AnkiConnect integration.

Phase 1 is not started and requires approval.

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
│   └── tailwind.css
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
│   ├── dictionary/
│   ├── korean/
│   ├── anki/
│   └── storage/
├── types/
│   └── messages.ts
└── tests/
    ├── setup.ts
    ├── components/
    └── entrypoints/
```

## Requirements

- Node.js 22 or newer.
- npm.
- Google Chrome desktop.

Anki Desktop and AnkiConnect will be needed for Phase 5. A KRDict API key will be needed for Phase 3 and is stored locally when that feature is implemented.

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

Current Phase 0 result:

| Check | Result |
|---|---|
| `npm run test:run` | 4 test files, 10 tests passing |
| `npm run compile` | Passing |
| `npm run build` | Passing |

## Manual Verification Checklist

After loading `.output/chrome-mv3` in Chrome:

### 1. Popup

- Click the Korean Reader toolbar icon.
- The popup should show **Korean Reader**, a **Phase 0** badge and an **Extension status** card.
- The status should change to **Connected** with the text “The background service worker is responding.”
- The footer should show `v0.1.0 · Phase 0 foundation`.
- The **Sync to Anki** button should be disabled. This is intentional; Anki sync is Phase 5.

If the status is **Unavailable**, open `chrome://extensions`, click **Errors** or the background service worker link, and check for a startup error.

### 2. Settings page

- Right-click the Korean Reader toolbar icon and choose **Options**. Alternatively, open the extension details in `chrome://extensions` and select **Extension options**.
- A full-page Settings interface should open.
- It should list **General**, **Dictionary**, **Anki**, **Appearance** and **Storage**.
- Each section should say it is a placeholder and does not save settings yet.

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

- No custom subtitle overlay should appear yet. Subtitle detection is Phase 1.

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

Report any result that differs from the checklist before Phase 1 begins.

## Project Documentation

- `AGENTS.md` — working instructions for the development agent.
- `DESIGN_BRIEF.md` — product requirements and behaviour.
- `UI_DESIGN.md` — visual direction and interface rules.
- `TECH_STACK.md` — technology and architecture decisions.
- `ROADMAP.md` — implementation order and task tracking.
- `PROJECT_STATUS.md` — current status and known issues.
- `docs/architecture.md` — runtime architecture and data ownership.
- `docs/dictionary.md` — planned KRDict integration.
- `docs/anki-integration.md` — planned AnkiConnect integration.

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
