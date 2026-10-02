'use strict';
/*
 * 搜索面板自检（不需要启动界面）：
 *   node dev/test-search.js
 * 用最小 DOM 桩加载真实的 util / store / dialogs / calendar / app 代码，直接驱动
 * 搜索框，验证：逾期在前、其余离今天从近到远、正文也能搜到、大小写不敏感、
 * 已完成按设置过滤、上下键选择、Enter / 点击跳转到任务所在周。
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

function makeEl(tag) {
  const classes = new Set();
  const node = {
    tagName: String(tag).toUpperCase(),
    children: [],
    parentNode: null,
    style: { setProperty: function () {} },
    dataset: {},
    _handlers: {},
    hidden: false,
    disabled: false,
    value: '',
    type: '',
    title: '',
    placeholder: '',
    textContent: '',
    isConnected: true,
    classList: {
      add: function () { for (const c of arguments) classes.add(c); },
      remove: function () { for (const c of arguments) classes.delete(c); },
      toggle: function (c, on) {
        if (on === undefined) { classes.has(c) ? classes.delete(c) : classes.add(c); }
        else if (on) classes.add(c); else classes.delete(c);
      },
      contains: function (c) { return classes.has(c); }
    },
    appendChild: function (c) { c.parentNode = this; this.children.push(c); return c; },
    insertBefore: function (c) { c.parentNode = this; this.children.unshift(c); return c; },
    remove: function () {
      if (this.parentNode) {
        const i = this.parentNode.children.indexOf(this);
        if (i >= 0) this.parentNode.children.splice(i, 1);
        this.parentNode = null; this.isConnected = false;
      }
    },
    contains: function () { return false; },
    querySelector: function (sel) { return this.querySelectorAll(sel)[0] || null; },
    querySelectorAll: function (sel) {
      const out = [];
      const match = function (n) {
        if (sel.charAt(0) === '.') return n.classList.contains(sel.slice(1));
        return n.tagName === sel.toUpperCase();
      };
      const walk = function (n) { n.children.forEach(function (c) { if (match(c)) out.push(c); walk(c); }); };
      walk(this);
      return out;
    },
    addEventListener: function (t, fn) { (this._handlers[t] = this._handlers[t] || []).push(fn); },
    removeEventListener: function () {},
    getBoundingClientRect: function () { return { top: 0, left: 0, right: 0, bottom: 46, width: 240, height: 28 }; },
    focus: function () {}, select: function () {}, blur: function () { this.blurred = true; },
    setAttribute: function () {}, getAttribute: function () { return null; }, closest: function () { return null; },
    scrollIntoView: function () { this.scrolledIntoView = true; },
    fire: function (type, extra) {
      const ev = Object.assign({
        target: this, preventDefault: function () {}, stopPropagation: function () {}
      }, extra || {});
      (this._handlers[type] || []).slice().forEach(function (fn) { fn(ev); });
    }
  };
  Object.defineProperty(node, 'className', {
    get: function () { return Array.from(classes).join(' '); },
    set: function (v) { classes.clear(); String(v).split(/\s+/).filter(Boolean).forEach(function (c) { classes.add(c); }); }
  });
  Object.defineProperty(node, 'innerHTML', {
    get: function () { return ''; },
    set: function () {
      this.children.forEach(function (c) { c.parentNode = null; c.isConnected = false; });
      this.children = [];
    }
  });
  return node;
}

const byId = {};
const documentStub = {
  documentElement: makeEl('html'),
  body: makeEl('body'),
  createElement: function (t) { return makeEl(t); },
  createElementNS: function (ns, t) { return makeEl(t); },
  createTextNode: function (t) { const n = makeEl('#text'); n.textContent = t; return n; },
  getElementById: function (id) { if (!byId[id]) byId[id] = makeEl('div'); return byId[id]; },
  querySelector: function (sel) { return documentStub.body.querySelector(sel); },
  querySelectorAll: function (sel) { return documentStub.body.querySelectorAll(sel); },
  addEventListener: function () {},
  removeEventListener: function () {}
};

global.window = global;
global.document = documentStub;
global.localStorage = { getItem: function () { return null; }, setItem: function () {} };
global.addEventListener = function () {};
global.removeEventListener = function () {};
window.innerWidth = 1400;
window.innerHeight = 900;

function run(file) {
  const code = fs.readFileSync(path.join(ROOT, file), 'utf8');
  new Function('window', 'document', 'localStorage', code)(global.window, documentStub, global.localStorage);
}

function ymd(offset) { return Util.ymd(Util.addDays(new Date(), offset)); }

run('src/js/util.js');
run('src/js/store.js');

const TASKS = [
  { id: 'a', listId: 'a', title: '逾期十天', date: ymd(-10), start: 540, end: 600, allDay: false, done: false, note: '测试词' },
  { id: 'b', listId: 'a', title: '逾期一天', date: ymd(-1), start: 600, end: 660, allDay: false, done: false, note: '测试词' },
  { id: 'c', listId: 'a', title: '逾期五天', date: ymd(-5), start: 480, end: 540, allDay: false, done: false, note: '测试词' },
  { id: 'd', listId: 'a', title: '五天后', date: ymd(5), start: 600, end: 660, allDay: false, done: false, note: '测试词' },
  { id: 'e', listId: 'a', title: '明天事', date: ymd(1), start: 540, end: 600, allDay: false, done: false, note: '测试词' },
  { id: 'f', listId: 'a', title: '今天定时', date: ymd(0), start: 600, end: 660, allDay: false, done: false, note: '测试词' },
  { id: 'g', listId: 'a', title: '今天全天', date: ymd(0), start: 0, end: 0, allDay: true, done: false, note: '测试词' },
  { id: 'h', listId: 'a', title: '已完成', date: ymd(2), start: 540, end: 600, allDay: false, done: true, note: '测试词' },
  { id: 'i', listId: 'a', title: '无标记标题', date: ymd(3), start: 540, end: 600, allDay: false, done: false, note: '包含 特殊关键词' },
  { id: 'j', listId: 'a', title: 'Review Meeting', date: ymd(4), start: 600, end: 660, allDay: false, done: false, note: '' }
];

Store.data = {
  version: 1,
  lists: [{ id: 'a', name: '工作', color: '#4C7DFA' }],
  tasks: TASKS,
  deadlines: [],
  settings: { showDone: false, dayStart: 480, dayEnd: 1320, snap: 5, weekStart: 1 }
};
const calls = { persist: 0, calendar: 0, toolbar: 0 };
Store.persist = function () { calls.persist++; };

run('src/js/dialogs.js');
run('src/js/calendar.js');
run('src/js/app.js');
Calendar.render = function () { calls.calendar++; };
Toolbar.render = function () { calls.toolbar++; };

const results = [];
function check(name, ok, extra) {
  results.push(ok);
  console.log((ok ? '  ✓ ' : '  ✗ ') + name + (extra ? '   [' + extra + ']' : ''));
}

function itemTitles() {
  return SearchPanel.el.querySelectorAll('.sp-title').map(function (n) { return n.textContent; });
}
function itemIds() {
  return SearchPanel.items.map(function (t) { return t.id; });
}
function labelTexts() {
  return SearchPanel.el.querySelectorAll('.sp-label').map(function (n) { return n.textContent; });
}

(function main() {
  Toolbar.init();
  SearchPanel.init();

  const search = documentStub.getElementById('search');

  console.log('【排序】');
  check('初始没有查询时面板隐藏', !SearchPanel.isOpen() || SearchPanel.el.hidden);

  search.value = '测试词';
  search.fire('input');
  check('输入后浮层打开', SearchPanel.isOpen());
  check('命中 7 条（已完成默认被排除）', SearchPanel.items.length === 7, String(SearchPanel.items.length));
  check('逾期在前，且最近逾期的最先', itemIds().slice(0, 3).join(',') === 'b,c,a', itemIds().join(','));
  check('其余按离今天从近到远', itemIds().slice(3).join(',') === 'g,f,e,d', itemIds().slice(3).join(','));
  check('同一天全天排在定时任务前面', itemIds().indexOf('g') < itemIds().indexOf('f'));
  check('逾期分组标签只有一个', labelTexts().length === 1 && labelTexts()[0] === '已逾期', labelTexts().join(','));
  const firstMeta = SearchPanel.el.querySelectorAll('.sp-meta')[0];
  check('逾期条目显示逾期天数', !!firstMeta && firstMeta.textContent.indexOf('逾期1天') >= 0, firstMeta ? firstMeta.textContent : '');

  search.value = 'review';
  search.fire('input');
  check('搜索大小写不敏感', SearchPanel.items.length === 1 && SearchPanel.items[0].id === 'j', itemTitles().join(','));

  search.value = '特殊关键词';
  search.fire('input');
  check('正文（备忘录内容）里的词也能搜到', SearchPanel.items.length === 1 && SearchPanel.items[0].id === 'i', itemTitles().join(','));

  Store.settings.showDone = true;
  search.value = '测试词';
  search.fire('input');
  check('勾选显示已完成时会包含已完成任务', SearchPanel.items.length === 8 && itemIds().indexOf('h') >= 0, itemIds().join(','));
  Store.settings.showDone = false;
  search.fire('input');

  search.value = '不存在的东西';
  search.fire('input');
  check('没有结果时显示空状态', SearchPanel.items.length === 0 && !!SearchPanel.el.querySelector('.sp-empty'));
  check('没有结果时浮层保持打开', SearchPanel.isOpen());

  search.value = '';
  search.fire('input');
  check('清空查询后浮层收起', !SearchPanel.isOpen());

  console.log('\n【键盘操作】');
  search.value = '测试词';
  search.fire('input');
  check('打开后默认选中第 1 条', SearchPanel.selected === 0);
  search.fire('keydown', { key: 'ArrowDown' });
  check('↓ 选中下一条', SearchPanel.selected === 1, String(SearchPanel.selected));
  search.fire('keydown', { key: 'ArrowUp' });
  search.fire('keydown', { key: 'ArrowUp' });
  check('↑ 到头会循环到最后一条', SearchPanel.selected === 6, String(SearchPanel.selected));

  const target = SearchPanel.items[SearchPanel.selected];
  calls.calendar = 0; calls.toolbar = 0;
  search.fire('keydown', { key: 'Enter' });
  check('Enter 跳转后面板收起', !SearchPanel.isOpen());
  check('Enter 跳转后日历切到那一周', Store.ui.anchor === target.date, Store.ui.anchor + ' vs ' + target.date);
  check('Enter 跳转后视图为周视图', Store.ui.view === 'week');
  check('Enter 跳转后触发日历重绘', calls.calendar > 0 && calls.toolbar > 0, 'calendar ' + calls.calendar + ' / toolbar ' + calls.toolbar);
  check('跳转后搜索框失焦', search.blurred === true);

  search.blurred = false;
  search.value = '测试词';
  search.fire('input');
  search.fire('keydown', { key: 'Escape' });
  check('Esc 清空查询并收起面板', search.value === '' && Store.ui.search === '' && !SearchPanel.isOpen());

  console.log('\n【点击跳转】');
  Store.ui.view = 'day';
  Store.ui.anchor = Util.today();
  search.value = '测试词';
  search.fire('input');
  const row2 = SearchPanel.el.querySelectorAll('.sp-item')[2];
  calls.persist = 0;
  row2.fire('click');
  const expectedAnchor = Store.data.tasks.find(function (t) { return t.id === 'a'; }).date;
  check('点击结果跳到该任务所在周', Store.ui.anchor === expectedAnchor, Store.ui.anchor + ' vs ' + expectedAnchor);
  check('日视图下点击结果会自动切回周视图', Store.ui.view === 'week' && Store.data.settings.view === 'week');
  check('视图切换会落盘保存', calls.persist > 0, String(calls.persist));
  check('点击跳转后面板收起', !SearchPanel.isOpen());

  finish();
})();

function finish() {
  const failed = results.filter(function (x) { return !x; }).length;
  console.log('\n' + (failed ? '❌ 失败 ' + failed + ' 项' : '✅ 全部通过（' + results.length + ' 项）'));
  process.exit(failed ? 1 : 0);
}
