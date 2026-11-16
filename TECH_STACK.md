# TECH_STACK.md — Korean Reader

## 1. Architecture Overview

Korean Reader will be a locally operated Google Chrome extension.

The application should avoid requiring a remote backend or cloud database.

Its main responsibilities are:

1. YouTube subtitle extraction.
2. Korean morphological analysis.
3. Dictionary lookup.
4. Vocabulary storage.
5. AnkiConnect integration.
6. User interface rendering.

## 2. Core Technologies

### Extension Framework

**WXT**

Use WXT to manage Chrome extension development, entrypoints, building and Manifest V3 configuration.

Documentation: https://wxt.dev/

### Frontend Framework

**Vue 3**

Use Vue 3 for interface components and reactive state management.

### Programming Language

**TypeScript**

Use TypeScript throughout the application.

Avoid untyped JavaScript unless required by a third-party integration.

### Styling

**Tailwind CSS**

Use Tailwind CSS v4 for consistent styling and rapid interface development. It is compiled through the `@tailwindcss/vite` plugin. The shared style entry point is `assets/tailwind.css`.

Do not load remote fonts or remote stylesheets. The extension must work offline.

### Build System

**Vite**, managed through WXT.

## 3. Browser Extension Architecture

Use Chrome Extension Manifest V3.

Separate responsibilities between:

- Content scripts.
- Background service worker.
- Extension interface.
- Storage and application services.

### Data Ownership

The background service worker is the single source of truth for:

- IndexedDB vocabulary and dictionary cache data.
- `chrome.storage.local` settings, including the KRDict API key.
- KRDict API requests.
- AnkiConnect requests.
- Duplicate detection.

The content script must never read the KRDict key, open extension-origin IndexedDB, or call KRDict or AnkiConnect directly. It sends typed messages to the background.

The popup and options pages also request data through the background rather than maintaining their own copies of application state. This avoids multiple competing sources of truth.

### Content Scripts

Responsible for:

- Detecting YouTube pages.
- Detecting rendered subtitles.
- Extracting subtitle text.
- Identifying subtitle updates.
- Hiding native captions and rendering the custom interactive subtitle overlay.
- Rendering the dictionary popup in an isolated Shadow DOM so YouTube styles do not leak into it.
- Sending selected-word and mining requests to the background.

### Background Service Worker

Responsible for:

- Coordinating extension functionality.
- Managing messages between extension components.
- IndexedDB and settings access.
- Dictionary and Anki API calls.
- Handling operations requiring background execution.

Do not rely on the service worker remaining continuously active. It can be woken by messages.

### Interface

Responsible for:

- Dictionary popup inside the YouTube page.
- Vocabulary mining interface in the toolbar popup.
- Settings page.
- User interactions.

## 4. Korean Language Processing

Preferred library: Kiwi.

Repository: https://github.com/bab2min/Kiwi

Use Kiwi for:

- Korean tokenisation.
- Morphological analysis.
- Part-of-speech identification.
- Identifying dictionary forms.
- Analysing conjugated Korean words.

Before implementation, investigate the most suitable browser-compatible integration.

Consider WebAssembly or a lightweight local processing service.

Do not assume the native Kiwi library can execute directly inside a Chrome extension.

Chrome Manifest V3 forbids loading remote code, so any Kiwi build must be bundled with the extension. A short feasibility spike is required before Phase 2 to determine whether bundled Kiwi WebAssembly is practical, what CSP changes it needs, and how large it makes the extension. If it is not practical, present the alternatives and trade-offs before changing the stack.

## 5. Dictionary Integration

Preferred primary dictionary: National Institute of Korean Language (KRDict).

Website: https://krdict.korean.go.kr/

Use its official dictionary API where available.

Requirements:

- Store API credentials outside version-controlled source code.
- Handle API errors.
- Cache dictionary results locally.
- Avoid unnecessary repeated API requests.
- Support multiple definitions.
- Preserve dictionary metadata.

The KRDict API key is entered by the user in the Settings page and stored in `chrome.storage.local`. It must not be committed to Git, injected into the built bundle, or read by the content script. Only the background service worker uses it.

Investigate API registration, authentication, usage restrictions and response formats before implementation.

## 6. Local Storage

Use IndexedDB for persistent application data.

Potential stored information:

- Vocabulary entries.
- Dictionary cache.
- Example sentences.
- Source video information.
- Mining timestamps.
- Synchronisation status.
- User preferences where appropriate.

Use Chrome Storage API for appropriate extension configuration and settings.

IndexedDB access is centralised in the background service worker. Content scripts run in the YouTube page context and must not own extension-origin IndexedDB. Avoid maintaining multiple competing sources of truth.

## 7. Anki Integration

Use AnkiConnect.

Documentation: https://foosoft.net/projects/anki-connect/

Repository: https://github.com/FooSoft/anki-connect

Connect to the local AnkiConnect endpoint, normally:

http://127.0.0.1:8765

Required operations include:

- version
- deckNames
- modelNames
- modelFieldNames
- findNotes
- canAddNotes
- addNote
- addNotes
- updateNoteFields

Implement AnkiConnect as an independent service module.

Requirements:

- Detect connection availability.
- Retrieve available decks.
- Retrieve note types and fields.
- Support field mapping.
- Detect duplicates.
- Support bulk synchronisation.
- Report errors and results.

Do not create a custom Anki add-on.

Anki Desktop and AnkiConnect are external dependencies that must be installed by the user.
### Kimchi Sentence Mining Note Type

The application must integrate with the user's existing Anki note type named:

**Kimchi Sentence Mining**

Use AnkiConnect to retrieve the note type's available fields through `modelFieldNames`.

Expected fields:

- Focus Word
- Sentence
- Definition
- Pronunciation
- Image
- Audio

Do not assume the field names or their ordering without checking AnkiConnect.

Implement configurable field mapping if necessary.

#### Field Population

| Anki Field | Data Source |
|---|---|
| Focus Word | Korean dictionary headword |
| Sentence | Original YouTube subtitle sentence, plus additional saved sentences separated by newlines |
| Definition | English dictionary definition |
| Pronunciation | Dictionary pronunciation |
| Image | Empty until screenshot capture is implemented |
| Audio | Empty until audio capture is implemented |

#### Duplicate Detection

One vocabulary headword may have at most one Anki card. Before creating a note, check whether the headword already has a note in Anki.

Avoid creating duplicate notes. A new sentence for an existing word updates the existing vocabulary record and its Sentence field rather than creating a second card.

#### Template Compatibility

The existing Anki note type controls the visual appearance of the front and back of the card.

The extension is responsible for supplying the correct field values, not recreating the Anki card template.

Do not modify the user's existing Anki templates.

## 8. Application Architecture

Organise functionality into separate modules.

Suggested service responsibilities:

### youtube/

Subtitle detection, extraction and timestamp handling.

### korean/

Tokenisation, morphological analysis and dictionary-form identification.

### dictionary/

KRDict API communication, result processing and caching.

### anki/

AnkiConnect communication, deck retrieval, duplicate detection and note creation.

### storage/

IndexedDB operations and persistent application data.

### Messages

Message payloads are defined in `types/messages.ts`. Keep message handling on the background side and validate incoming payloads rather than trusting their shape.

### Components

Vue components should focus on presentation and user interaction.

Business logic should remain in appropriate services rather than being duplicated across components.

## 9. Testing

Use appropriate automated testing tools.

The Phase 0 setup uses:

- Vitest for unit and component testing.
- Vue Test Utils for component tests.
- jsdom as the test DOM.
- Playwright later, only where browser-level extension testing is useful.

Test important functionality independently. Tests live in `tests/`. Run `npm run test:run` for a single non-watching run and `npm run compile` for type checking.

Prioritise tests for Korean word processing, dictionary lookup, storage and AnkiConnect as those features are added.

## 10. Dependencies and Constraints

- Prefer free and open-source dependencies.
- Avoid unnecessary external APIs.
- Avoid paid infrastructure.
- Do not introduce a cloud backend without approval.
- Do not expose API credentials.
- Maintain Chrome Manifest V3 compatibility.
- Document significant architectural decisions.

## 11. Architecture Flexibility

The technologies above represent the preferred initial stack.

If a specific library is unsuitable or incompatible with browser extension restrictions, explain the problem and propose alternatives before making significant architectural changes.

Reliability and compatibility take priority over strict adherence to a particular library.