# Korean Reader Desktop architecture

**Status:** D2 is verified by the owner. D3 practice, desktop Stats, offline Anki import and same-computer Chrome delivery are implemented. See [the desktop plan](../DESKTOP_APP_PLAN.md) for remaining acceptance checks.

## 1. Traced Chrome Extension Data & Mining Path

- **Vocabulary export (`korean-reader-vocabulary.json`):** Exported directly from `components/VocabularyManager.vue` (`exportVocabulary()`) as a JSON array of `VocabularyEntry` records read from IndexedDB via `list-vocabulary`.
- **Entry & context fields (`types/vocabulary.ts`, `types/messages.ts`):**
  - `VocabularyEntry` extends `DictionaryEntry` (`headword`, `originalForm`, `frequencyRank`, `koreanDefinitions`, `definitions`, `partOfSpeech`, `pronunciation`, `hanja`, `conjugations`, `examples`).
  - Adds `contexts: Array<VocabularyContext & { minedAt: string }>`, `machineDefinitions?`, `ankiNoteId?`, `ankiSyncedAt?`, `ankiFocusField?`, `status: 'known' | 'unknown'`, `createdAt`, `updatedAt`.
  - Each `VocabularyContext` stores `sentence`, `originalForm`, `sourceUrl`, `sourceTitle`, `timestamp?`, `image?` (JPEG data URL), `audio?` (audio data URL).
- **Mining write path (`services/storage/vocabulary.ts`, `services/storage/vocabulary-messages.ts`):**
  - Headwords are normalised with `headword.trim().normalize('NFC')`.
  - `mineWord()` deduplicates contexts by `(sentence, sourceUrl)` (`sameVocabularyContext`). If an existing context lacks audio and a new save includes audio, it updates audio in place (`audio-added`); otherwise it appends the new context.
  - Known-only words have `contexts: []` and must be skipped when creating study cards on desktop.

## 2. Framework & Runtime Evaluation

| Area | Recommendation | Rationale |
| --- | --- | --- |
| **Desktop shell** | **Electron 45** | Reuses Vue 3, TypeScript, Tailwind CSS v4, Vite, and `types/vocabulary.ts` directly. Built-in Chromium guarantees reliable Korean font rendering and HTML5 audio/image playback offline. |
| **Structured storage** | **SQLite via Node's built-in `node:sqlite`** | Verified available in Electron 45's bundled Node runtime. Supports synchronous transactions (atomic review log + schedule update) and schema migrations with **zero native C++ addon compilation** across macOS arm64, macOS x64, and Windows x64. |
| **Media storage** | **Managed local files** | Store images and audio clips as content-addressed files under `app.getPath('userData')/media/` and store relative paths + MIME types in SQLite. Keeps database queries fast and backups portable. |
| **SRS scheduler** | **`ts-fsrs` v6** | Pure TypeScript FSRS implementation; verified in both Vitest and Electron main process with deterministic initial intervals (`Again`, `Hard`, `Good`, `Easy`). |

## 3. SQLite schema

- `schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)`
- `cards (id TEXT PRIMARY KEY, headword TEXT UNIQUE NOT NULL, pronunciation TEXT, part_of_speech TEXT, frequency_rank INTEGER, definitions_json TEXT NOT NULL, korean_definitions_json TEXT NOT NULL, preferred_context_id TEXT, anki_note_id INTEGER, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`
- `contexts (id TEXT PRIMARY KEY, card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE, sentence TEXT NOT NULL, original_form TEXT NOT NULL, source_url TEXT NOT NULL, source_title TEXT NOT NULL, timestamp_sec REAL, image_asset_id TEXT, audio_asset_id TEXT, mined_at TEXT NOT NULL, UNIQUE(card_id, sentence, source_url))`
- `media_assets (id TEXT PRIMARY KEY, sha256 TEXT UNIQUE NOT NULL, mime_type TEXT NOT NULL, rel_path TEXT NOT NULL, byte_size INTEGER NOT NULL, created_at TEXT NOT NULL)`
- `schedules (card_id TEXT PRIMARY KEY REFERENCES cards(id) ON DELETE CASCADE, state INTEGER NOT NULL, due_at TEXT NOT NULL, stability REAL NOT NULL, difficulty REAL NOT NULL, elapsed_days INTEGER NOT NULL, scheduled_days INTEGER NOT NULL, reps INTEGER NOT NULL, lapses INTEGER NOT NULL, learning_steps INTEGER NOT NULL DEFAULT 0, last_review_at TEXT)`
- `review_logs (id TEXT PRIMARY KEY, card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE, rating INTEGER NOT NULL, state INTEGER NOT NULL, due_at TEXT NOT NULL, reviewed_at TEXT NOT NULL, prev_schedule_json TEXT NOT NULL, duration_ms INTEGER)`
- `practice_results (id TEXT PRIMARY KEY, card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE, question_type TEXT NOT NULL, correct INTEGER NOT NULL, answered_at TEXT NOT NULL)`
- `settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL)`
- `known_word_history (day TEXT PRIMARY KEY, at INTEGER NOT NULL, count INTEGER NOT NULL)` stores Chrome snapshots. Migration 5 adds review timing and archives stats aggregates when a study card is deleted. Undo removes the underlying review event and its time from stats.

## 4. IPC & Security Boundary

- Renderer runs with `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, and a strict Content Security Policy.
- Filesystem access, SQLite queries, and `shell.openExternal` remain exclusively in `desktop/src/main/`.
- `desktop/src/main/preload.ts` exposes only typed app actions on `window.koreanReaderDesktop` (defined in `desktop/src/shared/api.ts`).
- External URLs are validated (`http:` / `https:` only) in the main process before opening in the default browser.

## 5. Build Separation & Release Targets

- Desktop code lives in `desktop/` and compiles to `.output/desktop/`, with a separate WXT build for the extension.
- Separate commands: `npm run desktop:build`, `npm run desktop:start`, `npm run desktop:compile`, `npm run desktop:test`.
- **Target platforms:** Primary verification is on the owner's Apple-silicon Mac (`darwin/arm64`). Packaging/installer tooling (`electron-builder` for signed/notarised `.dmg` on macOS, `.exe`/NSIS on Windows) will be added in Phase D6/D7 after confirming Intel Mac (`x64`) and Windows (`x64`) support scope.

## 6. Practice, statistics and file import

- The main process holds the active quiz and validates its answer IDs and indices. Each answered question inserts a `practice_results` row. A repeated submission for the same question returns its recorded feedback. Review queues and schedules reuse the same local FSRS engine for flashcards.
- Question selection favours recent contexts and cards with lapses or hard ratings. Meaning questions use one saved gloss. Sentence completion uses a unique full surface form and shows the source headword. Compatible distractors come from the same glossary language and prefer a matching part of speech. Lexical filters reject repeated and overlapping glosses. Real-library distractor quality still needs owner review.
- Review time measures focused time on a card, capped at two minutes per rating. Earlier local reviews count toward review totals even when they have no timing. Import preserves a card's Anki scheduling state where available. Stats uses events recorded in Korean Reader.
- The local HTTP bridge is bound to `127.0.0.1:17421`. Chrome sends cards to `/import` and sends only known-word count snapshots to `/known-history`. Desktop merges snapshots by local day, keeping the newest point for each day. Practice grades and SRS ratings leave the Chrome Known vocabulary alone.
- The package importer reads Anki SQLite in a temporary directory. It resolves recognised note fields by their ordinals and reads numbered ZIP entries through the package media index. Media goes through the existing content-addressed store. See [Anki import](anki-integration.md) and [desktop sync options](desktop-sync-options.md).
