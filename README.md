# Korean Reader v1.0

Korean vocabulary mining in Chrome, with local review and practice in Korean Reader Desktop. It is designed for personal use and is inspired by Kimchi Reader and Yomitan.

The v1.0 workflow is:

1. Watch a Korean video on YouTube.
2. Read Korean subtitles with individually clickable words.
3. Click a word to see its dictionary entry.
4. Choose **Mine Word** to save a sentence or **Known** to mark the word known locally.
5. Run Korean Reader Desktop to receive mined sentences, audio and images.
6. Review cards with FSRS, play a quick practice session and check progress in **Stats**.

## Install in Chrome — start here

Korean Reader is loaded manually into **Google Chrome on Mac or Windows**. It is not currently installed through the Chrome Web Store.

**Use the ready-built extension ZIP supplied by Adam. You do not need Node.js, npm or a code editor for this method.** GitHub's **Code → Download ZIP** downloads the source project instead; that requires the separate build steps below.

### 1. Download and keep the extension folder

1. Ask Adam for the ready-built extension ZIP, for example `korean-reader-1.0.0-chrome.zip`.
2. Extract the ZIP: double-click it on Mac, or right-click → **Extract All…** on Windows.
3. Move the extracted folder somewhere permanent, such as `Documents/Korean Reader`. Chrome needs this folder to remain on your computer; do not delete it after installing.
4. Open the folder and find **`manifest.json`**. This is the folder you will select in Chrome. If it is inside another folder, open that inner folder first.

### 2. Add it to Chrome

1. Open Chrome. If you use multiple Chrome profiles, switch to the profile where you want to use Korean Reader.
2. Type `chrome://extensions` into the address bar and press Enter.
3. Turn on **Developer mode** in the top-right corner.
4. Click **Load unpacked** in the top-left corner.
5. Select the extracted folder that directly contains **`manifest.json`**. Select the folder, not the ZIP or the manifest file itself.
6. Check that **Korean Reader** appears and is switched on.
7. Click Chrome's puzzle-piece **Extensions** button beside the address bar, then pin **Korean Reader** so it is easy to open.

### 3. Set up dictionary lookups

1. Click the Korean Reader toolbar icon, then the **Settings gear**.
2. Open **Dictionary**.
3. Enter your KRDict API key and click **Save**. You need a key from the [Korean Basic Dictionary](https://krdict.korean.go.kr/); contact Adam if you need help obtaining one.
4. Wait for **KRDict API key saved locally.** Your key is saved in this Chrome profile.

Dictionary lookup, mining and desktop study work without a Google account.

### 4. Try it on YouTube

1. Open a YouTube video that has Korean captions. Refresh any YouTube tabs that were already open before installation.
2. Turn on captions using YouTube's **CC** button. In the player's **Settings → Subtitles/CC**, choose Korean, including an auto-generated Korean track if available.
3. Play the video. Korean Reader should replace the caption text with clickable words.
4. Click a Korean word to open its definition. Choose **Mine Word** to save it, or **Known** to mark it known without mining.
5. For the transcript beside the video, open the Korean Reader toolbar popup and choose **Open Sidebar**.

### 5. Study in Korean Reader Desktop

In the project checkout, install dependencies with `npm install` and run `npm run desktop:start`. Keep the desktop app open while mining in Chrome to receive cards automatically. Use **Import JSON** for an existing Korean Reader vocabulary export or **Import Anki .apkg** for an Anki deck with scheduling and media. Chrome **Settings → Import known words** accepts Anki notes text and Kimchi Reader word-status CSVs for reading coverage. See the [Anki import guide](docs/anki-integration.md).

**Review** uses local FSRS. **Practice** generates up to ten A/B/C/D questions from saved sentences. **Stats** shows known-word history, review time and totals, and practice accuracy. The Chrome popup shows your local known-word count and sends history to Desktop. Stats updates when it arrives. If the popup says Desktop is unavailable, choose **Retry** or **Export history**, then use **Stats → Import history** in Desktop.

To sync two computers on the same network, open **Desktop Settings → Sync over Wi-Fi**. Choose **Find nearby devices** on both, select the other computer on either one, and confirm the matching six digits. The apps remember each other and sync automatically while both are running. To share Known words with Chrome, show the Chrome link code in Desktop Settings and enter it in **Extension Settings → Storage**. [Wi-Fi sync setup](docs/desktop-sync-options.md).

On macOS, `npm run desktop:start` builds and opens the local **Korean Reader.app**. To build a ZIP without opening the app, run `npm run desktop:package:mac` and find `Korean-Reader-mac.zip` in `.output/desktop-mac`. Extract the app to a local folder outside cloud-synced Documents. The **Profile** tab lets you set a username and see your review level and vocabulary rank. See the [desktop plan](DESKTOP_APP_PLAN.md) for release packaging.

## Update an existing installation

**Keep the same extension installed and use the same folder. Do not remove it from Chrome or load each update from a newly named folder.** Local vocabulary and settings belong to the installed extension; changing its identity can leave that data behind.

1. In **Settings → Storage → Known words and vocabulary**, use **Export JSON** to save a copy of your vocabulary. This is a vocabulary export, not a complete restorable backup of all settings and history.
2. Download and extract the new ready-built ZIP into a temporary folder.
3. Replace the old extension files with the new files **inside the original installation folder**, keeping `manifest.json` directly in that folder. Do not put the new folder inside the old one.
4. Open `chrome://extensions`, find the existing **Korean Reader** entry and click its **Reload** button (the circular arrow).
5. Refresh your YouTube tabs, then open the toolbar popup and check the version at the bottom.

Do not move or delete the permanent extension folder while you are using it.

## Installation troubleshooting

| Problem | What to check |
|---|---|
| No **Load unpacked** button | Turn on **Developer mode** at `chrome://extensions`. |
| Chrome cannot find or read the manifest | Extract the ZIP first, then select the folder directly containing `manifest.json`. A source-code ZIP must be built before it can be loaded. |
| Dictionary asks for a key or lookup fails | Save your own KRDict key under **Settings → Dictionary** and check your internet connection. |
| Captions are visible but words are not clickable | Select Korean captions, confirm the extension is enabled, reload the extension and refresh the YouTube tab. |
| No full transcript appears | Some videos do not expose a full transcript. Leave Korean captions on and play the video to collect lines. |
| Anki import failed | Export an Anki Deck Package (.apkg). Include media and scheduling if needed, then choose **Import Anki .apkg** in Desktop. |
| Words disappear after an update | Check that you reloaded the original extension rather than installing a second copy from another folder or Chrome profile. Keep the original installation; contact Adam before removing anything. |

## YouTube transcript sidebar

On a YouTube watch page, choose **Open Sidebar** in the Korean Reader toolbar popup. Drag its left edge to resize, search for a word or phrase, or turn off **Auto-scroll** to browse independently. The arrow and timestamp next to a line seek to its start. Click a Korean word to open the dictionary, then choose **Mine Word** to jump to that line and save it.

When YouTube does not provide the full Korean transcript, enable Korean captions and play the video to collect lines. Collected lines remain available if you close and reopen the sidebar on the same video in that tab. The panel overlays theatre or narrow layouts and hides while fullscreen is active.


The header beside **Korean transcript** shows the percentage of unique Korean lexical words marked known, rounded to one decimal (for example, `86.8% known` for 434 of 500). Hover over the percentage for the exact known/total count. Repeated words, conjugated forms and supported contraction aliases count once; standalone particles, endings, punctuation and non-Korean text are excluded. Lexical compound parts have stable counts even if a known whole compound makes them known. This is vocabulary coverage, not a comprehension score.

Opening the sidebar analyses all loaded Korean subtitle lines in sequential batches, reusing cached analysis. The percentage updates when known status changes and remains based on the entire loaded transcript during search. It shows **Calculating…** until analysis completes, **No words** for an empty vocabulary, or **Coverage unavailable** on analysis failure. Collected-caption fallback shows **(partial)** and updates as lines arrive; it cannot describe subtitles YouTube has not supplied.

## Current Status

**Current development:** Desktop D3 practice, Stats, offline Anki import and same-computer Chrome delivery are available. Chrome and Desktop keep study data local. See [PROJECT_STATUS.md](PROJECT_STATUS.md) for verification and [DESKTOP_APP_PLAN.md](DESKTOP_APP_PLAN.md) for the desktop roadmap.

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
- Dictionary popup with up to three English definitions (`gloss: definition` when KRDict provides both), Korean definitions as a fallback, and optional entry details.
- On-demand English translation of Korean definitions on desktop Chrome when its built-in Translator API is available.
- YouTube playback pauses when a subtitle word is selected.
- Red underlines for unknown Korean subtitle words. Known base forms match conjugated verbs and nouns or pronouns with particles or the plural suffix 들.
- Explicit **Mine Word** and **Save Sentence** actions in the dictionary popup.
- **Known** beside **Mine Word** marks the dictionary headword as known without saving a sentence or creating a study card.
- Local vocabulary management with search, date sorting, known status, definition edits, deletion, and JSON export.
- Direct Settings shortcut in the toolbar popup.
- Screenshot capture for study cards, where browser video access permits.
- Subtitle audio capture and playback in Desktop, with further live YouTube checks pending.
- Desktop Stats for known-word history, lifetime reviews, review time, streak and quiz performance.

- Import of known words from Anki notes text and Kimchi Reader status CSV files. Desktop imports full Anki deck packages.
- Selectable dictionary definitions when mining.
- Component tests, type checking and production builds (see the dated verification log in PROJECT_STATUS.md).

Chrome mining uses a KRDict API key for live lookups. See the [architecture guide](docs/architecture.md) for data ownership and the [desktop sync design](docs/desktop-sync-options.md) for local Wi-Fi and Chrome Known words.

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
├── desktop/
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
│   ├── desktop/
│   └── storage/
├── types/
│   ├── messages.ts
│   └── youtube.ts
└── tests/
    ├── setup.ts
    ├── components/
    ├── desktop/
├── entrypoints/
    └── services/
        └── youtube/
```

## Build from source — developer setup

Skip this section if you installed the ready-built ZIP above. These steps are for building the extension yourself from the source project.

### Build requirements

- Node.js 24.12 or newer.
- npm.
- Google Chrome desktop.

A KRDict API key is needed for dictionary lookups and is stored locally in extension settings.

### Install dependencies

Open a terminal in the extracted or cloned `korean-reader` project folder, then run:

```bash
npm install
```

`npm install` runs `wxt prepare` automatically to generate WXT types.

### Development

Start the WXT development server:

```bash
npm run dev
```

WXT generates a development build and can launch a Chrome profile with the extension loaded. The development build is written to `.output/chrome-mv3-dev`.

### Production build

```bash
npm run build
```

The production extension is written to:

```text
.output/chrome-mv3
```

### Load your source build

Follow [Add it to Chrome](#2-add-it-to-chrome), selecting the generated `.output/chrome-mv3` folder inside your project. On Mac, if `.output` is hidden in the folder picker, press **Command + Shift + .** to show hidden files and folders.

For development, use `.output/chrome-mv3-dev` after running `npm run dev`.

For updates, rebuild in the same project location, click **Reload** on the existing extension at `chrome://extensions`, and refresh YouTube. Do not remove and reinstall the extension.

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
| `npm run test:run` | See the latest dated entry in PROJECT_STATUS.md |
| `npm run compile` | See the latest dated entry in PROJECT_STATUS.md |
| `npm run build` | See the latest dated entry in PROJECT_STATUS.md |

## Manual Verification Checklist

After loading `.output/chrome-mv3` in Chrome:

### 1. Popup

- Click the Korean Reader toolbar icon.
- The popup should show **Korean Reader**, the Settings gear, **Open Sidebar** and **Parse Page**.
- The footer should show `Version 1.0.0`.

If the popup reports a connection or vocabulary error, open `chrome://extensions`, click **Errors** or the background service worker link, and check for a startup error.

### 2. Settings page

- Click the Settings gear in the top-right of the Korean Reader popup. The extension options
  page should open directly. The Options entry in `chrome://extensions` remains available.
- A full-page Settings interface should open.
- It should list **General**, **Dictionary**, **Import known words**, **Appearance** and **Storage**.
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
6. Look up another unknown word and click **Known** beside **Mine Word**. Confirm its underline clears immediately, it appears as **Known** in Settings → Storage, and no study card appears in Desktop.

## Project Documentation

- `AGENTS.md` — working instructions for the development agent.
- `DESIGN_BRIEF.md` — product requirements and behaviour.
- `UI_DESIGN.md` — visual direction and interface rules.
- `TECH_STACK.md` — technology and architecture decisions.
- `ROADMAP.md` — implementation order and task tracking.
- `PROJECT_STATUS.md` — current status and known issues.
- `docs/architecture.md` — runtime architecture and data ownership.
- `docs/dictionary.md` — KRDict lookup and caching behaviour.
- `docs/anki-integration.md` — Anki deck and known-word import.
- [Desktop architecture](docs/desktop-architecture.md) and [sync options](docs/desktop-sync-options.md).
- `docs/interview-questions.md` — interview-style questions about the product and its engineering.

## Privacy

- Vocabulary and dictionary cache data are stored locally.
- The extension requires no account and keeps words, history and media local. Dictionary lookup uses KRDict.
- The KRDict API key is stored in `chrome.storage.local`, never in source control.
- The content script does not receive API credentials.

## Scripts

| Script | Purpose |
|---|---|
| `npm run dev` | Start WXT in development mode |
| `npm run build` | Build the production Chrome extension |
| `npm run zip` | Create a distributable zip |
| `npm run compile` | Type-check with `vue-tsc` |
| `npm test` | Run Vitest in watch mode |
| `npm run test:run` | Run Vitest once |

### Word frequency credits

Shiberu Korean Word Frequency List 2026 by [Shiberu](https://shiberu.app/korean-frequency-list), licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Source credits and licence are bundled in `public/frequency`. A `#80,000+` indicator means the headword was not found in the list.
