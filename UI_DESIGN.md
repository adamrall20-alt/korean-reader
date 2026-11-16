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

Requirements:

- Individual words must be visually identifiable as interactive elements.
- Words should have a subtle interactive hover state.
- Clicking a word opens its dictionary popup.
- Hovering must never trigger a dictionary lookup.
- The currently displayed subtitle should remain synchronised with video playback.
- Interactive elements must not interfere with normal video controls.

Use subtle visual feedback to indicate that words are clickable.

Avoid excessive underlining or distracting highlighting.

## 4. Dictionary Popup

The dictionary popup is one of the primary interface components.

It should:

- Appear only when a word is clicked.
- Be compact and unobtrusive.
- Appear near the selected word where practical.
- Remain within the visible browser viewport.
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

Definitions should be easy to scan.

### Mining Button

Include a prominent green button labelled:

"Mine Word"

This button must be the only way to save the currently selected dictionary entry through the popup.

After successful mining, display a confirmation state:

"✓ Mined"

If the word already exists in the vocabulary collection, display an appropriate existing-entry state.

Do not automatically mine words when they are clicked.

## 5. Vocabulary Mining Interface

Provide a small, accessible vocabulary management panel.

The panel should display:

- Saved Korean words.
- English meanings.
- Selection controls.
- Number of selected words.
- Anki connection status.
- Selected Anki deck.
- Synchronisation button.

The interface should make it easy to review collected vocabulary and synchronise it with Anki.

### Synchronisation

Use a clearly visible button labelled:

"Sync to Anki"

Only selected vocabulary should be synchronised unless the user explicitly chooses an option to synchronise all eligible entries.

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