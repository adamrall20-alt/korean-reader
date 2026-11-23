# Anki integration

## Connect and choose a deck

Install [AnkiConnect](https://ankiweb.net/shared/info/2055492159), restart Anki and open **Korean Reader Settings → Anki**. Choose **Connect Anki**, approve the extension origin if prompted and select the deck. The default port is `8765`. Change it or enter an API key only if you configured AnkiConnect to require it. Keep AnkiConnect bound to loopback.

New configurations default to **Korean Reader**. If this note type is missing, the integration creates it. Existing connection and mapping settings can be reused. To change note types, choose the new type and click **Save defaults**.

## Japanese deck and note type

Choose **Japanese** under **Anki profile**, connect, and select an existing deck or create **Japanese Mining**. Use **Japanese Reader** or map an existing note type, then save. Both profiles share the local connection and have their own deck, note type and mappings. The two deck trees must be disjoint.

Japanese Reader stores a dictionary identity in its first field. The template keeps that field out of the visible card and uses the same sentence, definitions and media fields as Korean Reader. **Pronunciation** holds the kana reading. For a custom note type, map its kana or reading field to Pronunciation. Sync identifies the clicked spelling and reading and checks that all cards from an existing note belong to the destination deck tree before it changes fields.

## Korean Reader note type

| Field | Content |
| --- | --- |
| Focus Word | Korean dictionary headword |
| Sentence | Saved contexts, with the focus form highlighted |
| Definition | English definitions when available, or Korean and available local translation |
| Pronunciation | Dictionary pronunciation where supplied |
| Image | Screenshot when available |
| Audio | Caption audio when captured |

Anki shows the sentence and available media on the front. The back reveals the focus word, definition and pronunciation. You can also choose an existing note type and map its fields. Focus word, sentence and definition are required.

## Sync mined words

Open Anki, switch the toolbar to the intended language and click **Sync to Anki**. Korean Reader checks the collection for matching focus words and its own note tags before adding notes. Additional sentences are appended to matching notes with a compatible mapping. Existing notes using another note type can be updated by selecting their mapping. If more than one exact match is found, resolve it in Anki before retrying.

Local Chrome mining and use of the **Known** button are available while Anki is closed. Review schedules and media sync between Anki devices through [AnkiWeb](https://docs.ankiweb.net/syncing.html) when configured in Anki.

## Import known words

Use the Anki settings to choose the language and preview focus words from a deck and its subdecks, then confirm the import. Japanese imports resolve the word and optional reading with the installed JMdict. The preview reports unresolved spellings. Existing Anki packages can be opened in Anki first. For a text export or a Korean Reader transfer file, use **Settings → Known words transfer** instead.

## Deck statistics

Statistics uses the deck saved under **Settings → Anki** for the currently selected language. AnkiConnect’s `getDeckStats` returns today's scheduled review count. Learning and new cards have their own counts in Anki. Korean Reader uses `cardReviews` to count lifetime answers and sum their recorded time in milliseconds for cards in the selected deck and its subdecks. The page shows which metrics are unavailable if individual requests fail.

## Troubleshoot

- **Anki unreachable** — Open Anki, check the add-on is enabled and verify the port.
- **Access denied** — Approve the extension in AnkiConnect and verify its optional API key.
- **Note already uses another type** — Select that note type and map its fields to update it.
- **Media or note update failed** — Keep the original extension data and retry. If a note is open for editing in Anki’s browser, close that editor before retrying.
- **Missing reviews in Statistics** — Open Anki and select **Refresh**. Lifetime totals represent review answers for cards currently in the selected deck and its subdecks.
