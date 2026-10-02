'use strict';
/*
 * 数据层自检（不需要启动界面）：
 *   node dev/test-data.js
 * 会在系统临时目录里模拟：正常保存、非法数据拦截、文件损坏自愈、每日快照。
 */
const fs = require('fs');
const fsp = fs.promises;
const os = require('os');
const path = require('path');

const SRC = path.join(__dirname, '..', 'main.js');
const code = fs.readFileSync(SRC, 'utf8');

const from = code.indexOf("const BACKUP_DIR = path.join(DATA_DIR, 'backups');");
const to = code.indexOf('/* -------------------------------------------------------------------------- *\n * 窗口');
if (from < 0 || to < 0) {
  console.error('无法从 main.js 中定位数据层代码');
  process.exit(1);
}
const block = code.slice(from, to);

function makeStore(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const ensureDir = (d) => {
    try { fs.mkdirSync(d, { recursive: true }); return true; } catch { return false; }
  };
  const factory = new Function(
    'fsp', 'path', 'fs', 'DATA_DIR', 'DATA_FILE', 'BACKUP_FILE', 'ensureDir',
    block + '\nreturn { saveData, loadData, listBackups, ensureDailySnapshot, normalize, BACKUP_DIR };'
  );
  return factory(fsp, path, fs, dir, path.join(dir, 'tasks.json'), path.join(dir, 'tasks.backup.json'), ensureDir);
}

const results = [];
function check(name, ok, extra) {
  results.push({ name, ok, extra: extra || '' });
  console.log((ok ? '  ✓ ' : '  ✗ ') + name + (extra ? '   [' + extra + ']' : ''));
}

const sampleV1 = {
  version: 1,
  lists: [{ id: 'work', name: '工作', color: '#4C7DFA' }],
  tasks: [{ id: 't1', title: '第一版', listId: 'work', date: '2026-10-02', start: 540, end: 600 }],
  settings: { snap: 5 }
};
const sampleV2 = {
  version: 1,
  lists: [{ id: 'work', name: '工作', color: '#4C7DFA' }],
  tasks: [
    { id: 't1', title: '第一版', listId: 'work', date: '2026-10-02', start: 540, end: 600 },
    { id: 't2', title: '第二版新增', listId: 'work', date: '2026-10-02', start: 660, end: 720 }
  ],
  settings: { snap: 5 }
};

async function main() {
  const dir = path.join(os.tmpdir(), 'focuslist-datatest-' + process.pid);
  const store = makeStore(dir);
  const dataFile = path.join(dir, 'tasks.json');
  const backupFile = path.join(dir, 'tasks.backup.json');

  console.log('\n【1】全新安装：没有数据文件');
  let r = await store.loadData();
  check('返回空数据且不报错', r.data === null && r.recover === null);

  console.log('\n【2】正常保存与读取');
  await store.saveData(sampleV1);
  r = await store.loadData();
  check('读回内容一致', r.data && r.data.tasks.length === 1 && r.data.tasks[0].title === '第一版');

  console.log('\n【3】每日快照');
  const snaps = await store.listBackups();
  check('生成了今天的快照', snaps.length === 1, snaps[0] ? snaps[0].file : '');

  console.log('\n【4】非法数据必须被拦下');
  const before = fs.readFileSync(dataFile, 'utf8');
  let blocked = false;
  try { await store.saveData({ lists: [], tasks: [] }); } catch { blocked = true; }
  check('空清单被拒绝', blocked);
  blocked = false;
  try { await store.saveData({ lists: [{ id: 'a', name: 'x' }], tasks: 'not-an-array' }); } catch { blocked = true; }
  check('tasks 不是数组被拒绝', blocked);
  check('原文件没有被改写', fs.readFileSync(dataFile, 'utf8') === before);

  console.log('\n【5】文件损坏自愈');
  await store.saveData(sampleV2);           // 让 backup 里留下 V1
  fs.writeFileSync(dataFile, '{ 这不是合法 JSON', 'utf8');
  r = await store.loadData();
  check('自动回退到上一版备份', r.data && r.data.tasks.length === 1, r.recover ? r.recover.mode : 'none');
  const kept = fs.readdirSync(store.BACKUP_DIR).filter((f) => f.startsWith('tasks-corrupt-'));
  check('损坏文件已留档', kept.length === 1, kept[0] || '');

  console.log('\n【6】备份与快照都不可用时');
  fs.writeFileSync(dataFile, '{坏', 'utf8');
  fs.writeFileSync(backupFile, '也坏了', 'utf8');
  for (const f of fs.readdirSync(store.BACKUP_DIR)) {
    if (/^tasks-\d{4}-\d{2}-\d{2}\.json$/.test(f)) fs.unlinkSync(path.join(store.BACKUP_DIR, f));
  }
  r = await store.loadData();
  check('返回空数据 + 损坏提示', r.data === null && r.recover && r.recover.mode === 'corrupt');

  console.log('\n【7】孤立清单引用自动修复');
  const fixed = store.normalize({
    lists: [{ id: 'work', name: '工作' }],
    tasks: [{ id: 'x', title: '孤儿任务', listId: '已删除的清单' }],
    settings: {}
  });
  check('listId 被修正为第一个清单', fixed && fixed.tasks[0].listId === 'work');

  console.log('\n【8】恢复前快照也能在列表里看到');
  fs.writeFileSync(path.join(store.BACKUP_DIR, 'prerestore-20261001-090000.json'), JSON.stringify(sampleV1), 'utf8');
  const list = await store.listBackups();
  const pre = list.filter((x) => x.kind === 'prerestore');
  check('prerestore 文件被识别', pre.length === 1, pre[0] ? pre[0].label : '');
  const prev = list.filter((x) => x.kind === 'previous');
  check('上一版自动备份被识别', prev.length === 1, prev[0] ? prev[0].label : '');

  console.log('\n【9】死亡线数据校验');
  await store.saveData({
    lists: [{ id: 'work', name: '工作' }],
    tasks: [],
    deadlines: [{ id: 'd1', title: '高考', due: '2027-06-07' }],
    settings: {}
  });
  r = await store.loadData();
  check('死亡线可以保存并读回', r.data && r.data.deadlines.length === 1 && r.data.deadlines[0].title === '高考');
  blocked = false;
  try {
    await store.saveData({ lists: [{ id: 'a', name: 'x' }], tasks: [], deadlines: [{ id: 'd1', title: '没有日期' }] });
  } catch { blocked = true; }
  check('缺 due 的死亡线被拒绝', blocked);
  const legacy = store.normalize({ lists: [{ id: 'a', name: 'x' }], tasks: [], settings: {} });
  check('老数据自动补空 deadlines', legacy && Array.isArray(legacy.deadlines) && legacy.deadlines.length === 0);

  const failed = results.filter((x) => !x.ok);
  console.log('\n' + (failed.length ? '❌ 失败 ' + failed.length + ' 项' : '✅ 全部通过（' + results.length + ' 项）'));
  fs.rmSync(dir, { recursive: true, force: true });
  process.exit(failed.length ? 1 : 0);
}

main().catch((err) => { console.error(err); process.exit(1); });
