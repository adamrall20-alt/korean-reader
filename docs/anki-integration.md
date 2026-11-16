# Anki Integration — Korean Reader

## Status

Planned for Phase 5. Nothing in this document is implemented yet.

## Connection

Use AnkiConnect.

- Documentation: https://foosoft.net/projects/anki-connect/
- Repository: https://github.com/FooSoft/anki-connect
- Default endpoint: `http://127.0.0.1:8765`

Anki Desktop and AnkiConnect are external dependencies installed by the user. The extension must detect when AnkiConnect is unavailable and report the problem clearly.

## Note Type

Integrate with the user's existing note type:

**Kimchi Sentence Mining**

Use `modelNames` and `modelFieldNames` to read the actual field names rather than assuming them.

Expected fields:

1. Focus Word
2. Sentence
3. Definition
4. Pronunciation
5. Image
6. Audio

Do not create a replacement note type and do not modify the user's card templates.

## One Card Per Word

- A vocabulary headword may have at most one Anki card.
- Never create duplicate notes for the same headword.
- Before creating a note, check Anki for an existing note for that headword.
- A new sentence for an existing word updates the existing vocabulary record and its Sentence field rather than creating another card.

## Field Mapping

| Anki Field | Data Source |
|---|---|
| Focus Word | Korean dictionary headword |
| Sentence | Original subtitle sentence, plus additional saved sentences separated by newlines |
| Definition | English dictionary definition |
| Pronunciation | Dictionary pronunciation |
| Image | Empty until screenshot capture is implemented |
| Audio | Empty until audio capture is implemented |

Missing optional media must not prevent note creation.

## Duplicate Detection

Planned order of operations:

1. Build the candidate note from the vocabulary record.
2. Query AnkiConnect for an existing note for the headword.
3. If a note exists, do not create another one. When the user adds another example sentence, update the existing note's Sentence field with `updateNoteFields` rather than creating a second card.
4. If no note exists, create it.
5. Store the returned Anki note ID on the vocabulary record.

The exact `findNotes` query must be verified against the user's collection during Phase 5.

## Required AnkiConnect Operations

- `version`
- `deckNames`
- `modelNames`
- `modelFieldNames`
- `findNotes`
- `canAddNotes`
- `addNote`
- `addNotes`
- `updateNoteFields`

## Settings

- AnkiConnect endpoint.
- Connection status.
- Default deck.
- Note type.
- Field mapping.
- Optional tags, if added later.

## Browser Origin and CORS

AnkiConnect may reject requests from the extension's origin depending on its `webCorsOriginList` configuration.

Phase 5 must verify:

- whether the background service worker can call `http://127.0.0.1:8765` with the manifest's host permissions;
- whether AnkiConnect needs the extension origin added to its configuration;
- how to document the required setup without telling the user to disable browser security.

Do not work around a rejected origin by exposing credentials or moving the request into the YouTube page.

## Error Handling

Display clear results for:

- AnkiConnect not running;
- connection refused;
- invalid deck or note type;
- missing fields;
- duplicate notes;
- `canAddNotes` rejection;
- partial success during bulk synchronisation;
- invalid or missing media.

Report both successful and unsuccessful synchronisation attempts. Never silently synchronise vocabulary.

## Out of Scope

- Creating a custom Anki add-on.
- Review scheduling.
- Replacing Anki's flashcard review interface.
- Screenshot and audio capture until those features are implemented.
