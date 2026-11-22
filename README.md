# Korean Reader

Korean Reader is a Chrome extension for reading Korean subtitles and webpages, looking up unfamiliar words and mining sentences to Anki. Review on your computer or phone with AnkiWeb sync.

## Install in Chrome

1. Build the extension from source using the commands below, or extract the Chrome release ZIP into a permanent folder.
2. Open `chrome://extensions`, enable **Developer mode** and choose **Load unpacked**.
3. Select `.output/chrome-mv3` for a source build, or the extracted folder for a release ZIP.
4. Open **Settings → Dictionary**, enter a [KRDict API key](https://krdict.korean.go.kr/) and save it.
5. Refresh any YouTube tabs that were open during installation.

### Update an existing installation

Build into the same directory or replace the files inside the existing unpacked folder. Click **Reload** on the existing Korean Reader entry in `chrome://extensions`, then refresh open tabs. Keep the Chrome profile, extension ID and folder path so Chrome can find your saved vocabulary and settings.

## Read and mine

- On YouTube, enable Korean captions and click a word to look it up. Use **Open Sidebar** from the toolbar popup to search and replay transcript lines. The sidebar shows unique known-word coverage for the loaded transcript. If YouTube only supplies rendered captions, the sidebar collects them as they play.
- On a Korean webpage, choose **Parse Page** in the toolbar popup. Choose it again to restore the page.
- Select **Known** to update highlighting without creating a card. Select definitions and choose **Mine Word** to save a sentence and, on YouTube, capture a screenshot and available subtitle audio.
- In **Settings → Storage**, search and edit saved vocabulary or export a JSON copy of your vocabulary and captured media.

## Study with Anki

1. Install [AnkiConnect](https://ankiweb.net/shared/info/2055492159) in Anki and restart Anki.
2. In **Settings → Anki**, click **Connect Anki** and allow the extension if Anki prompts for access.
3. Choose a deck and the **Korean Reader** note type, then click **Save defaults**. You can also map the fields of an existing note type.
4. Mine words, then click **Sync to Anki** in the toolbar popup with Anki open. Mined words stay in the extension until you can sync.
5. Sync your Anki collection with [AnkiWeb](https://docs.ankiweb.net/syncing.html) to review on another computer or on your phone.

The toolbar chart button opens **Statistics**. It shows your known-word count and history even when Anki is closed. With Anki connected, it also shows reviews due, deck vocabulary coverage, total recorded reviews and review time.

### Move known words between computers

On your Mac, open **Settings → Known words transfer → Export known words**. On the PC, open the same section, choose that JSON file and click **Mark words known**. The import merges the lists, so you can repeat it safely. It copies current known words only. Changes made later can be transferred with a fresh export, and words removed on one computer need to be changed separately on the other.

The same section accepts Anki notes text and Kimchi Reader word-status CSV files. To import directly from an Anki deck, use **Settings → Anki**. See the [Anki guide](docs/anki-integration.md) for field mapping and troubleshooting.

## Develop

Use Node.js 24.12 or newer with npm. Node.js 24.15 or newer is recommended for current tooling.

```sh
npm ci
npm run dev
npm run compile
npm run test:run
npm run build
npm run zip
```

The production build is in `.output/chrome-mv3`. The ZIP is generated under `.output`.

## Project documentation

| Document | Purpose |
| --- | --- |
| [Design brief](DESIGN_BRIEF.md) | Product scope and learning workflows |
| [UI design](UI_DESIGN.md) | Layout, interaction and accessibility |
| [Technical stack](TECH_STACK.md) | Dependencies, runtime and storage |
| [Architecture](docs/architecture.md) | Entry points, message flow and data ownership |
| [Anki integration](docs/anki-integration.md) | Setup, note type and sync behaviour |
| [Dictionary integration](docs/dictionary.md) | KRDict lookups, Kiwi and cache behaviour |
| [Subtitle audio capture](docs/audio-capture-plan.md) | Capture flow and limitations |
| [Roadmap](ROADMAP.md) | Delivered milestones and open work |
| [Project status](PROJECT_STATUS.md) | Verification and known issues |

## Privacy and credits

Vocabulary, media, preferences and history are stored locally in Chrome. KRDict receives dictionary search terms. AnkiConnect uses loopback to reach Anki, which manages its own optional AnkiWeb sync. Korean word frequency uses the [Shiberu list](public/frequency/README.txt) under its bundled [licence](public/frequency/LICENSE.txt).
