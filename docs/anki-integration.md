# Import from Anki

## Import cards into Korean Reader Desktop

1. In Anki, choose **File → Export** and select **Anki Deck Package (.apkg)** and the deck you want.
2. Tick **Include media** for sentence audio and images. Tick **Include scheduling information** to carry across each imported card's current due date and progress.
3. In Korean Reader Desktop choose **Import Anki .apkg**, select the file and check the import summary. You can close Anki while using the imported cards.

The importer recognises Anki's current compressed packages and older compatible exports. It maps common Korean Reader and Kimchi Sentence Mining field names, including **Focus Word**, **Sentence**, **Definition**, **Pronunciation**, **Image** and **Audio**. It keeps line breaks and highlighted forms where available and copies supported images and audio into the desktop media store. Unsupported notes and missing or unsupported attachments appear in the import summary.

Korean Reader uses one scheduled card per headword and keeps additional sentences. If a note has several Anki cards, the importer prefers a graduated card and then the longest interval. It uses the package's due date and stored FSRS stability and difficulty when present. Earlier review histories, deck settings, suspension flags and Anki templates do not transfer. Existing reviews done in Korean Reader take precedence on reimport. Packages with no scheduling information start new cards.

The importer accepts packages up to 1 GB, with a 256 MB limit for the embedded collection and a 25 MB limit per attachment. Export smaller decks if needed. Test unfamiliar templates with a small export to confirm the automatic field mapping.

## Import known words for Chrome reading coverage

Use Chrome **Settings → Import known words**. Pick an Anki **Notes in Plain Text** export or a Kimchi Reader word-status CSV and confirm the preview. For Anki notes, the extension reads a recognised column heading such as Focus Word, or the first field when headings are absent. Kimchi Reader status 2 marks a word as known. Importing this list updates subtitle coverage. Use the desktop package import for study cards and media.

See the [Anki export manual](https://docs.ankiweb.net/exporting.html) for Anki's package settings.
