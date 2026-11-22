# Project status

## 23 November 2026

Korean Reader's supported build is the Chrome extension. The Electron app, review scheduler, practice mode, desktop bridge and Wi-Fi pairing have been removed from the source and build. Old installed app files and study data are outside this change.

| Area | Current behaviour |
| --- | --- |
| Reading | Interactive YouTube captions, transcript sidebar, known-word coverage and webpage parsing. |
| Mining | Selected definitions, sentence context and available YouTube media are saved locally. Mining from regular HTTP and HTTPS webpages is accepted. |
| Anki | The toolbar syncs mined vocabulary through AnkiConnect. Settings supports the Korean Reader note type, custom field mapping and known-word imports from a selected deck. |
| Statistics | The extension shows local known counts and history plus due counts, deck coverage, lifetime review counts and review time from AnkiConnect. |
| Known words | Settings exports and merges current known words using a versioned JSON file. IndexedDB remains at version 4 so existing vocabulary and chart history remain readable. |

## Verification

- All 177 automated tests passed. They cover Anki note creation and updates, duplicate detection, deck imports, media, review statistics, webpage mining, a 13,000-word transfer request and repeat imports that preserve mined contexts.
- Type checking, including unused-code diagnostics, and the Chrome production build and ZIP passed.
- Live verification with the owner's Anki collection, two Chrome installations and YouTube media remains open. The isolated Chrome launch terminated before the browser could load the extension in this workspace.

## Updating

Reload the existing unpacked extension from the same directory. Use **Settings → Known words transfer** to move current known words. Use the original Anki collection or Anki export for existing schedules. The former Korean Reader app's reviews are not imported into Anki.

See the [README](README.md) for setup and [Anki integration](docs/anki-integration.md) for note-type details.
