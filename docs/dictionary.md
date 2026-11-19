# Dictionary Integration — Korean Reader

## Status

Dictionary lookup, popup functionality, dictionary-form matching and caching are implemented. Vocabulary mining saves selected definition(s) with the subtitle context. Definition selection was added in Phase 8; its live verification remains pending.

## Source

Preferred dictionary: National Institute of Korean Language (KRDict).

- Website: https://krdict.korean.go.kr/
- Use the official API where available.
- Investigate registration, authentication, rate limits and response formats before implementation.

## API Key

The user has obtained a KRDict API key.

- The key is entered on the Settings page.
- It is stored in `chrome.storage.local`.
- Only the background service worker reads it.
- The content script never receives it.
- The key must never be committed to Git, written into source code, or injected into the built bundle.
- `.env` files are gitignored, but the preferred storage location is still extension settings rather than a build-time environment variable.

## Lookup Flow

1. The content script sends the selected Korean word and Kiwi morphemes to the background.
2. The background reads the locally stored KRDict API key.
3. The background builds normalized lookup candidates, preferring the Kiwi dictionary form for predicates. When Kiwi identifies a noun and the copula 이다 in one subtitle word, the background checks their local known status. If 이다 is known and the noun is still unknown, it searches for the noun first. The original subtitle form is kept, and the red underline remains until both headwords are known.
4. It checks IndexedDB for the resolved entry for that candidate list, then makes exact headword searches as needed.
5. For a matching search result with a target code, it requests English translations, pronunciation, conjugations, Hanja and examples from the entry endpoint. Search definitions remain usable if the details request fails.
6. The worker normalizes the XML, caches the resolved entry and returns it to the popup.

## What the Popup Displays

- Korean dictionary headword.
- Original subtitle form.
- Up to three English definitions or short English glosses formatted as `gloss: definition` (`trans_word: trans_dfn`) when both are returned by KRDict, falling back to whichever is present. Korean definitions are shown when KRDict provides no English.
- **Translate to English** uses the desktop Chrome Translator API for Korean definitions when exposed by the browser. The first request may download a language pack. The popup labels the local translation separately and retains the source definition.
- Part of speech.
- Conjugation information where available.
- Pronunciation.
- Hanja where available.
- Example sentences where available.

Once a lookup returns an entry, **Known** saves its dictionary headword locally. The selected subtitle form remains visible in the popup. Subtitle underlines use Kiwi's morphology to match known headwords, so 여러분들의 can match 여러분 through the plural suffix 들 and the particle 의.

## Morphological Analysis

Kiwi runs as bundled WebAssembly in the background worker. See `docs/architecture.md`.

The analyser is responsible for:

- tokenising a subtitle line;
- identifying individual words;
- identifying dictionary forms of conjugated words;
- preserving the original subtitle form for display and mining.

## Caching

- Cache dictionary results in IndexedDB.
- Cache dictionary results in IndexedDB using versioned headword (`headword-v2`) and ordered, normalized candidate-list (`exact-v5`) keys so different analyses of the same spelling resolve independently and stale cache versions (`headword-v1`, `exact-v4`) refresh automatically. Older cache keys are ignored and can be removed from Settings.
- Store the original response metadata needed to render definitions and examples.
- Avoid repeated API requests for the same lookup.
- Provide a way to clear the cache from Settings.
- Cached entries remain until the user clears them, with schema versioning for future changes.

## Error Handling

Handle at least:

- missing API key;
- invalid API key;
- network failure;
- rate limiting;
- empty results;
- malformed API responses;
- morphological analysis failure.

Show a useful message in the dictionary popup rather than failing silently.

## Security

- Keep the API key in the background.
- Do not include credentials in logs.
- Do not send the user's vocabulary to KRDict; only send the lookup term required for the dictionary request.
- Do not expose the key to YouTube page scripts.

## Open Questions

- Rate limits and request throttling.
- Context-based selection among homonyms with the same headword.

## Phase 12 — Kimchi Reader Format (STDICT Fallback Deferred)

Phase 12.1 aligns KRDict dictionary output with Kimchi Reader's definition formatting using the user's existing KRDict key:

- **KRDict formatting (implemented):** `services/dictionary/krdict.ts` preserves `<![CDATA[...]]>` text cleanly and formats English translations as `trans_word: trans_dfn` when both `<trans_word>` and `<trans_dfn>` are present (omitting duplicate identical values case-insensitively and falling back to whichever tag exists). Both `/search` and `/view` entry lookups use this formatting, and cache keys bumped to `headword-v2` / `exact-v5` so older cached entries refresh automatically.
- **STDICT fallback (deferred):** Integrating the National Institute of Korean Language's **STDICT** (표준국어대사전, `https://stdict.korean.go.kr/`) Open API (Task 12.3) was deferred at the product owner's request due to registration issues obtaining an STDICT API key. No additional API key is required for the current dictionary setup.
