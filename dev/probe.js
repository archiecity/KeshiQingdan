'use strict';
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const TMP = path.join(__dirname, '..', '.tmp');
fs.mkdirSync(TMP, { recursive: true });
const LOG = path.join(TMP, 'probe.log');
const log = (m) => { try { fs.appendFileSync(LOG, m + '\n'); } catch (e) {} };

try { fs.writeFileSync(LOG, ''); } catch (e) {}
log('script loaded, electron ' + process.versions.electron);

app.disableHardwareAcceleration();
log('hw accel disabled');

app.setPath('userData', path.join(TMP, 'ud'));
app.setPath('sessionData', path.join(TMP, 'ud', 'session'));
log('userData set');

app.whenReady().then(async () => {
  log('app ready');
  try {
    const win = new BrowserWindow({ width: 800, height: 600, show: false, webPreferences: { offscreen: true } });
    log('window created');
    win.webContents.on('console-message', () => {});
    await win.loadFile(path.join(__dirname, '..', 'src', 'index.html'));
    log('page loaded');
    await new Promise((r) => setTimeout(r, 800));
    const count = await win.webContents.executeJavaScript("document.querySelectorAll('.day-col').length");
    log('day cols = ' + count);
    const img = await win.webContents.capturePage();
    fs.writeFileSync(path.join(TMP, 'probe.png'), img.toPNG());
    log('captured ' + img.getSize().width + 'x' + img.getSize().height);
  } catch (err) {
    log('ERROR ' + (err && err.stack || err));
  }
  log('quitting');
  app.quit();
});
