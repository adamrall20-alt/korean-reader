# DESIGN_BRIEF.md — Korean Reader

## 1. Project Overview

**Project Name:** Korean Reader

**Project Type:** Personal Google Chrome Extension

**Inspiration:** Kimchi Reader and Yomitan.

### Purpose

Create a free, personal Korean language-learning and vocabulary-mining tool.

The application will allow users to interact with Korean subtitles on YouTube, look up individual words in a Korean-English dictionary, save vocabulary and synchronise collected words with Anki.

The application is intended exclusively for personal use.

### Primary Goal

Provide a streamlined workflow for learning Korean through native content.

The user should be able to watch Korean YouTube videos, understand unfamiliar vocabulary and save useful words to Anki without interrupting their viewing experience.

## 2. Core User Workflow

The primary workflow is:

1. Open a YouTube video containing Korean subtitles.
2. Activate the interactive subtitle functionality.
3. View Korean subtitles with individually clickable words.
4. Click an unfamiliar word.
5. View its dictionary information in a compact popup.
6. Select the "Mine Word" button to save it.
7. Open the vocabulary mining panel.
8. Review collected words.
9. Select an Anki deck.
10. Synchronise selected vocabulary through AnkiConnect.

Clicking a word must never automatically mine it.

Vocabulary must only be saved when the user explicitly selects "Mine Word".

Vocabulary must only be transferred to Anki when the user explicitly initiates synchronisation.

## 3. Core Features

### 3.1 YouTube Subtitle Integration

- Detect YouTube video pages.
- Detect available Korean subtitles.
- Read currently displayed subtitle text.
- Extract subtitle timing information where available.
- Hide YouTube's native subtitle line and display the extension's own interactive subtitle overlay.
- Use a softer font for the custom subtitles. A placeholder font stack is used until the final font is chosen.
- Identify individual Korean words.
- Synchronise subtitle updates with video playback.
- Allow subtitle interaction without interfering with normal YouTube controls.

The initial implementation should prioritise reliable extraction of currently displayed subtitles.

If custom subtitle extraction fails, the extension should fall back to leaving YouTube's native subtitles visible.

Full transcript retrieval and dedicated transcript reading modes are future enhancements.

### 3.2 Interactive Korean Words

- Split Korean subtitles into individually clickable words.
- Clicking a word opens its dictionary popup directly above the selected word.
- Hovering over a word must not open anything.
- Clicking another word updates the existing popup.
- Clicking outside the popup closes it.
- When the popup opens above the word, it must remain inside the visible browser viewport.
- Preserve the original sentence context.
- Identify the original word form where possible.

### 3.3 Korean Dictionary

Integrate a Korean-English dictionary.

Preferred primary source: National Institute of Korean Language (KRDict).

Dictionary entries should display:

- Korean dictionary headword.
- Original subtitle form.
- English definitions.
- Part of speech.
- Conjugation information where available.
- Pronunciation.
- Hanja where available.
- Example sentences where available.

Use Korean morphological analysis to identify dictionary forms of conjugated words.

Preferred morphological analyser: Kiwi.

Cache dictionary results locally to minimise repeated requests.

### 3.4 Vocabulary Mining

The dictionary popup must contain an explicit "Mine Word" button.

When selected:

- Save the dictionary entry.
- Save the original subtitle form.
- Save the original sentence.
- Save the English definition.
- Save the source video URL.
- Save the video timestamp where available.
- Record the date mined.
- Mark the vocabulary entry as known.

Display a confirmation when a word has been successfully mined.

If a word has already been mined, indicate that it is already in the vocabulary collection.

Do not automatically create duplicate vocabulary entries. One vocabulary entry is allowed per dictionary headword.

Allow the user to save additional example sentences for previously mined words. Additional sentences are stored in the vocabulary entry. When syncing to Anki, all saved sentences are placed in the note's Sentence field, separated by a newline.

Known/unknown status rules:

- A word that has not been marked before defaults to unknown.
- Mining a word marks it as known.
- The user can change the status with a known/unknown toggle.

### 3.5 Vocabulary Management

Create a vocabulary management interface.

Required functionality:

- Display all mined vocabulary.
- Search vocabulary.
- Sort by date mined.
- Filter by known or unknown status.
- Display and toggle known/unknown status.
- Display dictionary definitions.
- Display original sentence context. Additional sentences can be added to an existing word.
- Display source video information.
- Delete vocabulary entries.
- Edit vocabulary information.
- Select individual entries for Anki synchronisation.
- Select multiple entries for bulk synchronisation.
- Export vocabulary as JSON. CSV export and import are future enhancements.

### 3.6 Anki Integration

Use AnkiConnect.

Do not develop a separate Anki add-on or custom Anki extension.

Required functionality:

- Detect whether AnkiConnect is available.
- Check the connection to Anki Desktop.
- Retrieve available Anki decks.
- Retrieve available note types.
- Retrieve note fields.
- Allow deck selection.
- Allow note type selection.
- Map vocabulary information to Anki fields.
- Detect existing notes.
- Create new notes.
- Support bulk note creation.
- Display synchronisation results.
- Report errors and unsuccessful synchronisation attempts.

The user must explicitly initiate synchronisation.

AnkiConnect is responsible for creating notes in Anki. Review scheduling and flashcard reviews remain entirely within Anki.

### Anki Card Structure

The application must support the user's existing Anki note type:

**Kimchi Sentence Mining**

Do not create a new note type or replace the existing card structure.

The note type contains the following fields:

1. Focus Word
2. Sentence
3. Definition
4. Pronunciation
5. Image
6. Audio

The application must populate these fields using information collected during vocabulary mining.

One Anki card is allowed per vocabulary headword. The extension must never create duplicate notes for the same word. Duplicate detection is based on the dictionary headword.

The Sentence field contains the original subtitle sentence. If the user has saved additional example sentences for the word, they are appended in the same field, separated by newlines.

The Image and Audio fields remain empty until screenshot and audio capture are implemented. Missing optional media must not prevent note creation.

#### Front of Card

The front of the card displays the following elements in order:

1. Focus word audio.
2. Image.
3. Sentence.

The focus word must be highlighted in orange wherever it appears in the sentence.

#### Back of Card

The back of the card displays:

- English definition.
- Korean focus word.
- Pronunciation information.

Hanja definitions and character breakdowns are not required.

#### Important Requirements

- Preserve compatibility with the existing Kimchi Sentence Mining note type.
- Do not create a replacement note type.
- Do not modify existing Anki card templates.
- Populate the existing fields with the appropriate information.
- Missing optional information must not prevent a note from being created.
- Preserve the original Korean sentence.
- Ensure the focus word is correctly identified and highlighted.

### 3.7 Settings

Provide configuration for:

- Dictionary preferences.
- KRDict API credentials. The key is entered in Settings and stored locally; it is never committed to source control or read by the content script.
- Anki connection.
- Default Anki deck.
- Anki note type.
- Field mapping.
- Subtitle appearance, including the custom subtitle font.
- Vocabulary management.

## 4. Storage and Privacy

- Store vocabulary locally.
- Store cached dictionary results locally.
- Avoid requiring an account.
- Avoid cloud databases.
- Avoid analytics and tracking.
- Do not transmit vocabulary to external services except when required for an explicitly requested integration.
- Never expose API credentials in public source code.

## 5. Initial Scope Restrictions

The initial version should NOT include:

- A custom flashcard review system.
- A separate Anki add-on.
- AI-powered sentence translation.
- AI grammar explanations.
- Social features.
- User accounts.
- Cloud synchronisation.
- Mobile applications.
- Paid services.

These may be considered in the future.

## 6. Minimum Viable Product

The first functional release must support the complete core workflow:

1. Detect Korean YouTube subtitles.
2. Display subtitles.
3. Make individual words clickable.
4. Retrieve dictionary information.
5. Display a dictionary popup.
6. Save vocabulary using an explicit Mine Word button.
7. Display saved vocabulary.
8. Connect to AnkiConnect.
9. Send selected vocabulary to Anki.

A reliable implementation of these features is more important than additional functionality.