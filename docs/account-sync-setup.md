# Phase 10 account sync setup

Use the existing Spark project `korean-reader-95722` and its default Firestore database.

1. In [Google Auth Platform](https://console.cloud.google.com/auth/clients?project=korean-reader-95722), create a **Chrome Extension** OAuth client. Use item ID `bekcfaadoidpkpadnalmbgmlbkbgijbe`. If Google prompts you to configure the OAuth audience first, use **External** for a personal Google account and add your testing account under **Test users** while the app is in testing.
2. In [Firebase Authentication](https://console.firebase.google.com/project/korean-reader-95722/authentication), enable the **Google** provider. Under **Settings → Authorized domains**, add `chrome-extension://bekcfaadoidpkpadnalmbgmlbkbgijbe`.
3. If the local configuration has already been created, open `.env.account-test.local` and fill in `WXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID` with the client ID ending in `.apps.googleusercontent.com`. On a fresh checkout, copy `.env.example` to `.env.account-test.local` and fill in the other four fields from the Firebase Web app configuration. Keep this file out of Git.
4. From the Korean Reader folder, sign in to the Firebase CLI with the Google account that owns the test project, install the Firestore rules and index exemptions, then make a test build.

   ```sh
   ~/.local/bin/firebase login
   ~/.local/bin/firebase deploy --only firestore:rules,firestore:indexes --project korean-reader-95722
   npm run build -- --mode account-test
   ```

   This deploy replaces the Firestore rules for the default database. The supplied rules cover the Korean Reader prototype and deny other client access.
5. In a Chrome profile signed into your test Google account, open `chrome://extensions`, enable **Developer mode**, and **Load unpacked** from `.output/chrome-mv3-account-test`. Open Korean Reader **Statistics → Sign in with Google**. First sign-in may show a Firestore permission message while the account waits for approval.
6. In **Firebase Authentication → Users**, copy the new user's **UID**. In **Firestore → Data**, create the collection `phase10Testers` and a document whose **Document ID** exactly matches the UID. Add a boolean field named `enabled` with value `true`. Delete that document to revoke test access. Click **Sync now** in Korean Reader.

## Enable sync in the existing extension

The existing unpacked installation keeps its ID and data when rebuilt and reloaded from the same absolute folder. Keep the extension installed and use **Reload** in `chrome://extensions`.

1. Copy the existing extension ID from `chrome://extensions`. For Adam’s current checkout and install folder it is `pfkhppacgbbpdgnlpelmmifiacjlflfl`.
2. In the same Google Cloud project, create a **Chrome Extension** OAuth client for this item ID. Add `chrome-extension://` followed by that ID to Firebase Authentication’s **Authorized domains**. The test build has its own OAuth client.
3. Copy `.env.example` to `.env.production.local`. Use the same Firebase web configuration as in the test build and fill in the OAuth client ID for the existing extension.
4. Run `npm run build` from the original checkout and reload the existing `.output/chrome-mv3` extension. If Chrome switches it off for the new permissions, turn it back on and accept the prompt. Open **Statistics → Sign in with Google**. Existing Firestore tester approval applies to the same Google account.
5. Use **Import this profile’s known words** to merge the original installation’s known words. If that Google account already has cloud progress from the test build, the import adds new words to that history from the merge date. If the account has no cloud progress, the first import seeds it with the original installation’s history. Full mined entries and settings stay in the existing installation.
6. Verify the original installation’s vocabulary, sign-in and sync. After that check, you can disable the separate **Korean Reader (Account Test)** extension.

## Test in two Chrome profiles

- Use disposable profiles for test data. The prototype's stable ID gives it its own Chrome storage. For real existing test vocabulary, seed it in this build before importing. A fresh install can import an empty baseline.
- In the first profile, seed local vocabulary using the regular reader before selecting **Import this profile’s known words**.
- In a second profile, load the same build and sign in to the same Google account. **Sync now** should show the same word count and graph. Repeating an import in the same profile should not increase the count.
- To check offline feedback, disconnect a signed-in profile and click **Sync now**. Confirm that the last successful sync and cached progress remain visible. Reconnect and click **Sync now** again. Use the automated Firestore emulator checks below for word-level conflicts.
- Sign out and confirm that Statistics returns to the local graph. The regular reader and mining workflow still uses local progress in this milestone.

## Run automated checks

```sh
npm run compile
npm run build
~/.local/bin/firebase emulators:exec --only firestore --project demo-korean-reader 'npm run test:run'
```

Use Java 21 or later for the Firestore emulator. The emulator test uses synthetic data and does not write to the live project.
