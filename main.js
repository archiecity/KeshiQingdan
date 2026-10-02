'use strict';

const { app, BrowserWindow, ipcMain, dialog, shell, Menu, nativeTheme } = require('electron');
const path = require('path');
const fs = require('fs');
const fsp = fs.promises;

const APP_ROOT = __dirname;
const DEV = !app.isPackaged;

/* -------------------------------------------------------------------------- *
 * 数据目录：优先放在程序所在文件夹（绿色便携），失败时逐级回退
 *   <程序目录>/data/tasks.json    任务数据（可直接备份/拷贝）
 *   <程序目录>/data/runtime/      Chromium 运行时缓存（可随时删除）
 * -------------------------------------------------------------------------- */
function ensureDir(dir) {
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.accessSync(dir, fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

function pickRoot() {
  const candidates = [];
  if (DEV) candidates.push(APP_ROOT);
  candidates.push(path.dirname(app.getPath('exe')));
  candidates.push(APP_ROOT);
  candidates.push(app.getPath('userData'));
  for (const base of candidates) {
    if (ensureDir(path.join(base, 'data'))) return base;
  }
  return APP_ROOT;
}

const ROOT = pickRoot();
const DATA_DIR = path.join(ROOT, 'data');
const RUNTIME_DIR = path.join(DATA_DIR, 'runtime');
const DATA_FILE = path.join(DATA_DIR, 'tasks.json');
const BACKUP_FILE = path.join(DATA_DIR, 'tasks.backup.json');
const WINDOW_FILE = path.join(DATA_DIR, 'window.json');

ensureDir(RUNTIME_DIR);
app.setPath('userData', RUNTIME_DIR);
app.setPath('sessionData', path.join(RUNTIME_DIR, 'session'));
app.setAppUserModelId('com.archie.focuslist');

/* 兜底：未捕获异常写入日志，方便排查启动问题 */
process.on('uncaughtException', (err) => {
  try {
    fs.appendFileSync(path.join(DATA_DIR, 'error.log'), '[' + new Date().toISOString() + '] ' + ((err && err.stack) || err) + '\n');
  } catch { /* 忽略 */ }
});

/* -------------------------------------------------------------------------- *
 * 读写工具
 * -------------------------------------------------------------------------- */
const BACKUP_DIR = path.join(DATA_DIR, 'backups');
ensureDir(BACKUP_DIR);

function pad2(n) {
  return String(n).padStart(2, '0');
}

function dayKey(d) {
  const t = d || new Date();
  return t.getFullYear() + '-' + pad2(t.getMonth() + 1) + '-' + pad2(t.getDate());
}

function timeKey(d) {
  const t = d || new Date();
  return dayKey(t).replace(/-/g, '') + '-' + pad2(t.getHours()) + pad2(t.getMinutes()) + pad2(t.getSeconds());
}

function parseJson(text) {
  try { return JSON.parse(text); } catch { return null; }
}

async function readText(file) {
  try { return await fsp.readFile(file, 'utf8'); } catch { return null; }
}

async function readJson(file, fallback = null) {
  const txt = await readText(file);
  if (txt == null) return fallback;
  const value = parseJson(txt);
  return value == null ? fallback : value;
}

/* 先写临时文件并落盘，再原子替换 —— 断电或崩溃都不会写坏原文件 */
async function writeAtomic(file, text) {
  const tmp = file + '.tmp';
  const handle = await fsp.open(tmp, 'w');
  try {
    await handle.writeFile(text, 'utf8');
    await handle.sync();
  } finally {
    await handle.close();
  }
  await fsp.rename(tmp, file);
}

async function writeJson(file, obj) {
  await writeAtomic(file, JSON.stringify(obj, null, 2));
}

/* 数据体检：结构不对直接拒绝保存，避免把好数据覆盖成垃圾 */
function normalize(data) {
  if (!data || typeof data !== 'object') return null;
  if (!Array.isArray(data.lists) || data.lists.length === 0) return null;
  if (!Array.isArray(data.tasks)) return null;
  const ids = new Set();
  for (const list of data.lists) {
    if (!list || typeof list.id !== 'string' || typeof list.name !== 'string') return null;
    ids.add(list.id);
  }
  for (const task of data.tasks) {
    if (!task || typeof task.id !== 'string' || typeof task.title !== 'string') return null;
    if (!ids.has(task.listId)) task.listId = data.lists[0].id;
  }
  if (data.deadlines == null) data.deadlines = [];
  if (!Array.isArray(data.deadlines)) return null;
  for (const item of data.deadlines) {
    if (!item || typeof item.id !== 'string' || typeof item.title !== 'string' || typeof item.due !== 'string') return null;
  }
  if (!data.settings || typeof data.settings !== 'object') data.settings = {};
  return data;
}

async function listBackups() {
  const out = [];
  try {
    const files = await fsp.readdir(BACKUP_DIR);
    for (const name of files) {
      const full = path.join(BACKUP_DIR, name);
      let label = null;
      let kind = null;
      let m = /^tasks-(\d{4})-(\d{2})-(\d{2})\.json$/.exec(name);
      if (m) {
        label = m[1] + '年' + Number(m[2]) + '月' + Number(m[3]) + '日 · 每日快照';
        kind = 'daily';
      }
      if (!label) {
        m = /^prerestore-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})\.json$/.exec(name);
        if (m) {
          label = Number(m[2]) + '月' + Number(m[3]) + '日 ' + m[4] + ':' + m[5] + ' · 恢复前快照';
          kind = 'prerestore';
        }
      }
      if (!label) continue;
      const st = await fsp.stat(full);
      out.push({
        file: name,
        label: label,
        kind: kind,
        time: st.mtimeMs,
        size: st.size
      });
    }
  } catch { /* 忽略 */ }
  try {
    const st = await fsp.stat(BACKUP_FILE);
    out.push({ file: 'tasks.backup.json', label: '上一版自动备份', kind: 'previous', time: st.mtimeMs, size: st.size });
  } catch { /* 还没有备份文件 */ }
  out.sort((a, b) => b.time - a.time);
  return out;
}

async function pruneByKind(kind, keep) {
  const list = (await listBackups()).filter((x) => x.kind === kind);
  for (const item of list.slice(keep)) {
    try { await fsp.unlink(path.join(BACKUP_DIR, item.file)); } catch { /* 忽略 */ }
  }
}

async function pruneBackups(keep) {
  await pruneByKind('daily', keep);
}

/* 每天第一次打开时留一份快照（同一天只留一次，不会覆盖） */
async function ensureDailySnapshot() {
  const txt = await readText(DATA_FILE);
  if (txt == null) return;
  const file = path.join(BACKUP_DIR, 'tasks-' + dayKey() + '.json');
  try {
    await fsp.access(file);
    return;
  } catch { /* 今天还没有快照 */ }
  try {
    await writeAtomic(file, txt);
    await pruneBackups(30);
  } catch { /* 忽略 */ }
}

async function saveData(data) {
  const clean = normalize(data);
  if (!clean) throw new Error('数据校验未通过，已阻止本次保存');
  const previous = await readText(DATA_FILE);
  if (previous != null) {
    try { await writeAtomic(BACKUP_FILE, previous); } catch { /* 忽略 */ }
  }
  await writeAtomic(DATA_FILE, JSON.stringify(clean, null, 2));
  await ensureDailySnapshot();
  return true;
}

/* 启动读取：读坏了就用备份兜底，同时把损坏文件原样留档 */
async function loadData() {
  const raw = await readText(DATA_FILE);
  if (raw == null) return { data: null, recover: null };

  const ok = normalize(parseJson(raw));
  if (ok) return { data: ok, recover: null };

  try {
    await writeAtomic(path.join(BACKUP_DIR, 'tasks-corrupt-' + timeKey() + '.json'), raw);
  } catch { /* 忽略 */ }

  const fromBackup = normalize(await readJson(BACKUP_FILE, null));
  if (fromBackup) {
    return { data: fromBackup, recover: { mode: 'backup', message: '数据文件异常，已用上一版备份恢复（原文件已留存）' } };
  }
  for (const item of await listBackups()) {
    const snapshot = normalize(await readJson(path.join(BACKUP_DIR, item.file), null));
    if (snapshot) {
      return { data: snapshot, recover: { mode: 'snapshot', message: '数据文件异常，已用「' + item.label + '」的快照恢复' } };
    }
  }
  return {
    data: null,
    recover: { mode: 'corrupt', message: '数据文件无法解析，原文件已留存到 data\\backups，可手动找回' }
  };
}

/* -------------------------------------------------------------------------- *
 * 窗口
 * -------------------------------------------------------------------------- */
let win = null;
let lastStateWrite = 0;

const DEFAULT_BOUNDS = { width: 1400, height: 880 };

async function windowBounds() {
  const saved = await readJson(WINDOW_FILE, null);
  if (!saved || typeof saved.width !== 'number') return { ...DEFAULT_BOUNDS, maximized: false };
  return saved;
}

function saveWindowState() {
  if (!win || win.isDestroyed()) return;
  const now = Date.now();
  if (now - lastStateWrite < 400) return;
  lastStateWrite = now;
  const maximized = win.isMaximized();
  const bounds = maximized ? win.getNormalBounds() : win.getBounds();
  writeJson(WINDOW_FILE, { ...bounds, maximized }).catch(() => {});
}

async function createWindow() {
  const saved = await windowBounds();

  win = new BrowserWindow({
    x: saved.x,
    y: saved.y,
    width: saved.width,
    height: saved.height,
    minWidth: 980,
    minHeight: 640,
    show: false,
    backgroundColor: '#f6f7f9',
    title: '可视清单',
    icon: path.join(APP_ROOT, 'build', 'icon.ico'),
    autoHideMenuBar: true,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    titleBarOverlay: process.platform === 'darwin' ? undefined : {
      color: '#ffffff',
      symbolColor: '#5b6069',
      height: 42
    },
    webPreferences: {
      preload: path.join(APP_ROOT, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
      backgroundThrottling: false
    }
  });

  Menu.setApplicationMenu(null);
  if (saved.maximized) win.maximize();

  win.once('ready-to-show', () => win.show());
  win.on('resize', saveWindowState);
  win.on('move', saveWindowState);
  win.on('maximize', saveWindowState);
  win.on('unmaximize', saveWindowState);
  win.on('closed', () => { win = null; });

  win.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    const key = (input.key || '').toLowerCase();
    if (key === 'f12') {
      win.webContents.toggleDevTools();
      event.preventDefault();
    } else if (key === 'f5') {
      win.webContents.reload();
      event.preventDefault();
    }
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    if (url !== win.webContents.getURL()) event.preventDefault();
  });

  await win.loadFile(path.join(APP_ROOT, 'src', 'index.html'));
}

/* -------------------------------------------------------------------------- *
 * IPC
 * -------------------------------------------------------------------------- */
ipcMain.handle('store:load', async () => {
  await ensureDailySnapshot();
  const result = await loadData();
  return { ok: true, data: result.data, recover: result.recover, dataDir: DATA_DIR, dataFile: DATA_FILE };
});

/* 保存串行化：避免两次保存交叉写同一个临时文件 */
let saveChain = Promise.resolve();

ipcMain.handle('store:save', async (_e, data) => {
  const run = async () => {
    try {
      await saveData(data);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: String((err && err.message) || err) };
    }
  };
  saveChain = saveChain.then(run, run);
  return saveChain;
});

ipcMain.handle('store:list-backups', async () => ({ ok: true, list: await listBackups() }));

ipcMain.handle('store:restore', async (_e, file) => {
  if (typeof file !== 'string' || !/^[A-Za-z0-9._-]+$/.test(file)) return { ok: false, error: '文件名不合法' };
  const isPrevious = file === 'tasks.backup.json';
  const full = isPrevious ? BACKUP_FILE : path.join(BACKUP_DIR, file);
  if (!isPrevious && !full.startsWith(BACKUP_DIR)) return { ok: false, error: '路径不合法' };
  const data = normalize(await readJson(full, null));
  if (!data) return { ok: false, error: '备份文件无法解析' };
  try {
    const current = await readText(DATA_FILE);
    if (current != null) {
      await writeAtomic(path.join(BACKUP_DIR, 'prerestore-' + timeKey() + '.json'), current);
      await pruneByKind('prerestore', 10);
    }
    await writeAtomic(DATA_FILE, JSON.stringify(data, null, 2));
  } catch (err) {
    return { ok: false, error: String((err && err.message) || err) };
  }
  return { ok: true, data };
});

ipcMain.handle('store:export', async (_e, data) => {
  const stamp = new Date().toISOString().slice(0, 10);
  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    title: '导出任务数据',
    defaultPath: `可视清单-${stamp}.json`,
    filters: [{ name: 'JSON', extensions: ['json'] }]
  });
  if (canceled || !filePath) return { ok: false, canceled: true };
  await writeJson(filePath, data);
  return { ok: true, filePath };
});

ipcMain.handle('store:import', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    title: '导入任务数据',
    properties: ['openFile'],
    filters: [{ name: 'JSON', extensions: ['json'] }]
  });
  if (canceled || !filePaths.length) return { ok: false, canceled: true };
  const data = await readJson(filePaths[0], null);
  if (!data) return { ok: false, error: '文件无法解析' };
  return { ok: true, data };
});

ipcMain.handle('app:open-data-dir', async () => {
  shell.openPath(DATA_DIR);
  return { ok: true };
});

ipcMain.handle('app:info', async () => ({
  version: app.getVersion(),
  dataDir: DATA_DIR,
  dataFile: DATA_FILE,
  electron: process.versions.electron
}));

ipcMain.handle('theme:set', (_e, theme) => {
  const dark = theme === 'dark';
  nativeTheme.themeSource = dark ? 'dark' : 'light';
  if (win && !win.isDestroyed() && process.platform !== 'darwin') {
    try {
      win.setTitleBarOverlay({
        color: dark ? '#1b1e24' : '#ffffff',
        symbolColor: dark ? '#c9cdd4' : '#5b6069',
        height: 42
      });
    } catch { /* 某些平台不支持 */ }
  }
  return { ok: true };
});

ipcMain.on('window:state', () => saveWindowState());

/* -------------------------------------------------------------------------- *
 * 生命周期
 * -------------------------------------------------------------------------- */
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });
  app.whenReady().then(() => {
    createWindow().catch((err) => {
      try {
        fs.appendFileSync(path.join(DATA_DIR, 'error.log'), '[' + new Date().toISOString() + '] ' + ((err && err.stack) || err) + '\n');
      } catch { /* 忽略 */ }
      dialog.showErrorBox('可视清单启动失败', String((err && err.message) || err));
    });
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
