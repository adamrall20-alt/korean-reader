# Dictionary Integration — Korean Reader

## Status

Planned for Phase 3. Nothing in this document is implemented yet.

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

1. The content script sends the selected Korean word and its sentence context to the background.
2. The background checks the IndexedDB dictionary cache.
3. If there is no cached result, the background performs morphological analysis to identify candidate dictionary forms.
4. The background calls KRDict with the candidate form.
5. The result is normalised, cached and returned to the content script.
6. The dictionary popup displays the result.

## What the Popup Displays

- Korean dictionary headword.
- Original subtitle form.
- English definitions.
- Part of speech.
- Conjugation information where available.
- Pronunciation.
- Hanja where available.
- Example sentences where available.

## Morphological Analysis

Kiwi is the preferred analyser, but its browser integration must be verified first. See `docs/architecture.md`.

The analyser is responsible for:

- tokenising a subtitle line;
- identifying individual words;
- identifying dictionary forms of conjugated words;
- preserving the original subtitle form for display and mining.

## Caching

- Cache dictionary results in IndexedDB.
- Cache by the normalised lookup key, not only by the surface form.
- Store the original response metadata needed to render definitions and examples.
- Avoid repeated API requests for the same lookup.
- Provide a way to clear the cache from Settings.
- The exact expiry policy remains to be decided. The initial plan is to keep cached entries until the user clears them, with schema versioning for future changes.

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

- Exact KRDict endpoint and response format.
- Whether KRDict returns sufficient information for conjugation and Hanja display.
- Rate limits and request throttling.
- Cache key strategy for homonyms and multiple parts of speech.
