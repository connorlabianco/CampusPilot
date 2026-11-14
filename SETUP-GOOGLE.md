# Setting up "Sign in with Google" (sync)

Sign-in only asks for one permission: a private app folder in the student's own Google Drive
(`drive.appdata`). Google classes that as **non-sensitive**, so it needs no Google review and has no user cap.
Google Calendar is a separate, optional permission. Leave it off until you're ready to submit it for review
(see "Later: Google Calendar" at the end).

What you need: a Google account, about 20 minutes, and somewhere to host a privacy policy page
(a free GitHub Pages site works; `docs/privacy.html` in this folder is ready to use).

---

## 1. Give the extension a permanent ID

Google ties the sign-in to your extension's ID, so it must not change.

- **For testing on your own computer:** load the folder unpacked (`chrome://extensions` → Developer mode →
  Load unpacked) and copy the **ID** shown on its card. It stays the same as long as you load the same folder.
- **For other computers and for publishing:** open the
  [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole) (one-time $5 registration),
  click **New item**, and upload the zip. Don't publish yet. Copy the item ID. On the item's **Package** tab,
  click **View public key**, copy the key (the long text between the BEGIN/END lines, as one line), and add it to
  `manifest.json` as `"key": "<that text>",`. Now every unpacked copy has the same ID as the store item.

## 2. Publish the privacy policy

1. The privacy page (`docs/privacy.html`) lists connoralabianco@gmail.com for questions; change it there if you use a different address.
2. Create a GitHub repository (it can contain just the `docs` folder), then **Settings → Pages → Deploy from a
   branch → main / docs**.
3. Your policy is at `https://<your-username>.github.io/<repo>/privacy.html`. Use
   `https://<your-username>.github.io/<repo>/` as the home page.

## 3. Create the Google Cloud project

1. Go to the [Google Cloud console](https://console.cloud.google.com/) → project picker → **New project** →
   name it "CampusPilot".
2. **APIs & Services → Library** → search **Google Drive API** → **Enable**.

## 4. Set up the consent screen (Google Auth Platform)

1. **APIs & Services → OAuth consent screen** (also called **Google Auth Platform**) → **Get started**.
2. **App information:** App name "CampusPilot", your support email.
3. **Audience:** **External**.
4. **Contact information:** your email. Agree to the policy and **Create**.
5. **Branding:** add the home page and privacy policy links from step 2. Under **Authorized domains**, add
   `<your-username>.github.io`. Skip the logo for now; adding one triggers a brand review.
6. **Data access → Add or remove scopes:** add `https://www.googleapis.com/auth/drive.appdata`
   ("View and manage the app's own configuration data in your Google Drive"). **Don't** add Calendar scopes yet.
7. **Audience → Publish app** → confirm, so it's **In production**. With only non-sensitive permissions this
   doesn't need a review. (While it's in "Testing", only the test users you list can sign in, and their sign-in
   expires after 7 days.)

## 5. Create the sign-in ID

1. **APIs & Services → Credentials → Create credentials → OAuth client ID**.
2. Application type: **Chrome Extension**. Item ID: the extension ID from step 1.
3. Copy the **Client ID** (ends in `.apps.googleusercontent.com`).
4. In `manifest.json`, replace `YOUR_GOOGLE_OAUTH_CLIENT_ID.apps.googleusercontent.com` with it.
5. Reload the extension at `chrome://extensions`.

A Chrome Extension client ID isn't a secret (there's no client secret). It only works for your extension's ID,
so it's fine to have in the code.

## 6. Try it

1. Make sure Chrome itself is signed in to a Google account (top-right profile icon). Chrome sync doesn't need
   to be on.
2. CampusPilot → **Settings → Account & sync → Sign in with Google**.
3. On a second computer (same Chrome Google account, same extension ID): sign in there too, then press
   **Sync now** on both.

To remove everything CampusPilot stored in a Drive: Google Drive → Settings (gear) → **Manage apps** →
CampusPilot → **Options → Delete hidden app data**.

---

## Later: Google Calendar (needs Google's review)

Calendar permissions are **sensitive**. Until Google approves them, people see an "unverified app" warning,
and only 100 people can ever use them (a lifetime cap). CampusPilot works without them: plans and deadlines can
be added to any calendar as a file, and busy times come from the student's private calendar link.

When you want one-click Calendar:
1. **Library → Google Calendar API → Enable**.
2. **Data access:** add `.../auth/calendar.events` and `.../auth/calendar.readonly`.
3. **Verification center → Submit for verification.** Explain why each permission is needed: reading busy
   times to plan study sessions around them, and adding study sessions and deadlines the student chooses to add.
   Google usually asks for a short screen recording that shows sign-in, the consent screen, and the feature that
   uses each permission. It's free, takes about 10 business days, and may come back with questions.

Sign-in and sync keep working the whole time; Calendar is asked for only when a student turns it on.

## Later: free Gemini with "Sign in with Google" (needs Google's review)

The setup sheet's **Sign in with Google** makes each student a free Gemini key in their own Google account
(a "CampusPilot" project, the Gemini API turned on, a key named "campuspilot" limited to Gemini). It uses the
`cloud-platform` permission once and hands it back. Students can always use Google's key page or their own AI
instead, so CampusPilot works while this is in review.

1. **Library → Enable** these in *your* CampusPilot project (the calls are counted there): **Cloud Resource
   Manager API**, **Service Usage API**, **API Keys API**.
2. **Clients → Create client → Web application**, named "CampusPilot account picker". Under **Authorized redirect
   URIs** add `https://<your extension ID>.chromiumapp.org/google`. Put its client ID in `lib/oauthcfg.js`.
   (This client lets students pick a personal Google account even when Chrome is signed in to their school one.
   Without it, CampusPilot falls back to Chrome's sign-in, which always uses the Chrome profile's account.)
3. **Data access:** add `.../auth/cloud-platform`.
4. **Verification center → Submit for verification.** Explain that it's used once, to create one project, turn on
   one API and create one API key for the student's own use, and that the access is revoked right after. Record
   the setup sheet (the "Before you sign in" screen, the consent screen, the progress steps). Until it's approved,
   students see Google's "unverified app" screen (the setup sheet tells them how to continue) and only 100 people
   can ever use it.

## Chrome Web Store listing notes

- **Single purpose:** "Helps students study from their own Canvas courses: deadlines, practice quizzes, grades
  and study plans."
- **Permission reasons:**
  - `storage`, `unlimitedStorage`: saving courses, lectures and practice progress on the computer.
  - `identity`: optional Google sign-in for syncing, calendar, and setting up the student's own free Gemini key.
  - `downloads`: saving course files and backups as zips.
  - `offscreen`: reading PDFs and slides.
  - `scripting`, `activeTab`: filling in the student's AI's chat box and reading its reply.
  - `clipboardWrite`, `clipboardRead`: copying requests to the student's AI and reading its reply when they come back.
  - `sidePanel`, `alarms`: the panel, and refreshing deadlines in the background.
  - Optional site access (asked for when needed): the school's Canvas, Canvas file storage, Gradescope, the
    lecture video site, JupyterHub, the student's calendar link, and Google's Gemini and setup APIs (only if they set up Gemini).
- **Data usage:** the student's Canvas and Google data is only used to provide these features, is never sold,
  and is never sent to a CampusPilot server (there isn't one).
