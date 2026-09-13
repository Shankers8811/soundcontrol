# Put SoundControl on GitHub (no Node on your PC)

GitHub Pages gives you a real `https://you.github.io/...` tab. Brave can use Web Bluetooth there. The Arena sandbox URL cannot.

You still need **Chrome, Edge, or Brave on a computer** — not the phone soundcore app, and not this Arena preview.

## 1. Create the repo

1. Sign in at [github.com](https://github.com)
2. **New repository**
3. Name: `soundcontrol` (any name is fine)
4. Public
5. **Do not** add a README if you will upload this project zip
6. Create

## 2. Upload this project

Easiest without Git:

1. On the empty repo page, click **uploading an existing file**
2. Drop **everything** from `soundcontrol-local.zip` (unzip first): `package.json`, `src/`, `public/`, `.github/`, etc.
3. Commit

Or with Git:

```bash
git init
git add .
git commit -m "SoundControl"
git branch -M main
git remote add origin https://github.com/YOUR_USER/soundcontrol.git
git push -u origin main
```

## 3. Turn on Pages

1. Repo **Settings** → **Pages**
2. **Source**: GitHub Actions
3. Open the **Actions** tab and wait for **GitHub Pages** to go green (GitHub installs Node and builds — you do not)

## 4. Open it in Brave

The site will be:

`https://YOUR_USER.github.io/soundcontrol/`

Open that **as its own tab**. Then:

1. Lion icon → Shields **down** for this site
2. **Add Device** → **Search**
3. Tap your soundcore in the picker

No MAC addresses. No sandbox token.

## What GitHub cannot do

GitHub only hosts the website. It cannot talk to Classic Bluetooth RFCOMM. **Search** uses Web Bluetooth (battery / some EQ). Full ANC still needs the desktop helper on your PC later (`python3 soundcore_bridge.py`). For trying the UI, **Try the demo** works on the GitHub site too.
