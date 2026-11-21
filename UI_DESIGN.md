# UI_DESIGN.md — Korean Reader

## 1. Design Direction

The application should have a clean, minimalistic interface inspired by Kimchi Reader.

### Visual Identity

- Primarily black, white and neutral grey.
- Green is the primary interactive accent colour.
- Minimal visual clutter.
- Clear typography.
- Rounded interface elements.
- Subtle borders and separators.
- Consistent spacing.
- Simple, understandable icons.

### Colour Palette

Initial suggested colours:

- Primary dark: #111111
- Secondary dark: #1C1C1C
- Light background: #FFFFFF
- Light surface: #F3F3F3
- Accent green: #16A34A
- Secondary text: #888888
- Primary text on dark backgrounds: #FFFFFF
- Primary text on light backgrounds: #111111

Support dark and light appearances where practical, with dark mode as the initial default.

These colours are a starting point and may be refined throughout development.

### Typography

Use a softer, rounded sans-serif for the custom subtitle overlay and interface. The final font has not been chosen yet, so the extension currently uses a local placeholder stack with Korean system fallbacks. Do not load remote fonts; the extension must work offline and must not depend on a third-party font service.

Korean subtitle text should be comfortable to read over video. Prefer clear glyph shapes and generous line height over decorative typography.

## 2. Design Priorities

Development should prioritise:

1. Functional reliability.
2. Readability.
3. Ease of interaction.
4. Consistency.
5. Visual polish.

Do not spend excessive development time on animations or decorative effects before core functionality is complete.

## 3. YouTube Subtitle Interface

Subtitles should be displayed in an accessible, readable format.

The extension hides YouTube's native subtitle line and renders its own custom subtitle overlay. The overlay uses a softer font and supports subtitle appearance settings. If subtitle extraction fails, YouTube's native subtitles should remain visible as a fallback.

Requirements:

- Individual words must be visually identifiable as interactive elements.
- Words should have a subtle interactive hover state.
- Clicking a word opens its dictionary popup.
- Hovering must never trigger a dictionary lookup.
- The currently displayed subtitle should remain synchronised with video playback.
- Interactive elements must not interfere with normal video controls.

Use subtle visual feedback to indicate that words are clickable.

Avoid excessive underlining or distracting highlighting.

### Transcript sidebar

The toolbar's **Open Sidebar** button appears in the toolbar popup. The panel starts closed. On standard desktop watch pages it sits above YouTube recommendations, and its left edge can be dragged or resized with the arrow keys. It uses an overlay in theatre or narrow layouts and hides during fullscreen. The rounded search field, timestamp buttons and scrollable list follow YouTube's transcript layout. Korean Reader's green accent marks the current line and interactive controls in both themes.

The seek button combines an arrow and timestamp. Clicking a Korean word pauses the video and opens the existing dictionary popup without seeking. Auto-scroll starts enabled and pauses while searching or reviewing a definition.


The header beside **Korean transcript** shows the percentage of unique Korean lexical words marked known, rounded to one decimal (for example, `86.8% known` for 434 of 500). Hover over the percentage for the exact known/total count. Repeated words, conjugated forms and supported contraction aliases count once; standalone particles, endings, punctuation and non-Korean text are excluded. Lexical compound parts have stable counts even if a known whole compound makes them known. This is vocabulary coverage, not a comprehension score.

Opening the sidebar analyses all loaded Korean subtitle lines in sequential batches, reusing cached analysis. The percentage updates when known status changes and remains based on the entire loaded transcript during search. It shows **Calculating…** until analysis completes, **No words** for an empty vocabulary, or **Coverage unavailable** on analysis failure. Collected-caption fallback shows **(partial)** and updates as lines arrive; it cannot describe subtitles YouTube has not supplied.

## 4. Dictionary Popup

The dictionary popup is one of the primary interface components.

It should:

- Appear only when a word is clicked.
- Be compact and unobtrusive.
- Open directly above the selected word.
- Remain within the visible browser viewport, shifting horizontally or below the word only when there is not enough room above.
- Close when the user clicks outside it.
- Update when another word is selected.
- Avoid blocking important video controls.

### Dictionary Information

Display:

1. Korean dictionary headword.
2. Original subtitle form.
3. English definition.
4. Part of speech.
5. Conjugation information where available.
6. Pronunciation and additional information where available.
7. Example sentence where available.

The dictionary headword should be visually prominent.

Definitions should be easy to scan. When multiple definitions are available, let the user select one or more; selected definitions have a lighter grey background. A single definition is selected by default. Only the selected definitions are saved when mining a new word.

### Word Actions

Include a prominent green button labelled:

"Mine Word"

Place a button labelled "Known" directly beside "Mine Word" and use the same styling for both. "Known" updates the dictionary headword's local status without mining a sentence. Confirm the action and refresh the subtitle underline. Disable the "Known" action when the headword is already known.

After successful mining, display a confirmation state:

"✓ Mined"

If the word already exists in the vocabulary collection, display an appropriate existing-entry state.

Do not automatically mine words when they are clicked.

## 5. Vocabulary Mining Interface

The Chrome vocabulary manager shows saved Korean words, meanings, known status and sentence context. A word becomes known when the learner mines it or chooses **Known**. Settings provides search, edits and JSON export. The desktop Library organises the cards and their saved examples.

## 6. Settings Interface

Provide a simple settings interface.

Organise settings into logical categories:

- General.
- Dictionary.
- Import known words.
- Appearance.
- Storage.

Avoid overwhelming the user with unnecessary configuration options.

On wider screens the category navigation stays visible as the page scrolls. On narrower screens it appears above the sections. General provides a dark or light theme for Settings, the toolbar popup and the dictionary popup. Dark remains the default.

Appearance provides a preview and controls for subtitle size, text colour, unknown word underline colour and font. The default size is 100% of the existing responsive size. Font presets use local fonts with fallback stacks. Saving applies the chosen styles to open YouTube tabs. Restore defaults resets the preview and can be saved to apply it.

## 7. Component Design

Use reusable interface components.

Initial component concepts:

- SubtitleReader
- SubtitleWord
- DictionaryPopup
- DictionaryDefinition
- MineWordButton
- VocabularyPanel
- VocabularyItem
- SettingsPanel

The proposed file structure starts with five top-level component files: `DictionaryPopup`, `SubtitleReader`, `WordToken`, `MiningPanel` and `SettingsPanel`. Smaller elements such as definition rows, the mine button and status badges may live inside those files. Extract a new component file only when it improves clarity.

Components should be visually consistent.

## 8. Interaction Principles

- Click to open dictionary.
- Hover only provides visual feedback.
- Explicit button press to mine vocabulary.
- Explicit Mine Word and Known actions.
- Clear confirmation after successful actions.
- Clear error messages when actions fail.
- Avoid unnecessary confirmation dialogs for routine actions.

## 9. Development Priorities

The initial interface should be functional rather than visually elaborate.

Use the established visual language consistently, but prioritise working interactions and usability.

Visual refinements can be introduced after core functionality is reliable.

## Toolbar popup

The tilted penguin and Korean Reader title sit next to the Settings gear. **Open Sidebar** and **Parse Page** are the reading actions. The star pattern remains a subtle background. The popup shows the local known-word count and a status for delivery to Desktop.

## Desktop study

Review retains the dark and light palettes and orange sentence highlights. The daily review limit state uses the tilted penguin artwork. Practice shows the highlighted word, an untimed progress count, A/B/C/D meanings and the correct answer with available saved media. The summary lists missed words.

Desktop Stats uses the same theme and compact aggregate cards. A word-history chart with date filters and 30-day review activity show changes over time. The stats labels distinguish words marked known in Chrome from cards that have graduated in desktop SRS.

## Word frequency

Show the Shiberu frequency rank in green to the right of the dictionary heading. Display `#80,000+` when the headword is absent from the list.
