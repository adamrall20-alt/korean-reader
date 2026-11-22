# Architecture

## Entry points

| Entry point | Responsibility |
| --- | --- |
| `entrypoints/content.ts` | Mount the YouTube reader, observe navigation and connect subtitles and transcript. |
| `entrypoints/transcript-main.content.ts` | Access YouTube's page-world player data for timed captions. |
| `entrypoints/page-parser.ts` | Toggle Korean parsing on the selected webpage. |
| `entrypoints/background.ts` | Register typed message dispatch for dictionary, tokenisation, vocabulary, settings, transfer and AnkiConnect. |
| `entrypoints/popup`, `options`, `statistics` | Mount the toolbar, Settings and Statistics Vue interfaces. |

## Reading and mining

1. The page adapter supplies caption or webpage text. The Kiwi service analyses it through bounded batches. The content client shares an in-flight request and a cache for repeated lines.
2. The interface separates lexical parts from grammar and renders known status from the local headword set. A storage revision patches or reloads the set after vocabulary mutations.
3. Clicking a word supplies the original form and morphemes to the background dictionary service. KRDict details enrich the popup when available.
4. Mining captures the sentence, selected definitions and available video media. The worker stores one vocabulary entry per headword and merges distinct contexts.
5. The toolbar sends an explicit sync request. AnkiConnect adds new notes or updates matching notes, and the worker records successful note IDs. The extension can keep mining while Anki is unavailable.

## Service layout

| Area | Modules |
| --- | --- |
| YouTube | `services/youtube/` contains caption reading, transcript helpers, presentation, sidebar and media capture. |
| Webpages | `services/webpage/` handles text-node parsing and the dictionary popup host. |
| Language processing | `services/korean/` contains Kiwi, dictionary forms, coverage and optional browser translation. |
| Dictionary | `services/dictionary/` handles KRDict, cache keys and frequency rank. |
| Local data | `services/storage/` contains IndexedDB, vocabulary, history, preferences and known-word file handling. |
| Study | `services/anki/` contains the loopback client, note formatting, deck import, note creation and statistics. |

## Local data and permissions

IndexedDB is scoped to the extension ID and browser profile. Vocabulary mutations and known-word snapshots use one read-write transaction. Known words are read by status index, and the Chrome toolbar requests a summary without media. Settings use `chrome.storage.local`.

Anki settings, bulk imports and writes are accepted only from extension pages. Content scripts can request the data they need to display reading tools. The webpage parser uses temporary active-tab access. YouTube content entry points run on watch pages.

## Related documentation

See the [technical stack](../TECH_STACK.md), [Anki integration](anki-integration.md), [dictionary integration](dictionary.md) and [project status](../PROJECT_STATUS.md).
