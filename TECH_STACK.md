# Technical stack

## Runtime and tooling

| Area | Technology |
| --- | --- |
| Extension | Chrome Manifest V3, WXT and Vite |
| Interface | Vue 3, TypeScript and Tailwind CSS |
| Korean analysis | Kiwi WebAssembly and bundled models |
| Dictionary | KRDict API with local caching and an importable JMdict index in IndexedDB |
| Japanese analysis | Browser word segmentation and bounded JMdict-based inflection matching |
| Study integration | AnkiConnect API v6 over loopback |
| Persistence | IndexedDB and `chrome.storage.local` |
| Verification | Vitest, Vue Test Utils, jsdom and `vue-tsc` |

## Data ownership

The background service worker owns database access and external requests. Extension pages send typed messages for settings, vocabulary and Anki work. Content scripts use a smaller set of messages for lookup, tokenisation, known words and mining. The KRDict key and optional AnkiConnect key stay in the extension's local settings.

IndexedDB schema version 5 adds `japaneseVocabulary` and `japaneseStatistics`. The upgrade leaves `dictionaryCache`, Korean `vocabulary` and Korean `statistics` in place. Existing profiles may still contain a retired store. Both vocabulary stores have a status index. Korean records use the headword key, and Japanese records use a dictionary entry and reading identifier. The current known-word transfer format carries a versioned list of Korean headwords with additive import semantics.

The browser manifest grants storage, active-tab access, scripting and host access for KRDict and localhost AnkiConnect. No remote code or font service runs in the extension.

## Developer commands

| Command | Result |
| --- | --- |
| `npm ci` | Install lockfile dependencies and prepare WXT types |
| `npm run dev` | Run the extension development build |
| `npm run compile` | Check TypeScript and Vue types |
| `npm run test:run` | Run the automated test suite |
| `npm run build` | Build the production extension |
| `npm run zip` | Build and package the Chrome ZIP |

See [Architecture](docs/architecture.md) for the module layout.
