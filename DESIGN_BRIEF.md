# DESIGN_BRIEF.md — Korean Reader

**Current scope:** Mine in Chrome and study locally in Korean Reader Desktop. The earlier [PDF brief](Project%20Design%20Brief%20%E2%80%94%20Korean%20Reader.pdf) records the original v1.0 direction.

## 1. Project Overview

**Project Name:** Korean Reader

**Project Type:** Personal Google Chrome Extension

**Inspiration:** Kimchi Reader and Yomitan.

### Purpose

Create a free, personal Korean language-learning and vocabulary-mining tool.

The application will allow users to interact with Korean subtitles on YouTube, look up individual words in a Korean-English dictionary, save vocabulary and study it in Korean Reader Desktop.

The application is intended exclusively for personal use.

### Primary Goal

Provide a streamlined workflow for learning Korean through native content.

The user should be able to watch Korean YouTube videos, understand unfamiliar vocabulary and save useful words for desktop study without interrupting their viewing experience.

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
9. Open Korean Reader Desktop.
10. Review or practise with mined vocabulary.

Clicking a word must never automatically mine it.

Mining requires an explicit "Mine Word" action. The adjacent "Known" action saves the dictionary headword's local known status.

The same-computer desktop bridge sends only saved mined entries as study cards.

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

### 3.1.1 Interactive Transcript Sidebar

On YouTube watch pages, the toolbar popup opens a separate transcript beside the video. The sidebar tries to load the full Korean transcript. When unavailable, it explains the fallback and collects rendered Korean captions during playback. Users can search, follow the active line, or revisit earlier lines with the seek button. Words use the shared dictionary and Known action. Mine Word seeks to the selected line before capturing media.


The header beside **Korean transcript** shows the percentage of unique Korean lexical words marked known, rounded to one decimal (for example, `86.8% known` for 434 of 500). Hover over the percentage for the exact known/total count. Repeated words, conjugated forms and supported contraction aliases count once; standalone particles, endings, punctuation and non-Korean text are excluded. Lexical compound parts have stable counts even if a known whole compound makes them known. This is vocabulary coverage, not a comprehension score.

Opening the sidebar analyses all loaded Korean subtitle lines in sequential batches, reusing cached analysis. The percentage updates when known status changes and remains based on the entire loaded transcript during search. It shows **Calculating…** until analysis completes, **No words** for an empty vocabulary, or **Coverage unavailable** on analysis failure. Collected-caption fallback shows **(partial)** and updates as lines arrive; it cannot describe subtitles YouTube has not supplied.

### 3.1.2 Webpage Korean Parsing

The toolbar popup includes a **Parse Page** button that parses Korean text on any standard webpage on demand using Chrome's `activeTab` and `scripting` permissions. Visible Korean text nodes are tokenised in batches with Kiwi, unknown words are underlined in the user's configured underline colour, and clicking any parsed word opens the shared dictionary popup with Known and Mine Word actions (capturing the surrounding sentence, page title and URL). Clicking **Parse Page** again restores the original webpage DOM.

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
- Save the selected English definitions, or selected Korean definitions when English is unavailable.
- Save the source video URL.
- Save the video timestamp where available.
- Record the date mined.
- Mark the vocabulary entry as known.

Display a confirmation when a word has been successfully mined.

If a word has already been mined, indicate that it is already in the vocabulary collection.

Do not automatically create duplicate vocabulary entries. One vocabulary entry is allowed per dictionary headword.

Allow the user to save additional example sentences for previously mined words. Additional sentences are stored in the vocabulary entry. Desktop displays the saved contexts on the matching study card.

Known/unknown status rules:

- A word that has not been marked before defaults to unknown.
- Mining a word marks it as known.
- Selecting "Known" marks the dictionary headword as known without saving a mined sentence or creating a study card.
- A stored noun, pronoun, adverb, or predicate can match across particles and productive grammatical suffixes (`들`, `쯤`, `씩`, `끼리`), which are rendered as plain un-underlined text. For example, known `여러분` removes the underline from `여러분` in `여러분들의`, and `들`/`의` are not underlined.
- Multi-word chunks split visually into adjacent clickable sub-words where grammatical boundaries permit, and all constituent parts (including explicit `이다` on copula constructions or fused contractions) must be known before the underline is removed.
- Colloquial contractions and their standard equivalents (e.g., `이거` ↔ `이것`, `재밌다` ↔ `재미있다`) share known status.
- Unspaced compound nouns (e.g., `한국어공부`) match as a whole when known, and split into individual clickable parts otherwise.
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
- Export vocabulary as JSON. CSV export and import are future enhancements.

### 3.6 Desktop study and existing Anki cards

The desktop companion receives mined vocabulary from Chrome on the same computer and imports Korean Reader JSON or Anki .apkg deck packages. It stores sentences, images and audio locally and keeps one schedule per headword. The package importer carries across current scheduling when the export includes it, while retaining existing Korean Reader reviews. The Chrome settings accept text-based known-word imports for reading coverage.

Desktop Review uses FSRS and configurable daily limits. Quick practice shows meaning and sentence completion questions based on saved examples. The app records quiz answers separately from due dates and review ratings.

### 3.7 Settings

Provide configuration for:

- Dictionary preferences.
- KRDict API credentials. The key is entered in Settings and stored locally; it is never committed to source control or read by the content script.
- Subtitle appearance, including the custom subtitle font.
- Vocabulary management.

### 3.8 Statistics

Desktop Stats shows the Chrome profile's known-word count and how it changes over time. It also shows recorded desktop reviews, time spent reviewing, 30-day review activity, streaks, graduated cards, recall rate and practice accuracy.

### 3.9 Accounts and progress sync

The configured Chrome extension keeps its optional Google/Firebase prototype under Settings → Google account. The desktop app studies locally. See the [account sync plan](docs/account-sync.md) and [desktop sync options](docs/desktop-sync-options.md).

## 4. Storage and Privacy

The following rules describe the initial release. Phase 10 adds an opt-in exception for account identity and known-word progress using Firebase Spark.

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
8. Send mined cards to Korean Reader Desktop.
9. Study with local FSRS and Quick Practice.

A reliable implementation of these features is more important than additional functionality.
