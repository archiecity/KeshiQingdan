'use strict';
/*
 * 「死亡线」弹窗自检（不需要启动界面）：
 *   node dev/test-deadline-ui.js
 * 用最小 DOM 桩加载真实的 util / store / dialogs / app 代码，模拟点击侧栏「死亡线 +」，
 * 验证弹窗结构完整（曾经出现过只显示遮罩、弹窗盒子忘记挂上去的 bug），
 * 并走通 填写 → 确定 → 写入数据 的完整链路。
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
    getBoundingClientRect: function () { return { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 }; },
    focus: function () {}, select: function () {}, blur: function () {},
    setAttribute: function () {}, getAttribute: function () { return null; }, closest: function () { return null; },
    fire: function (type) {
      const ev = { target: this, preventDefault: function () {}, stopPropagation: function () {} };
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
  getElementById: function (id) { if (!byId[id]) byId[id] = makeEl('div'); return byId[id]; },
  querySelector: function (sel) { return documentStub.body.querySelector(sel) || byId.sidebar.querySelector(sel); },
  querySelectorAll: function (sel) { return documentStub.body.querySelectorAll(sel); },
  addEventListener: function () {},
  removeEventListener: function () {}
};

global.window = global;
global.document = documentStub;
global.localStorage = { getItem: function () { return null; }, setItem: function () {} };
global.addEventListener = function () {};
global.removeEventListener = function () {};

function run(file) {
  const code = fs.readFileSync(path.join(ROOT, file), 'utf8');
  new Function('window', 'document', 'localStorage', code)(global.window, documentStub, global.localStorage);
}

run('src/js/util.js');
run('src/js/store.js');
Store.data = { version: 1, lists: [{ id: 'a', name: '工作', color: '#4C7DFA' }], tasks: [], deadlines: [], settings: {} };
Store.persist = function () {};
run('src/js/dialogs.js');
run('src/js/app.js');

const results = [];
function check(name, ok, extra) {
  results.push(ok);
  console.log((ok ? '  ✓ ' : '  ✗ ') + name + (extra ? '   [' + extra + ']' : ''));
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async function main() {
  Dialogs.init();
  Sidebar.init();
  Sidebar.render();

  const plus = byId.sidebar.querySelectorAll('button').find(function (b) { return b.title === '添加倒计时'; });
  check('侧栏有「死亡线」区块', !!byId.sidebar.querySelector('.side-deadlines'));
  check('侧栏有「死亡线 +」按钮', !!plus, plus ? plus.title : '没找到');
  const listScroll = byId.sidebar.querySelector('.list-scroll');
  check('清单区域有独立滚动容器', !!listScroll);
  check('清单条目都放在滚动容器里', !!listScroll && listScroll.querySelectorAll('.nav-item').length === Store.data.lists.length,
    listScroll ? String(listScroll.querySelectorAll('.nav-item').length) + ' / ' + Store.data.lists.length : '没有容器');
  const kids = byId.sidebar.children;
  const dlIdx = kids.findIndex(function (n) { return n.classList.contains('side-deadlines'); });
  const listIdx = kids.findIndex(function (n) { return n.classList.contains('side-lists'); });
  check('死亡线排在清单前面', dlIdx >= 0 && listIdx >= 0 && dlIdx < listIdx, '死亡线 #' + dlIdx + ' / 清单 #' + listIdx);
  if (!plus) return finish();

  plus.fire('click');
  await sleep(20);

  const mask = documentStub.body.querySelector('.mask');
  check('点击后出现遮罩', !!mask);
  const box = mask ? mask.querySelector('.confirm') : null;
  check('遮罩里真的有弹窗盒子（这次 bug 的根源）', !!box);
  if (!box) return finish();

  const inputs = box.querySelectorAll('input');
  const titleInput = inputs.find(function (i) { return i.type === 'text'; });
  const dateInput = inputs.find(function (i) { return i.type === 'date'; });
  const buttons = box.querySelectorAll('button');
  const ok = buttons.find(function (b) { return b.textContent === '确定'; });
  check('弹窗里有标题输入框', !!titleInput);
  check('弹窗里有截止日期输入框', !!dateInput, dateInput ? dateInput.value : '');
  check('确定按钮初始禁用', !!ok && ok.disabled === true);
  if (!titleInput || !dateInput || !ok) return finish();

  titleInput.value = '高考';
  titleInput.fire('input');
  dateInput.value = '2027-06-07';
  dateInput.fire('input');
  check('填好后确定按钮可用', ok.disabled === false);

  ok.fire('click');
  await sleep(20);

  check('确定后弹窗关闭', !documentStub.body.querySelector('.mask'));
  check('数据已写入死亡线', Store.data.deadlines.length === 1 && Store.deadlineById(Store.data.deadlines[0].id).title === '高考',
    JSON.stringify(Store.data.deadlines));
  check('剩余天数计算正确', Store.daysLeft('2027-06-07') > 200, String(Store.daysLeft('2027-06-07')));

  console.log('\n【编辑 / 删除】');
  Sidebar.render();
  const item = byId.sidebar.querySelector('.dl-item');
  check('侧栏出现死亡线条目', !!item, item ? item.title : '');
  if (!item) return finish();

  item.fire('click');
  await sleep(20);
  let masks = documentStub.body.querySelectorAll('.mask');
  const editBox = masks.length ? masks[masks.length - 1].querySelector('.confirm') : null;
  check('点击条目打开编辑窗', !!editBox);
  const delBtn = editBox ? editBox.querySelectorAll('button').find(function (b) {
    return b.querySelectorAll('span').some(function (s) { return s.textContent === '删除'; });
  }) : null;
  check('编辑窗里有明显的删除按钮', !!delBtn);
  if (!delBtn) return finish();

  delBtn.fire('click');
  await sleep(20);
  masks = documentStub.body.querySelectorAll('.mask');
  check('删除前先弹确认框', masks.length === 2, '遮罩数量 ' + masks.length);
  const confirmBox = masks[masks.length - 1].querySelector('.confirm');
  const confirmDel = confirmBox ? confirmBox.querySelectorAll('button').find(function (b) { return b.textContent === '删除'; }) : null;
  check('确认框有删除按钮', !!confirmDel);
  if (confirmDel) confirmDel.fire('click');
  await sleep(20);

  check('确认后数据被删除', Store.data.deadlines.length === 0, '剩 ' + Store.data.deadlines.length + ' 条');
  check('删除后弹窗全部关闭', documentStub.body.querySelectorAll('.mask').length === 0);

  finish();
})();

function finish() {
  const failed = results.filter(function (x) { return !x; }).length;
  console.log('\n' + (failed ? '❌ 失败 ' + failed + ' 项' : '✅ 全部通过（' + results.length + ' 项）'));
  process.exit(failed ? 1 : 0);
}
