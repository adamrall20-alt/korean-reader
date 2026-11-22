# Roadmap

## Current release direction

Korean Reader is a Chrome reading and mining extension. Anki owns review scheduling and cross-device card sync. Known words travel between Chrome profiles through a mergeable file.

## Delivered milestones

| Milestone | Scope |
| --- | --- |
| Foundation and subtitles | Manifest V3, YouTube caption monitoring, interactive overlay and native-caption fallback. |
| Korean analysis and dictionary | Kiwi tokenisation, dictionary headwords, KRDict, definition selection, pronunciation and cache. |
| Mining and settings | Local vocabulary management, media capture, JSON export, subtitle styling and interface themes. |
| Transcript and browser reading | Searchable Korean transcript, replay and seek, known-word coverage, webpage parsing and shared dictionary popup. |
| Anki and statistics | AnkiConnect, Korean Reader note type, deck import, known-word transfer and extension Statistics. |

## Verification remaining

- Check live subtitle and transcript behaviour on a representative set of Korean YouTube videos.
- Confirm capture and card playback in Anki on desktop and mobile.
- Repeat the transfer from the existing Mac Chrome profile to the intended PC.

See [Project status](PROJECT_STATUS.md) for the latest verification. The Git history records prior experiments and original phase checklists.

## Unscheduled work

Potential additions include local subtitle-file import, undo for known-status changes and replay shortcuts. STDICT remains deferred until API access is available.
