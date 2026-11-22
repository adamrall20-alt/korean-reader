# Technical stack

## Runtime and tooling

| Area | Technology |
| --- | --- |
| Extension | Chrome Manifest V3, WXT and Vite |
| Interface | Vue 3, TypeScript and Tailwind CSS |
| Korean analysis | Kiwi WebAssembly and bundled models |
| Dictionary | KRDict API with local IndexedDB caching |
| Study integration | AnkiConnect API v6 over loopback |
| Persistence | IndexedDB and `chrome.storage.local` |
| Verification | Vitest, Vue Test Utils, jsdom and `vue-tsc` |

## Data ownership

The background service worker owns database access and external requests. Extension pages send typed messages for settings, vocabulary and Anki work. Content scripts use a smaller set of messages for lookup, tokenisation, known words and mining. The KRDict key and optional AnkiConnect key stay in the extension's local settings.

IndexedDB schema version 4 is retained for existing installs. The active stores are `dictionaryCache`, `vocabulary` and `statistics`. Existing profiles may still contain a retired store that the extension no longer uses. The vocabulary status index supplies fast known-headword reads. A known-word transfer file carries a versioned list of headwords with additive import semantics.

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
