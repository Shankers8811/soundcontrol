# Publish SoundControl on GitHub (first time, no coding)

> **Status:** the Windows installer is published at
> <https://github.com/Shankers8811/soundcontrol/releases/latest>. The public web deployment is
> intentionally paused while its Pages configuration is cleaned up. Keep this page as a
> from-scratch recipe (or for a fork); publishing a new Windows version is just a tag push.

You need a **free GitHub account** and the project files. GitHub hosts the source and release
artifacts; the Windows installer is the currently supported public distribution.

You will end up with:

- A public page: `https://github.com/YOUR_NAME/soundcontrol`
- A Windows installer release

A web deployment is a separate launch decision. Do not publish a `github.io` URL until Pages
has exactly one configured publisher and the generated app has been verified.

---

## A. Create a GitHub account (once)

1. Go to [https://github.com/signup](https://github.com/signup)
2. Enter **your email**
3. Choose a **password**
4. Choose a **username** for the GitHub repository and release page
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

## D. Relaunch the web app later

The web deployment is intentionally paused. When it is ready to relaunch:

1. On the repo page, open **Settings → Pages**
2. Choose **GitHub Actions** as the only source; disable **Deploy from a branch**
3. Restore a reviewed Pages workflow and wait for its green check
4. Verify the generated site before adding its URL to the README

Do not run a branch publisher and an Actions publisher for the same Pages site.

---

## E. Make the fork yours (links, buttons, bridge)

The repo hard-codes the original owner's name in the release and bridge links — search for
`Shankers8811` when preparing a fork and replace only the links appropriate for that fork.
Do not add a public web URL until the Pages relaunch has been verified.

---

## Share the Windows release

After the installer release is verified, share the GitHub release page. Keep hardware and
Bluetooth capability claims tied to models that have actually been tested.

---

## If something is red in Actions

Open the failed run → the log. Most common fix: **Settings → Actions → General → Allow all actions**. Re-run the job.
