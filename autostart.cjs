/**
 * Release product policy, enforced by the main process on EVERY startup:
 *
 *  1. SoundControl never starts with Windows. There is no launch-at-login
 *     setting any more; instead each launch actively clears a Windows Run-key
 *     registration an OLDER version may have written, using Electron's
 *     supported login-item API (openAtLogin: false), and logs the effective
 *     state afterwards so main.log proves what Windows will do at boot.
 *  2. Obsolete persisted settings can never resurrect removed behaviour:
 *     legacy settings.json keys (launchAtLogin, minimizeToTray) are stripped
 *     from the file at startup, and nothing in the app reads them any more.
 *
 * Kept in its own module so the Windows CI verification script
 * (scripts/verify-autostart.cjs) exercises the exact same code path the
 * packaged app runs, against the packaged executable path.
 */

const fs = require('fs');
const path = require('path');

/** Settings keys that existed before the policy and must never be honoured. */
const LEGACY_SETTINGS_KEYS = ['launchAtLogin', 'minimizeToTray'];

/**
 * Make sure `exePath` (default: this executable) is NOT registered to start
 * with Windows, removing registrations left by older installs. Returns the
 * effective openAtLogin state afterwards (true/false) or null when the
 * platform API could not be read.
 */
function enforceNoAutostart(app, log, exePath = process.execPath) {
  try {
    // openAtLogin:false is the removal path in Electron's Windows login-item
    // implementation: it deletes the Run-key entry (and startup-approval
    // value) whose command line matches this executable.
    app.setLoginItemSettings({ openAtLogin: false, path: exePath });
    log(`autostart enforcement: setLoginItemSettings(openAtLogin=false) for ${exePath}`);
  } catch (err) {
    log(`setLoginItemSettings(openAtLogin:false) failed: ${err}`);
  }
  try {
    const state = app.getLoginItemSettings() || {};
    const openAtLogin = state.openAtLogin === true;
    log(
      `autostart enforcement: effective login-item state openAtLogin=${openAtLogin} ` +
        `wasOpenedAtLogin=${state.wasOpenedAtLogin === true}`,
    );
    return openAtLogin;
  } catch (err) {
    log(`getLoginItemSettings failed: ${err}`);
    return null;
  }
}

/**
 * Strip obsolete keys from an older install's settings.json so no stale file
 * on disk can be interpreted as "start with Windows" or "hide to tray" by
 * anything, ever. Unknown/other keys are preserved untouched.
 */
function migrateLegacySettingsFile(userDataDir, log) {
  try {
    const file = path.join(userDataDir, 'settings.json');
    if (!fs.existsSync(file)) return;
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!raw || typeof raw !== 'object') return;
    const found = LEGACY_SETTINGS_KEYS.filter((key) =>
      Object.prototype.hasOwnProperty.call(raw, key),
    );
    if (found.length === 0) return;
    for (const key of found) delete raw[key];
    fs.writeFileSync(file, `${JSON.stringify(raw, null, 2)}\n`);
    log(`legacy settings.json migrated: removed ${found.join(', ')} (behaviours no longer exist)`);
  } catch (err) {
    log(`legacy settings migration skipped: ${err}`);
  }
}

module.exports = { enforceNoAutostart, migrateLegacySettingsFile, LEGACY_SETTINGS_KEYS };
