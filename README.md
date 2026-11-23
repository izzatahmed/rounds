# RoundNotes — web edition (iPhone and iPad)

The same RoundNotes screens as the Android app, packaged as a web app that iPhone and iPad users add to their
Home Screen. It works offline after the first visit. Patient data is stored only on the device, encrypted with a
key that is itself locked by the user's PIN, and the page is not allowed to send anything over the network.

## Put it on GitHub Pages (once)
1. On github.com, create a new repository named **rounds**. Make it **Public** (free GitHub Pages needs a public
   repository; it holds only the app's code, never patient data).
2. In the new repository, choose **uploading an existing file**. Drag in **everything inside this folder**
   (all files and the `icons` folder — not the folder itself). Click **Commit changes**.
3. Open **Settings → Pages**. Under *Build and deployment*, choose **Deploy from a branch**, branch **main**,
   folder **/ (root)**, and **Save**.
4. After a minute or two the app is live at **https://izzatahmed.github.io/rounds/**

## Students on iPhone or iPad
1. Open the link in **Safari**.
2. Tap **Share** → **Add to Home Screen** → **Add**.
3. Always open RoundNotes from the Home Screen icon (a Safari tab keeps its data separately).

## Updating
Upload the new files over the old ones (same names) and commit. Users see "A new version of RoundNotes is ready"
with an **Update** button the next time they open the app. Their patients stay.

## What differs from the Android app
- Unlock with the PIN only (no fingerprint or Face ID).
- Reminders appear inside the app (red bell, ⏰ badge, a pop-up while the app is open) — iPhone web apps cannot
  alert when the app is closed.
- Screenshots cannot be blocked.
- Save PDF opens the share sheet: **Save to Files**, **Print**, and so on.
- Backup files are the same format as Android: a backup made on one restores on the other.
