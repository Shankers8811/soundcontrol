/**
 * Windows CI verification for the no-autostart release policy.
 *
 * smoke-windows.yml seeds a legacy Run-key entry (exactly what an older
 * SoundControl install would have written) and then runs this script with
 * SOUNDCONTROL_VERIFY_EXE pointing at the PACKAGED executable. The script
 * calls the same enforceNoAutostart() the app runs at startup, so the test
 * proves the real code path removes the real registration — not merely that
 * a JavaScript default is false.
 *
 *   npx electron scripts/verify-autostart.cjs
 */
const { app } = require('electron');
const path = require('path');
const { enforceNoAutostart } = require(path.join(__dirname, '..', 'autostart.cjs'));

const target = path.resolve(process.env.SOUNDCONTROL_VERIFY_EXE || process.execPath);

app.whenReady().then(() => {
  const openAtLogin = enforceNoAutostart(app, (m) => console.log(`[verify-autostart] ${m}`), target);
  console.log(`VERIFY_AUTOSTART target=${target} openAtLoginAfter=${openAtLogin}`);
  if (openAtLogin === true) {
    console.error('VERIFY_AUTOSTART FAIL: login item still reports openAtLogin=true');
    app.exit(1);
    return;
  }
  app.exit(0);
});
