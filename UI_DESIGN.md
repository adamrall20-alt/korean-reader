# UI design

## Visual language

Use the existing penguin logo and star backdrop across the toolbar, Settings and Statistics. Keep dark as the default, provide a light theme and use green for primary actions. Use neutral surfaces, readable contrast and rounded controls. Subtitle text uses local font stacks for Korean and Japanese. Subtitle size, font, text colour and underline colour are configurable.

The mascot hops once on entry and waddles on hover. Settings and Statistics share labelled navigation, and their browser tab icons pair the penguin with a green page symbol. Settings categories and toolbar actions use matching line icons. The known-word chart uses a continuous step line with a brief fade-in, and a green sparkle accompanies a successful mining or known-word action. These animations respect reduced-motion preferences.

## Reading interface

- Open the dictionary on word click and close it with Escape or by clicking outside. Keep the popup in the viewport and preserve the clicked sentence.
- Show the headword first. Include the clicked form, rank and available dictionary metadata. Let the user select definitions before mining. Give visible feedback for loading, errors and saved actions.
- Show lexical underlines for unknown words. Leave grammar segments unmarked and keep adjacent sub-words visually connected.
- Start the transcript sidebar closed. Provide search, timestamp seek buttons and a follow toggle. Stop following while searching or interacting with a definition. Mark the current cue and label partial coverage.
- Restore native YouTube captions if the extension cannot show a usable interactive line.

## Extension pages

| Page | Main actions |
| --- | --- |
| Toolbar | Show the language selector and side-by-side transcript and page actions in Reading tools. Put Anki connection, known words, pending sync and explicit sync in a separate section below. Keep the penguin and star backdrop in the header with the Statistics and Settings shortcuts. |
| Settings | Set theme, subtitle appearance and dictionary options. Configure Anki and import from decks. Transfer known words and manage vocabulary. |
| Statistics | Show the total known words, a history chart and a table of recorded totals. Lead with reviews left today, lifetime reviews and review time for the chosen Anki deck. Keep available metrics visible when another metric fails, and provide a refresh button for the Anki panel. |

## Accessibility

Use visible keyboard focus, labelled inputs and buttons, semantic headings and status announcements. Respect reduced-motion preferences. Label reading text with `lang="ko"` or `lang="ja"` as appropriate and supply numeric alternatives to chart visuals.
