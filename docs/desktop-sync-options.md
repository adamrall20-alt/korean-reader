# Desktop sync options

**Decision on 21 November 2026.** Explore Google Drive first. The Firebase prototype has retired. Study data stays local while hosting and backup options are evaluated. The desktop library currently lives in local SQLite and a media folder. The local Chrome bridge delivers mined cards and known-word count snapshots to the desktop app on the same computer.

| Option | What it would do | Main trade-off |
| --- | --- | --- |
| Google Drive folder | Save versioned backups to a folder chosen by the user. Drive copies closed backup files between computers, and Korean Reader restores the chosen snapshot. | Straightforward and portable. Restore is an explicit action and changes on two machines need a merge step. |
| Google Drive API | Sign in with Google, store app-specific manifests and media in Drive, and exchange changes across devices. | Works across different networks without a dedicated Korean Reader server. OAuth onboarding, retry, conflict handling and quota use still need product and engineering work. |
| Website with a hosted backend | Publish an app endpoint for uploading and merging card and review changes. A browser client could use the same account and data later. | Gives the project control of the sync experience, and adds backend hosting, account security and operations. A static site can host downloads but cannot by itself merge private user libraries. |
| Local Wi-Fi | Pair two devices on the same network and exchange updates directly over an authenticated connection. | Avoids cloud storage. Both devices need to be online together and able to see each other on the network. |

## Proposed sequence

1. Build the D6 backup and restore format. Include version metadata, cards and contexts, attachments keyed by hash, schedules, local review and practice history, known-word counts and preferences. Restore validates the archive before writing. Exclude credentials.
2. Let the user choose a backup destination. A folder synced by Drive can carry snapshots between devices. Keep the live SQLite database and its WAL on local storage and let the app make a consistent export.
3. Prototype Google Drive API sync only after confirming the user wants changes on multiple active devices to merge automatically. Give records and review events stable IDs. Upload attachments once by hash. Merge card edits and later deletions deterministically, deduplicate reviews, and order concurrent reviews consistently before deriving a schedule. Validate a two-device offline editing and review scenario before using the real collection.
4. If web access becomes a priority, prototype a private web library with sign-in, card metadata in a database and media in private object storage. Start with upload and restore of backups before adding two-way sync.

Google Drive offers a hidden application data folder scoped to the app. It suits automatic sync, while a normal Drive folder suits backups the user can see and copy. [Google Drive API app data documentation](https://developers.google.com/workspace/drive/api/guides/appdata)

## Free hosting for a private web library

Cloudflare Workers can serve the site and its API, with D1 holding card text, schedules and review events, and R2 holding audio, images and backup packages. D1 includes 5 GB of total storage on Workers Free. R2 Standard includes 10 GB-month and monthly operation allowances, with paid usage above those allowances. R2 requires an active subscription. [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/) · [R2 pricing](https://developers.cloudflare.com/r2/pricing/) · [R2 setup](https://developers.cloudflare.com/r2/get-started/)

Supabase Free is another option for a small personal library. It includes a 500 MB Postgres database, 1 GB of file storage and authentication. Inactive free projects can pause after a week. [Supabase pricing](https://supabase.com/pricing)
