# Design brief

## Product

Korean Reader makes Korean and Japanese subtitles and webpages readable with click-to-look-up dictionary entries, vocabulary highlighting and explicit sentence mining. Anki handles flashcard reviews and cross-device study.

## Core workflows

| Workflow | Expected behaviour |
| --- | --- |
| YouTube subtitles | Render clickable words in the selected language while staying aligned with playback. Keep native captions usable if the extension cannot render a line. |
| YouTube transcript | Start closed. Load the selected language transcript or collect rendered subtitles during playback, and let the user search, seek and mine a previous line. Show known coverage for the entire loaded transcript with a partial label where applicable. |
| Webpage parsing | Parse the selected language only after the user selects **Parse Page**. A second selection restores the original text. Use the surrounding sentence and source URL for mining. |
| Dictionary lookup | Open on click. Show the headword, clicked form, definitions and available pronunciation, part of speech, Hanja and examples. |
| Known status | Underline unfamiliar lexical words. Use Kiwi dictionary forms and contraction aliases to recognise known words across inflections. **Known** updates reading coverage without mining. |
| Sentence mining | **Mine Word** saves the selected definitions, original form, sentence and source, then marks the headword known. YouTube contexts can include a timestamp, image and audio. Allow additional sentences for the same headword. |
| Vocabulary management | Search, paginate, edit definitions, toggle known status, delete and export locally saved vocabulary. |
| Anki | Send mined sentences and media by explicit sync. Create the Korean Reader or Japanese Reader note type when needed and support field mapping to existing note types. Duplicate headwords should reuse notes where the mapping allows it. |
| Statistics and transfer | Show local known-word history and the selected Anki deck's study statistics. Provide a mergeable export for current known words. |

## Linguistic requirements

Grammar segments such as particles, endings and productive suffixes should not count as vocabulary. Keep derivational affixes attached. Respect contracted equivalences such as 이거 and 이것, and require separate lexical parts of a compound or copula construction to be known when the whole form is unfamiliar. Deduplicate the transcript coverage denominator across repeated and inflected words.

## Storage and scope

Store reading data and settings locally. Korean dictionary lookups use KRDict. Japanese lookups use the local JMdict index. Morphology runs in the browser, and card writes go through AnkiConnect on the same computer. Keep credentials out of source and content scripts. No Korean Reader account or separate review system is required.

The [original PDF brief](Project%20Design%20Brief%20%E2%80%94%20Korean%20Reader.pdf) is a historical design record.
