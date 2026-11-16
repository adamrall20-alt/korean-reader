# Anki Integration — Korean Reader

Phase 5 syncs mined vocabulary to Anki Desktop through AnkiConnect. The Chrome extension has been verified against a loopback AnkiConnect fixture. Live verification of the user's note type and card rendering remains pending.

## Setup

1. Open Anki Desktop with AnkiConnect installed and enabled.
2. In the Korean Reader toolbar popup, click **Connect Anki** and approve the request in Anki if prompted.
3. Choose a deck and the existing **Kimchi Sentence Mining** note type. Expand **Field mapping** to check the discovered fields. Use **Save defaults** to reuse the configuration.
4. Check **New unsynced words** and click **Sync to Anki**. New headwords go to the selected deck. Existing headwords in the collection are checked for missing sentences or English definitions. The popup summarises the result.
5. Open **Manage vocabulary** to review, edit, or export entries.

The default endpoint is `http://127.0.0.1:8765/`. **Connection settings** supports a different local port and an optional AnkiConnect API key. The background worker makes the requests and stores the defaults in `chrome.storage.local`.

If AnkiConnect denies access, use the exact extension origin shown under **Connection settings**. In Anki, open **Tools → Add-ons → AnkiConnect → Config**, add that origin to `webCorsOriginList`, and restart Anki. If AnkiConnect has an API key configured, enter it in Korean Reader. Keep the server bound to loopback.

Reference: [AnkiConnect API documentation](https://github.com/ankiultimate/anki-connect/blob/master/README.md).

## Kimchi Sentence Mining fields

| Anki field | Value |
|---|---|
| Focus Word | Dictionary headword |
| Sentence | Saved subtitle text in order, separated by HTML line breaks |
| Definition | Edited or dictionary English or a saved machine translation, followed by the Korean definition when available |
| Pronunciation | Dictionary pronunciation when available |
| Image | Empty on new notes |
| Audio | Empty on new notes |

Sentence text is HTML-escaped. The original subtitle form and dictionary headword are highlighted in orange when they appear. The extension uses existing note types and templates. Existing cards keep their deck and other fields when a sentence is appended.

For Korean-only entries, clicking **Sync to Anki** attempts on-device English translation in Chrome and stores the result in local vocabulary before sending it to Anki. If Chrome cannot translate, the Korean is still synced and the popup shows a notice. Sync can fill in a blank definition or add English to an existing definition that matches the saved Korean text.

## Duplicate handling

- The worker searches across decks by the mapped focus field, the default focus field, and the saved field and note ID when available. Created notes also carry a stable headword tag so retrying after a connection error or local deletion can find the original note.
- Search candidates are checked for the exact headword. If multiple notes match, or an existing match cannot be updated using the selected note type and sentence field, the word is reported as a conflict.
- A matching note receives missing sentences and can receive missing English. Identical saved sentences are skipped, and the worker checks the updated field after writing.
- New notes are preflighted with `canAddNotes`. AnkiConnect's duplicate protection stays enabled for creation. Bulk results are reported per word, including partial failures.
- After success, IndexedDB records the note ID and last sync time. Retrying a word searches Anki again even if the local marker is missing.

## Live verification

Sync one word to the intended deck and inspect its card in Anki. Check the orange focus word on the front and the definition, headword, and pronunciation on the back. Close the note in Anki's browser before syncing an additional sentence, because AnkiConnect can decline updates to the currently open note.
