'use strict';
/* 离屏渲染截图：用于开发自检  node 之前请用 可视清单.exe dev/shot.js 运行 */
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

app.disableHardwareAcceleration();
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('force-device-scale-factor', '1');

const ROOT = path.join(__dirname, '..');
const TMP = path.join(ROOT, '.tmp');
fs.mkdirSync(path.join(TMP, 'ud'), { recursive: true });
fs.mkdirSync(path.join(TMP, 'shots'), { recursive: true });
app.setPath('userData', path.join(TMP, 'ud'));
app.setPath('sessionData', path.join(TMP, 'ud', 'session'));

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  await app.whenReady();

  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    show: false,
    webPreferences: { offscreen: true, contextIsolation: true, nodeIntegration: false, preload: path.join(__dirname, 'shot-preload.js') }
  });

  win.webContents.on('console-message', (...args) => {
    const e = args[0];
    if (e && typeof e === 'object' && 'message' in e) {
      console.log('[' + e.level + '] ' + e.message + '  @' + (e.sourceId || '') + ':' + (e.lineNumber || 0));
    } else {
      console.log('[console] ' + args.slice(1).join(' | '));
    }
  });
  win.webContents.on('preload-error', (event, preloadPath, error) => {
    console.log('[preload-error] ' + preloadPath + ' :: ' + error.message);
  });

  await win.loadFile(path.join(ROOT, 'src', 'index.html'));
  await wait(900);

  const shot = async (name) => {
    const image = await win.webContents.capturePage();
    fs.writeFileSync(path.join(TMP, 'shots', name + '.png'), image.toPNG());
    console.log('shot -> ' + name + '.png');
  };

  const report = await win.webContents.executeJavaScript(`(() => ({
    tasks: document.querySelectorAll('.task').length,
    cols: document.querySelectorAll('.day-col').length,
    heads: document.querySelectorAll('.day-head').length,
    chips: document.querySelectorAll('.allday-chip').length,
    sidebar: document.querySelectorAll('.nav-item').length,
    range: (document.getElementById('rangeLabel')||{}).textContent || '',
    errors: window.__errors || []
  }))()`);
  console.log('report: ' + JSON.stringify(report));

  await shot('01-week');

  await win.webContents.executeJavaScript(`(() => {
    const col = document.querySelector('.day-col[data-index="2"]');
    const r = col.getBoundingClientRect();
    Dialogs.openTask({ mode: 'create', seed: { date: col.dataset.date, start: 13*60, end: 14*60+30 }, anchor: { x: r.left + 40, y: r.top + 300 } });
    return true;
  })()`);
  await wait(400);
  await shot('02-popup');
  await win.webContents.executeJavaScript(`Dialogs.openTask({
    mode: 'edit',
    task: Store.data.tasks[2],
    anchor: { x: 420, y: 220 }
  })`);
  await wait(400);
  await shot('03-edit');

  await win.webContents.executeJavaScript(`Dialogs.closePop(); Store.setSetting('theme','dark');`);
  await wait(500);
  await shot('04-dark');

  await win.webContents.executeJavaScript(`Store.setSetting('theme','light'); Dialogs.openSettings({ x: 900, y: 60 });`);
  await wait(400);
  await shot('05-settings');

  await win.webContents.executeJavaScript(`Dialogs.closePop(); Store.ui.view='day'; Store.ui.anchor=Util.today(); Calendar.render({focus:true}); Toolbar.render(); Store.ui.filterListId=Store.data.lists[0].id; Store.emit();`);
  await wait(500);
  await shot('06-day');

  app.quit();
}

main().catch((err) => {
  console.log('FATAL ' + (err && err.stack || err));
  app.quit();
});
