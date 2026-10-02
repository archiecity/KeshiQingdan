'use strict';
/*
 * 正文（内容）保存 + 默认清单逻辑自检（不需要界面）：
 *   node dev/test-note.js
 * 模拟 Store，验证：正文静默保存不触发重绘、会进撤销栈、普通保存照常通知、默认清单记忆。
 */
const fs = require('fs');
const path = require('path');

const code = fs.readFileSync(path.join(__dirname, '..', 'src', 'js', 'store.js'), 'utf8');
const clone = (o) => JSON.parse(JSON.stringify(o));
const fakeWindow = {};
const Util = {
  clone: clone,
  debounce: (fn) => { const f = () => fn(); f.flush = () => fn(); return f; },
  uid: () => 'id-' + Math.random().toString(36).slice(2, 7),
  today: () => '2026-10-02'
};
const run = new Function('window', 'Util', 'Toast', 'localStorage', code);
run(fakeWindow, Util, { show: () => {} }, { getItem: () => null, setItem: () => {} });

const Store = fakeWindow.Store;
Store.data = {
  version: 1,
  lists: [{ id: 'work', name: '工作', color: '#4C7DFA' }],
  tasks: [{ id: 't1', title: '标题', note: '', listId: 'work', date: '2026-10-02', start: 540, end: 600 }],
  settings: {}
};

const results = [];
function check(name, ok, extra) {
  results.push(ok);
  console.log((ok ? '  ✓ ' : '  ✗ ') + name + (extra ? '   [' + extra + ']' : ''));
}

let emits = 0;
Store.on(() => emits++);

Store.updateTask('t1', { note: '备忘录正文' }, true, true);
check('静默保存不触发重绘', emits === 0);
check('正文已写入任务', Store.taskById('t1').note === '备忘录正文', Store.taskById('t1').note);
check('进入撤销栈', Store.history.length === 1);

Store.updateTask('t1', { title: '改标题' });
check('普通保存照常通知重绘', emits === 1);

Store.undo();
check('撤销后标题回到旧值', Store.taskById('t1').title === '标题', Store.taskById('t1').title);
check('撤销后正文仍在', Store.taskById('t1').note === '备忘录正文');

console.log('\n【默认清单】');
Store.data.lists.push({ id: 'life', name: '生活', color: '#3FBF8F' });
Store.data.settings = {};
check('一开始默认第一个清单', Store.defaultListId() === 'work', Store.defaultListId());
Store.addTask({ title: '任务 A', listId: 'life' });
check('新建任务后记住该清单', Store.data.settings.lastListId === 'life' && Store.defaultListId() === 'life', Store.defaultListId());
Store.updateTask('t1', { listId: 'life' });
check('编辑任务换成生活后仍记住生活', Store.defaultListId() === 'life', Store.defaultListId());
Store.updateTask('t1', { listId: 'work' });
check('编辑任务换回工作后记住工作', Store.defaultListId() === 'work', Store.defaultListId());
Store.data.settings.lastListId = '已删除的清单';
check('清单不存在时回退第一个', Store.defaultListId() === 'work', Store.defaultListId());
Store.ui.filterListId = 'life';
check('侧边栏筛选优先于记忆', Store.defaultListId() === 'life', Store.defaultListId());
Store.ui.filterListId = null;

console.log('\n【清单排序】');
Store.data.lists = [
  { id: 'a', name: 'A', color: '#111111' },
  { id: 'b', name: 'B', color: '#222222' },
  { id: 'c', name: 'C', color: '#333333' }
];
const order = () => Store.data.lists.map((l) => l.id).join('');
Store.moveList('c', 'a');
check('把 c 移到 a 前面', order() === 'cab', order());
Store.moveList('a', null);
check('把 a 移到末尾', order() === 'cba', order());
Store.moveList('c', 'b');
check('顺序没变时不产生多余改动', order() === 'cba', order());
Store.undo();
check('撤销可以恢复排序', order() === 'cab', order());
Store.moveList('不存在的清单', 'a');
check('无效 id 被忽略', order() === 'cab', order());

console.log('\n【死亡线】');
Store.data.deadlines = [];
const dlGao = Store.addDeadline({ title: '高考', due: '2027-06-07' });
const dlPaper = Store.addDeadline({ title: '论文', due: '2026-10-05' });
const titles = () => Store.deadlinesSorted().map((d) => d.title).join('/');
check('按截止日期从近到远排序', titles() === '论文/高考', titles());
check('未来天数计算', Store.daysLeft('2026-10-05') === 3, String(Store.daysLeft('2026-10-05')));
check('今天 = 0 天', Store.daysLeft('2026-10-02') === 0, String(Store.daysLeft('2026-10-02')));
check('逾期显示负数', Store.daysLeft('2026-09-29') === -3, String(Store.daysLeft('2026-09-29')));
Store.updateDeadline(dlPaper.id, { title: '论文初稿' });
check('可以编辑标题', Store.deadlineById(dlPaper.id).title === '论文初稿');
Store.removeDeadline(dlGao.id);
check('可以删除', Store.deadlineById(dlGao.id) === null && Store.data.deadlines.length === 1);
Store.undo();
check('撤销后重新出现', !!Store.deadlineById(dlGao.id));

const failed = results.filter((x) => !x).length;
console.log('\n' + (failed ? '❌ 失败 ' + failed + ' 项' : '✅ 全部通过（' + results.length + ' 项）'));
process.exit(failed ? 1 : 0);
