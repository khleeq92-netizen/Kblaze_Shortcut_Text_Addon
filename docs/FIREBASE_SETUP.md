# Firebase setup (optional cloud features)

QuickText Hub is local-first: **everything works without Firebase**. Configure it only if
you want sign-in, automatic backup/sync across devices, cloud share links, the community
marketplace or team workspaces.

QuickText Hub uses its **own** Firebase project/app configuration, a named Firebase app
(`quicktext-hub`) and its own storage namespace, so it never interferes with Jot Hub or any
other extension — even if both point to the same Firebase project.

## 1. Create the project

1. <https://console.firebase.google.com> → **Add project** (e.g. `quicktext-hub`).
2. **Build → Firestore Database → Create database** (production mode, nearest region).
3. **Build → Authentication → Get started → Sign-in method**: enable **Email/Password** and **Google**.

## 2. Register a web app and copy its config

**Project settings → General → Your apps → Web (`</>`)**. Copy the `firebaseConfig`
object. Then either:

* **Runtime (easiest):** Dashboard → **Settings → Cloud & Account → Cloud configuration**,
  paste the object (JSON or the JS snippet) and **Save**; or
* **Build time:** copy `.env.example` to `.env`, fill the `VITE_FIREBASE_*` values, run `npm run build`.

Runtime values override build-time values.

## 3. Stable extension ID (recommended)

Unpacked extensions get an ID derived from their folder path. Pin it so OAuth redirect
URIs keep working:

```bash
npm run generate-key
```

Put the printed `QTH_EXTENSION_KEY=…` line in `.env` and rebuild. The script also prints
the resulting extension ID and redirect URI. (When published to the Chrome Web Store, use
the store's ID instead.)

## 4. Authorized domain

Firebase console → **Authentication → Settings → Authorized domains → Add domain**:
`<extension-id>.chromiumapp.org`.

## 5. Google Sign-In (OAuth client)

Extensions cannot use Firebase's popup flow, so QuickText Hub uses
`chrome.identity.launchWebAuthFlow` and exchanges the Google ID token with Firebase.

1. Google Cloud console (same project) → **APIs & Services → Credentials → Create
   credentials → OAuth client ID → Web application**.
2. **Authorized redirect URIs:** `https://<extension-id>.chromiumapp.org/`
   (shown in Settings → Cloud & Account).
3. Copy the client ID into **Settings → Cloud & Account → Google OAuth client ID**
   (or `VITE_GOOGLE_OAUTH_CLIENT_ID`).
4. If the OAuth client is in a *different* Google Cloud project than Firebase, add it under
   Firebase **Authentication → Sign-in method → Google → Safelist client IDs from external projects**.
5. Configure the OAuth consent screen (app name, support email; add test users while in testing mode).

## 6. Security rules and indexes

Install the Firebase CLI and deploy the rules shipped in `firebase/`:

```bash
npm install -g firebase-tools
```

```bash
cd firebase && firebase login && firebase use --add
```

```bash
firebase deploy --only firestore:rules,firestore:indexes
```

## 7. Marketplace moderators

Create a document `admins/{uid}` (any content, e.g. `{ "name": "Me" }`) in the Firestore
console for each moderator. Moderators see a **Moderation** tab in the Marketplace.

## 8. Verify

Dashboard → Settings → Cloud & Account → create an account or **Continue with Google** →
**Sync now**. The sidebar footer shows the last synchronisation time.

See `FIRESTORE_SCHEMA.md` for the data model.
