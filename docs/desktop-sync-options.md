# Desktop sync design

On 22 November 2026, the owner chose direct Wi-Fi sync for paired desktop apps. Both apps keep their SQLite library and managed media locally. The devices must be awake and reachable on the same network during a sync. Each can be used independently between syncs.

## Pairing and transfer

1. On both computers open **Settings → Sync over Wi-Fi → Find nearby devices**. Select the other computer on either one and compare the six digits on both screens. Choose **Codes match** on both to approve the pair.
2. Each installation remembers one paired device. With **Sync automatically** enabled on both devices, the app syncs immediately whenever a change occurs (reviews, undos, imports, deletions, practice answers, or Chrome deliveries) and also checks roughly every eight seconds while both are running on the same local network. **Sync now** is available if you turn automatic syncing off. **Forget device** removes permission to access this library.
3. Each device sends a versioned library manifest on a transfer. Audio and screenshots move separately and only when missing on the receiving device. A failed transfer can leave verified files cached for the next attempt. Each device commits the metadata merge in a database transaction.
4. Discovery uses IPv4 broadcast on UDP port 17422. The network must allow devices to reach each other. Guest networks can isolate clients and block discovery. Pairing and transfer are separate from Chrome's local link code and from the D6 portable backup and restore.

## Cards and reviews

- Use the normalized headword to match independently created cards. Merge unique definitions and sentences, retaining attachments for those contexts. Use the latest explicit edit for single-value fields with a stable tie-break for equal revisions. Map contexts, media, and review records to the merged card.
- Deduplicate reviews by stable event ID. Keep both valid ratings when the same card is reviewed on two devices. Use the schedule saved by the most recent valid review, ordered by review time with a stable tie-break. Preserve the imported schedule baseline for cards without a valid local review.
- Retain explicit records of deletes and review undos. An undone review leaves active history and its schedule stops taking priority. If no valid review remains, use the pre-review baseline. Ensure stale peers cannot restore deleted records.

## Known words

- Desktop stores individual normalized headwords and their Known status. On first link, import the existing Known list from each Chrome profile and combine those lists with the desktop library's Known list. Keep Known status separate from whether a study card exists.
- On each computer, select **Show Chrome link code** in Desktop Settings and paste the code into **Korean Reader Extension Settings → Storage → Link Known words to Desktop**. A link code authorizes that local profile to exchange Known statuses. **Reset Chrome links** revokes the current code.
- Chrome reads and caches Known statuses over the existing same-computer bridge. Highlighting and Known actions continue when Desktop is closed. Chrome saves offline Known and unmark actions in a persistent queue, exchanges them on reconnect or the next one-minute check, and refreshes the popup count and subtitle highlighting.
- Sync Known changes between desktops as explicit per-word revisions, including unmarks. Use a consistent tie-break for concurrent edits. Preserve existing daily count snapshots as historical data and start recording from the merged list once the migration runs. Separate daily totals from different Chrome profiles cannot reconstruct a historical combined count.

## Acceptance checks

Test both directions on two populated libraries with overlapping headwords. Cover discovery, matching and declined pairing, app restart, automatic and manual sync, forgetting a device, missing media, interrupted transfers, offline review of the same card, undo, deletion, and offline Known edits in both Chrome profiles. Verify that imported scheduling state survives, the merged due dates agree, and synced Known words update subtitle highlighting.

## Previously evaluated web hosting

Cloudflare Workers can serve the site and its API, with D1 holding card text, schedules and review events, and R2 holding audio, images and backup packages. D1 includes 5 GB of total storage on Workers Free. R2 Standard includes 10 GB-month and monthly operation allowances, with paid usage above those allowances. R2 requires an active subscription. [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/) · [R2 pricing](https://developers.cloudflare.com/r2/pricing/) · [R2 setup](https://developers.cloudflare.com/r2/get-started/)

Supabase Free is another option for a small personal library. It includes a 500 MB Postgres database, 1 GB of file storage and authentication. Inactive free projects can pause after a week. [Supabase pricing](https://supabase.com/pricing)
