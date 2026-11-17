# Anki Integration — Korean Reader

The extension syncs mined vocabulary to Anki Desktop through AnkiConnect. Connection, field mapping, duplicate handling, sentence updates, image/audio attachment and known-word import are implemented. The user confirmed the Phase 5 workflow and imported approximately 6,000 known words. Live verification of Phase 8 audio playback in the user's card template remains pending; see [PROJECT_STATUS.md](../PROJECT_STATUS.md).

## Setup

1. Open Anki Desktop with AnkiConnect installed and enabled.
2. In the Korean Reader toolbar popup, click **Connect Anki** and approve the request in Anki if prompted.
3. Choose a deck and the existing **Kimchi Sentence Mining** note type. Expand **Field mapping** to check the discovered fields. Use **Save defaults** to reuse the configuration.
4. Check **New unsynced words** and click **Sync to Anki**. New headwords go to the selected deck. Existing headwords in the collection are checked for missing sentences or English definitions. The popup summarises the result.
5. Open **Manage vocabulary** to review, edit, or export entries.

The default endpoint is `http://127.0.0.1:8765/`. **Connection settings** supports a different local port and an optional AnkiConnect API key. The background worker makes the requests and stores the defaults in `chrome.storage.local`.

If AnkiConnect denies access, use the exact extension origin shown under **Connection settings**. In Anki, open **Tools → Add-ons → AnkiConnect → Config**, add that origin to `webCorsOriginList`, and restart Anki. If AnkiConnect has an API key configured, enter it in Korean Reader. Keep the server bound to loopback.

Reference: [AnkiConnect API documentation](https://github.com/ankiultimate/anki-connect/blob/master/README.md).

## Import known words

In **Settings → Anki**, connect to Anki Desktop. Under **Import known words**, choose a deck and click **Preview import**. The preview includes its subdecks and uses the **Focus Word** field. For the configured note type, it can also use the mapped word field when there is no **Focus Word** field. Empty or non-Korean values are skipped, and identical headwords are counted once.

Click **Mark words known** to save the previewed words locally. Existing vocabulary records retain their definitions and examples. New entries become available in **Storage** and affect subtitle lookups and underlines right away. Import reads the deck without writing to Anki. A word enters the sync workflow after you mine a subtitle sentence for it.

The dictionary popup's **Known** button also saves a word's status locally. A word marked known this way is eligible for Anki sync once you mine a sentence for it.

## Kimchi Sentence Mining fields

| Anki field | Value |
|---|---|
| Focus Word | Dictionary headword |
| Sentence | Saved subtitle text in order, separated by HTML line breaks |
| Definition | Edited or dictionary English or a saved machine translation, followed by the Korean definition when available |
| Pronunciation | Dictionary pronunciation when available |
| Image | First captured video frame, if available; existing non-empty images are preserved |
| Audio | First available subtitle recording as an Anki sound reference. An existing note receives it only if the mapped field is empty. |

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


### Subtitle audio

When you mine a word, Korean Reader replays the subtitle, records its audio and returns the paused video to the point where you selected the word. Select **Add Audio** to record a previously saved sentence again if it has no clip. The recording stays local until you select **Sync to Anki**. If capture or upload is unavailable, the sentence can still be saved. An upload failure appears in the sync results and can be retried by syncing again.
