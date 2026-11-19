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

The toolbar's **Open Sidebar** button appears below the Anki controls. The panel starts closed. On standard desktop watch pages it sits above YouTube recommendations, and its left edge can be dragged or resized with the arrow keys. It uses an overlay in theatre or narrow layouts and hides during fullscreen. The rounded search field, timestamp buttons and scrollable list follow YouTube's transcript layout. Korean Reader's green accent marks the current line and interactive controls in both themes.

The seek button combines an arrow and timestamp. Clicking a Korean word pauses the video and opens the existing dictionary popup without seeking. Auto-scroll starts enabled and pauses while searching or reviewing a definition.

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

Provide a small, accessible vocabulary management panel.

The panel should display:

- Saved Korean words.
- English meanings.
- Known/unknown status with a toggle.
- Selection controls.
- Number of selected words.
- Anki connection status.
- Selected Anki deck.
- Synchronisation button.

A word defaults to unknown until it is marked. Mining a word and selecting "Known" both mark it as known. The user can change the status later.

The interface should make it easy to review collected vocabulary and synchronise it with Anki.

### Synchronisation

Use a clearly visible button labelled:

"Sync to Anki"

Only selected vocabulary should be synchronised unless the user explicitly chooses an option to synchronise all eligible entries.

Each word has a maximum of one Anki card. The extension must never create duplicate cards for the same headword. Multiple example sentences for a word are combined in the card's Sentence field, separated by newlines.

Display successful and unsuccessful synchronisation results.

Never silently synchronise vocabulary.

## 6. Settings Interface

Provide a simple settings interface.

Organise settings into logical categories:

- General.
- Dictionary.
- Anki.
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
- AnkiSyncButton
- AnkiConnectionStatus
- SettingsPanel

The proposed file structure starts with five top-level component files: `DictionaryPopup`, `SubtitleReader`, `WordToken`, `MiningPanel` and `SettingsPanel`. Smaller elements such as definition rows, the mine button and status badges may live inside those files. Extract a new component file only when it improves clarity.

Components should be visually consistent.

## 8. Interaction Principles

- Click to open dictionary.
- Hover only provides visual feedback.
- Explicit button press to mine vocabulary.
- Explicit button press to synchronise with Anki.
- Clear confirmation after successful actions.
- Clear error messages when actions fail.
- Avoid unnecessary confirmation dialogs for routine actions.

## 9. Development Priorities

The initial interface should be functional rather than visually elaborate.

Use the established visual language consistently, but prioritise working interactions and usability.

Visual refinements can be introduced after core functionality is reliable.

## Toolbar popup refinement

The toolbar popup presents Anki connection status, vocabulary counts, and an explicit sync button. **Known words** counts all local entries marked known, including imports, even when Anki is disconnected. **New words** counts mined words absent from Anki and requires a configured Anki connection. Vocabulary management and JSON export are in Settings, as are Anki connection, deck, note type and field mapping controls. The Settings vocabulary list shows 50 entries at a time with a **Show more** button and a "Showing X of Y words" count. Search applies after a 250 ms pause in typing. The simplified penguin (`assets/penguin-simple-transparent.png`) is the header logo across the popup, Settings and Statistics and the source for all Chrome extension icon sizes; the supplied star pattern remains a subtle popup background.

## Statistics

In the toolbar popup, the penguin and Korean Reader title precede two right-aligned controls. The bar-graph Statistics icon sits immediately to the left of Settings and opens a new browser tab.

The tab uses the same fixed star-pattern background and dark/light overlay treatment as Settings, with a solid header above it. The known-word graph leads with the current count, change from the starting count, and the tracking start date. **Start tracking** appears until the user opts in. **View recorded totals** exposes the same data as a table.

The Anki section names the saved deck and has a **Refresh** button. It shows reviews left today, the next seven days of scheduled reviews, and deck word overlap. Connection and configuration messages appear in that section so the vocabulary graph remains usable.

### Account progress (Phase 10)

Account-enabled Chrome builds show a Cloud sync card in Statistics. The signed-out card offers Google sign-in. The signed-in card shows the Google account, sign-out, and a responsive row for the account known-word count, pending changes and last successful sync. Import and Sync now sit below the summary. The summary stacks in narrow windows. The account graph uses the existing Statistics chart. The planned release offers optional Google sign-in and automatic sync. Show the active account, last successful sync and pending or unavailable sync states. When registration is paused, explain that guest use is available. After sign-out, show guest progress.

In account mode, distinguish deleting a local mined entry from **Mark unknown**, which changes the shared list. Continue presenting the current computer's live Anki figures separately. See the [Phase 10 plan](docs/account-sync.md) for account behaviour and the open deletion decision.

## Word frequency

Show the Shiberu frequency rank in green to the right of the dictionary heading. Display `#80,000+` when the headword is absent from the list.
