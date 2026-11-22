# UI design

## Visual language

Use the existing penguin logo and star backdrop across the toolbar, Settings and Statistics. Keep dark as the default, provide a light theme and use green for primary actions. Use neutral surfaces, readable contrast and rounded controls. Subtitle text uses local font stacks with Korean fallbacks. Subtitle size, font, text colour and underline colour are configurable.

## Reading interface

- Open the dictionary on word click and close it with Escape or by clicking outside. Keep the popup in the viewport and preserve the clicked sentence.
- Show the headword first. Include the clicked form, rank and available dictionary metadata. Let the user select definitions before mining. Give visible feedback for loading, errors and saved actions.
- Show lexical underlines for unknown words. Leave grammar segments unmarked and keep adjacent sub-words visually connected.
- Start the transcript sidebar closed. Provide search, timestamp seek buttons and a follow toggle. Stop following while searching or interacting with a definition. Mark the current cue and label partial coverage.
- Restore native YouTube captions if the extension cannot show a usable interactive line.

## Extension pages

| Page | Main actions |
| --- | --- |
| Toolbar | Connect and sync Anki, see known and pending counts, open the transcript, parse the page, visit Statistics and Settings. |
| Settings | Set theme, subtitle appearance and dictionary options. Configure Anki and import from decks. Transfer known words and manage vocabulary. |
| Statistics | Show the total known words, a history chart and a table of recorded totals. Show Anki deck statistics in a separate panel with its own refresh and failure state. |

## Accessibility

Use visible keyboard focus, labelled inputs and buttons, semantic headings and status announcements. Respect reduced-motion preferences. Label Korean reading text with `lang="ko"` where appropriate and supply numeric alternatives to chart visuals.
