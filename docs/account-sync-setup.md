# Phase 10 prototype setup

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

## Test in two Chrome profiles

- Use disposable profiles for test data. The prototype's stable ID gives it its own Chrome storage. For real existing test vocabulary, seed it in this build before importing. A fresh install can import an empty baseline.
- In the first profile, select **Import this profile’s known words**. Add a test word through **Mark known**.
- In a second profile, load the same build and sign in to the same Google account. **Sync now** should show the same word count and graph. Repeating an import in the same profile should not increase the count.
- For an offline conflict check, open Statistics in both profiles with the same starting count. Disconnect the first profile and mark a word unknown. Restart that profile while offline and check the pending count. In the second profile, mark that same word unknown, then known again. Reconnect the first profile and click **Sync now**. The newer account revision should win and the pending count should return to zero.
- Sign out and confirm that Statistics returns to the local graph. The regular reader and mining workflow still uses local progress in this milestone.

## Run automated checks

```sh
npm run compile
npm run build
~/.local/bin/firebase emulators:exec --only firestore --project demo-korean-reader 'npm run test:run'
```

Use Java 21 or later for the Firestore emulator. The emulator test uses synthetic data and does not write to the live project.
