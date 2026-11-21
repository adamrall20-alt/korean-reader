# Korean Reader — interview questions

Use these questions to explain the product, its design choices, and what you learned while building it.

## Product and user experience

1. What problem does Korean Reader solve for someone learning Korean through YouTube?
2. Why does clicking a subtitle word open a definition without automatically saving it?
3. How does the extension keep vocabulary mining and desktop study under the user's control?
4. Why does the interface preserve YouTube's native captions as a fallback?
5. How do the red underlines help distinguish known words from new vocabulary?

## Architecture and technology

6. What are the responsibilities of the content script, background service worker, popup and Settings page?
7. Why is the background worker the single owner of IndexedDB and external requests?
8. Why was Kiwi chosen for Korean analysis, and what trade-off does the bundled WebAssembly model create?
9. What data belongs in IndexedDB, and what belongs in `chrome.storage.local`?
10. How does Manifest V3 affect the design of the background worker and runtime code?
11. Why use a Shadow DOM for the subtitle interface inside YouTube?
12. How do typed messages help separate the page interface from extension services?

## Data, integrations and reliability

13. How does a clicked conjugated word become a dictionary lookup candidate?
14. How does the extension protect the KRDict API key from the YouTube page?
15. How does duplicate detection enforce one desktop schedule per dictionary headword?
16. How are additional sentences and optional media handled when syncing an existing note?
17. What happens when captions, dictionary results, audio capture, local storage or the desktop bridge are unavailable?
18. What is the difference between fixture-based verification and a live user check in this project?
19. Which remaining Phase 8 checks would you prioritize, and why?

## Reflection and next steps

20. What was the hardest browser-specific behavior to accommodate?
21. Which architecture decision would you revisit if the extension supported more browsers?
22. How would you measure whether the extension makes vocabulary review more effective?
23. Which future enhancement would add the most value without making the workflow harder to use?

