# Phase 10 — Accounts and progress sync

Phase 10 prototype implemented for a dedicated Chrome test build. Local verification uses the Firestore emulator. Live Firebase sign-in and the two-Chrome-profile test are pending.

## Agreed product behaviour

- Offer optional Google sign-in inside the Chrome extension. Show account progress in the existing Statistics tab. Guest use remains available.
- Sync the known-word list and its graph. Count each distinct Korean Reader headword once across devices. Keep mined definitions, sentences, screenshots, audio, dictionary cache, preferences and credentials on the device. The Anki panel continues to show live figures from the Anki installation connected to that computer.
- At account creation, import the first browser's known words, existing graph baseline and daily totals. If the browser has no graph, use its current count as the starting baseline. Merge existing known words automatically when another browser first connects. Credit newly added words from that merge on the connection day. Preserve the imported historical dates.
- Use the first browser's time zone for new account graph dates. Credit accepted offline edits to the day they were made, and recalculate later totals when those edits arrive. The imported graph represents the history of the first browser. Later browser merges contribute from their connection date.
- Apply edits locally immediately, send changes automatically in batches, and check for updates when the reader or Statistics opens. If the account has a newer revision of the same word, keep the account change. Sync unrelated offline edits normally.
- Signing out hides the account's list and graph and restores separate guest progress. Pending edits belong to the account that made them and can resume syncing when that account signs back in.
- Deleting a local mined entry keeps its shared Known status. Use a separate **Mark unknown** action to remove the word from the account list and update the graph.
- Launch with open registration on Firebase Spark at zero hosting cost. Enforce a daily limit on new cloud-sync registrations and provide a manual registration pause. Existing accounts can keep syncing while capacity is available. If sync becomes unavailable, retain the local account copy and queued edits, show the last successful sync, and retry when capacity returns. New users can continue as guests when registration is closed.

## Proposed implementation

Use Firebase Authentication with Google sign-in and Firestore for account progress. Prototype the sign-in flow in a Manifest V3 build with a stable extension ID. Keep session handling, account storage and network access in the extension background layer. Firestore Security Rules must bind account reads and writes to the authenticated user ID and protect the registration controls. On Spark, gate creation of the Firestore sync profile. Google authentication can still succeed while new sync profiles are paused.

Keep each account's cached word state, graph and pending edits separate from guest data in IndexedDB. Give each synced word a revision and retain a removal marker so a stale offline edit cannot restore a removed word. Persist pending changes across browser restarts and make retries safe. Record whether each browser has already merged into the account so signing back in does not repeat a first-time import.

Prototype grouping words into bounded Firestore documents. Compare the cost of a large first import and normal updates, and check the maximum document size. Fetch only changed groups during routine sync. Prototype transactional updates and test revision conflicts at the word level within a group.

Preserve the first browser's imported history and track accepted post-registration changes by their effective account date. Use that record to update the affected daily totals after a delayed sync. Test clock skew, same-day changes and retries, and determine how far back a delayed edit can revise the graph at the boundary of the imported history.

Use Firestore rules and transactions to enforce the registration limit and pause. Choose the cap after measuring the read and write cost of a representative 13,000-word import and the cost of ongoing sync. Reserve capacity for existing accounts. Provide a clear sync state for pending edits, paused registration and service unavailability.

References: [Firebase sign-in for Chrome extensions](https://firebase.google.com/docs/auth/web/chrome-extension), [Firebase Spark](https://firebase.google.com/docs/projects/billing/firebase-pricing-plans), [Firestore quotas](https://firebase.google.com/docs/firestore/quotas), and [Firestore transactions](https://firebase.google.com/docs/firestore/manage-data/transactions).

## Open decisions

- Cloud account deletion and what the user can retain. The recommendation is to offer an export of known words, the baseline and daily totals, then delete cloud data and restore guest progress. Alternatives discussed were offering to copy account progress into guest mode, or restoring guest progress immediately after deletion. Export restoration is outside the proposal.
- The daily registration cap and document grouping are pending measurements.
- The prototype uses explicit import and sync controls in Statistics. Automatic vocabulary integration, release registration controls and account deletion are future Phase 10 milestones.

## Verification before launch

- Verify sign-in, guest use, sign-out and account switching in Chrome. Verify account isolation in Firestore Security Rules tests.
- Test the first browser's graph, a large initial import, overlapping words, repeated sign-ins and concurrent activity from two browsers.
- Test offline edits, same-word conflicts, backdated graph changes, time-zone boundaries, failures and retries. Confirm that local mining, **Mark unknown** and Anki still behave as described.
- Verify the daily cap and manual pause, including that existing users can still sync and new users can continue as guests. Test recovery from service or quota failures and measure launch capacity.

## Prototype implementation

[Setup and live test instructions](account-sync-setup.md)

The test build uses the Chrome Identity API to obtain a Google token, then exchanges it for a Firebase session in the extension background worker. The worker stores that session in IndexedDB and keeps per-account snapshots and pending edits in extension-local storage. The Statistics panel imports the current profile on request, checks the cloud when opened, and attempts to send test edits immediately. **Sync now** flushes the queue and refreshes the account after a network interruption.

The first import writes a profile with the original history, a per-installation import marker and up to 64 word group documents in one Firestore transaction. Later imports add words with no account record. A tombstone preserves the revision of words marked unknown. A word edit and its effect on the graph commit in the same transaction. Account time determines which day receives the change. Dates before the first import are clamped to its day, and future client timestamps are clamped to the time of the sync attempt.

An initial import using all groups can write up to 66 documents. A single edit can write two. A refresh reads the account's groups, progress and installation markers. These are implementation counts. Actual Spark usage and a daily registration cap require the live trial. The prototype uses a per-UID tester allowlist, a manual sync control and a single account snapshot per device. Incremental downloads and automatic retry scheduling are future work.
