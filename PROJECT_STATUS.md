# Project status

## 23 November 2026

Korean Reader's supported build is the Chrome extension. The Electron app, review scheduler, practice mode, desktop bridge and Wi-Fi pairing have been removed from the source and build. Old installed app files and study data are outside this change.

| Area | Current behaviour |
| --- | --- |
| Reading | Korean and Japanese YouTube captions, transcript sidebar, known-word coverage and webpage parsing. |
| Mining | Selected definitions, sentence context and available YouTube media are saved locally. Mining from regular HTTP and HTTPS webpages is accepted. |
| Anki | The toolbar syncs mined vocabulary through AnkiConnect. Settings supports separate Korean and Japanese decks, default note types, custom field mappings and known-word imports. |
| Statistics | Choose a language to see its known-word history and Anki deck. Statistics include reviews left today, lifetime reviews and time, seven-day due cards and known deck coverage. Available metrics stay visible after partial failures. |
| Known words | Settings exports and merges known-word JSON by language. Japanese transfers include reading identities. The original Korean format, vocabulary and chart history remain readable. |
| Interface | The toolbar groups language, transcript and page actions above Anki and vocabulary, with the star backdrop confined to the header. The toolbar, Settings and Statistics animate the existing penguin logo. Settings and Statistics share icon navigation and have distinct browser tab icons. Mining feedback and the known-word chart use short animations with reduced-motion support. |

## Japanese setup

Import the English JMdict archive once from **Settings → Dictionary → Japanese dictionary**, then choose **Japanese** in the toolbar. For Anki, save a separate deck under the Japanese Anki profile. The toolbar switch changes the active tab and the default for new tabs.

## Verification

- The automated suite covers language-scoped storage, Japanese text offsets and ruby restoration, caption language detection, dictionary and transfer parsing, same-spelling Anki cards and retries, mixed-deck note protection and the Korean regressions.
- Type checks with unused-code diagnostics, the Chrome production build and the ZIP pass.
- The toolbar layout and both themes were checked in an isolated headless Chrome profile with the actual unpacked build. The smoke check also covers visible keyboard focus and transcript feedback on an unsupported tab.
- Full-archive browser import, live YouTube track selection and media capture, desktop and mobile Anki playback, and the real-profile upgrade across Mac and Windows still require live verification. The earlier Japanese verification run could not launch isolated Chrome or resolve the upstream archive host.
- Japanese-only definitions and machine translation remain optional research in the [Japanese roadmap](docs/japanese-support-roadmap.md). Core Japanese definitions come from JMdict.

## Updating

Reload the existing unpacked extension from the same directory. Use **Settings → Known words transfer** to move current known words. Use the original Anki collection or Anki export for existing schedules. The former Korean Reader app's reviews are not imported into Anki.

See the [README](README.md) for setup and [Anki integration](docs/anki-integration.md) for note-type details.
