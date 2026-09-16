# Publish SoundControl on GitHub (first time, no coding)

> **Status:** already done for this project — the website lives at
> <https://shankers8811.github.io/soundcontrol/> and installers at
> <https://github.com/Shankers8811/soundcontrol/releases/latest>. Keep this page as the
> from-scratch recipe (or for a fork); publishing a new version is just a tag push.

You need a **free GitHub account** and the zip of this project. GitHub is a public folder on the internet — not an APK store, not a virus site. **ear (web)** lives there the same way: [github.com/radiance-project/ear-web](https://github.com/radiance-project/ear-web).

You will end up with:

- A public page: `https://github.com/YOUR_NAME/soundcontrol`
- A public website: `https://YOUR_NAME.github.io/soundcontrol/`

People open the website in Chrome and tap Search. That is how ear-web gained users.

---

## A. Create a GitHub account (once)

1. Go to [https://github.com/signup](https://github.com/signup)
2. Enter **your email**
3. Choose a **password**
4. Choose a **username** (this becomes `YOUR_NAME` in the links above). Example: `nimali` → `https://nimali.github.io/soundcontrol/`
5. Prove you are not a robot
6. Open the email GitHub sent you and click the green button
7. You are in. You do not need to pay.

---

## B. Create an empty project folder on GitHub

1. While signed in, go to [https://github.com/new](https://github.com/new)
2. **Repository name:** `soundcontrol`
3. Select **Public** (required if you want strangers to find it)
4. Leave **Add a README** **unchecked**
5. Click **Create repository**

You now have an empty box.

---

## C. Put the app in that box

1. Unzip `soundcontrol-local.zip` on your computer (right-click → Extract)
2. On the empty GitHub page, click **uploading an existing file**
3. Drag **all** the unzipped files into the big dashed box  
   You should see `package.json`, `src`, `public`, `.github`, `README.md`, …
4. Scroll down. Message: `Publish SoundControl`
5. Click **Commit changes**

Wait until the file list looks like a real project.

---

## D. Turn on the public website

1. On the repo page, click **Settings** (top row)
2. Left menu: **Pages**
3. **Build and deployment → Source:** choose **GitHub Actions**
4. Click **Actions** (top row, next to Settings)
5. Click **GitHub Pages** if it appears, or wait ~2 minutes
6. When you see a **green check**, it worked
7. If it asks **Allow GitHub Actions**, click I understand / Allow

---

## E. Open it like ear-web

In Chrome, Edge, or Brave (its **own** tab):

```
https://YOUR_NAME.github.io/soundcontrol/
```

Replace `YOUR_NAME` with the username from step A.

Then: **Add Device → Search** or **Try the demo**.

---

## F. Make the fork yours (links, buttons, bridge)

The repo hard-codes the original owner's name in four places — search for
`Shankers8811` (in the GitHub web UI: open each file, click the pencil) and
replace it with your username:

1. `README.md` — the live-site, download, and badge links
2. `vite.config.ts` — `REPO_URL`, which drives the in-app download buttons
3. `soundcore_bridge.py` — `BUNDLED_WEB_ORIGINS`, the web origin the bridge answers
4. `GITHUB.md` — the example site URL in step 4

Then commit. Your Pages site is `https://YOUR_NAME.github.io/soundcontrol/`.

Optional: repo page → ⚙️ **About** (right side) → tick **Use your GitHub Pages website** → save. The homepage link then shows like ear-web’s `earweb.bttl.xyz`.

---

## Share (how projects get stars)

After the site loads for you:

- Post the **github.io** link on Reddit **r/soundcore** and **r/anker**
- Title idea: `Unofficial desktop soundcore app (web) — ANC/EQ, no Anka`
- Pin the website link in the GitHub **About** box
- Answer **Issues** when people report models

You do **not** download APKs from strangers. You published **your** web app.

---

## If something is red in Actions

Open the failed run → the log. Most common fix: **Settings → Actions → General → Allow all actions**. Re-run the job.
