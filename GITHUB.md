# Put SoundControl on GitHub (no Node on your PC)

> **Status:** `github.com/Shankers8811/soundcontrol` exists, but the public web deployment is
> intentionally paused while the Pages configuration is cleaned up. Day-to-day changes go
> through a normal PR — see [CONTRIBUTING.md](CONTRIBUTING.md).

The public README currently documents the Windows desktop app only. Do not advertise or rely
on a `github.io` web-app URL until the Pages deployment is deliberately relaunched.

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

## 3. Pages deployment (when the web app is ready)

The web app is not being launched from this repository right now. Before relaunching it:

1. Repo **Settings** → **Pages**
2. Choose exactly one publisher: **GitHub Actions**
3. Restore or add a reviewed Pages workflow, then wait for that workflow to go green
4. Verify the generated site before adding its URL back to the README

Do not enable both **Deploy from a branch** and an Actions deployment for the same site.

## What GitHub cannot do

GitHub hosts the source and Windows release artifacts. It cannot talk to Classic Bluetooth RFCOMM;
the Windows desktop installer starts the local helper that provides that hardware path.
