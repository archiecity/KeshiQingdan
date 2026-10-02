(function () {
  'use strict';

  const PALETTE = ['#4C7DFA', '#F0827E', '#F5A65B', '#3FBF8F', '#9B6CF5', '#2BB8C4', '#EC6FA8', '#8A94A6'];

  const DEFAULT_SETTINGS = {
    theme: 'light',
    weekStart: 1,
    hourHeight: 56,
    showDone: true,
    snap: 5,
    snapV: 2,
    view: 'week',
    dayStart: 480,
    dayEnd: 1320
  };

  function seedData() {
    return {
      version: 1,
      lists: [
        { id: 'work', name: '工作', color: PALETTE[0] },
        { id: 'life', name: '生活', color: PALETTE[3] }
      ],
      tasks: [],
      deadlines: [],
      settings: Object.assign({}, DEFAULT_SETTINGS)
    };
  }

  const Store = {
    data: null,
    dataDir: '',
    dataFile: '',
    history: [],
    listeners: [],

    ui: {
      view: 'week',
      anchor: Util.today(),
      filterListId: null,
      search: ''
    },

    /* ------------------------------ 生命周期 ------------------------------ */

    async init() {
      let loaded = null;
      if (window.desktop) {
        const res = await window.desktop.load();
        loaded = res && res.data;
        this.dataDir = (res && res.dataDir) || '';
        this.dataFile = (res && res.dataFile) || '';
      } else {
        try {
          const raw = localStorage.getItem('focus-list-data');
          loaded = raw ? JSON.parse(raw) : null;
        } catch (e) {
          loaded = null;
        }
      }

      if (loaded && Array.isArray(loaded.tasks) && Array.isArray(loaded.lists)) {
        this.data = loaded;
        if (!Array.isArray(this.data.deadlines)) this.data.deadlines = [];
        const saved = loaded.settings || {};
        this.data.settings = Object.assign({}, DEFAULT_SETTINGS, saved);
        /* 老版本默认吸附是 15 分钟，升级后统一改用新的 5 分钟默认档（只做一次） */
        if (saved.snapV !== DEFAULT_SETTINGS.snapV) {
          this.data.settings.snap = DEFAULT_SETTINGS.snap;
          this.data.settings.snapV = DEFAULT_SETTINGS.snapV;
          this.persist();
        }
      } else {
        this.data = seedData();
        this.persistNow();
      }
      this.ui.view = this.data.settings.view === 'day' ? 'day' : 'week';
      return this.data;
    },

    persistNow() {
      const payload = Util.clone(this.data);
      if (window.desktop) {
        window.desktop.save(payload).then((r) => {
          if (r && r.ok === false) Toast.show('保存失败：' + (r.error || '未知错误'), 'error');
        });
      } else {
        try {
          localStorage.setItem('focus-list-data', JSON.stringify(payload));
        } catch (e) { /* 忽略 */ }
      }
    },

    persist: null,

    snapshot() {
      this.history.push(Util.clone(this.data));
      if (this.history.length > 60) this.history.shift();
    },

    undo() {
      const prev = this.history.pop();
      if (!prev) {
        Toast.show('没有可撤销的操作');
        return false;
      }
      this.data = prev;
      this.persist.flush();
      this.emit();
      Toast.show('已撤销');
      return true;
    },

    on(fn) {
      this.listeners.push(fn);
    },

    emit() {
      this.listeners.forEach((fn) => fn());
    },

    commit(snapshot) {
      if (snapshot !== false) this.snapshot();
      this.persist();
      this.emit();
    },

    /* -------------------------------- 设置 -------------------------------- */

    get settings() {
      return this.data.settings;
    },

    setSetting(key, value) {
      this.snapshot();
      this.data.settings[key] = value;
      this.persist();
      this.emit();
    },

    /* 用外部数据整体替换（导入 JSON / 恢复备份） */
    replaceData(data) {
      const next = Util.clone(data);
      if (!Array.isArray(next.deadlines)) next.deadlines = [];
      next.settings = Object.assign({}, DEFAULT_SETTINGS, next.settings || {});
      if (next.settings.snapV !== DEFAULT_SETTINGS.snapV) {
        next.settings.snap = DEFAULT_SETTINGS.snap;
        next.settings.snapV = DEFAULT_SETTINGS.snapV;
      }
      this.snapshot();
      this.data = next;
      this.ui.view = next.settings.view === 'day' ? 'day' : 'week';
      this.persistNow();
      this.emit();
    },

    /* -------------------------------- 清单 -------------------------------- */

    listById(id) {
      const found = this.data.lists.find((l) => l.id === id);
      return found || this.data.lists[0] || { id: 'inbox', name: '收集箱', color: PALETTE[0] };
    },

    /* 新建任务的默认清单：侧边栏筛选优先，其次记住上一次用过的清单 */
    defaultListId() {
      const settings = this.data.settings || {};
      const ids = this.data.lists.map((l) => l.id);
      const cand = this.ui.filterListId || settings.lastListId;
      return cand && ids.indexOf(cand) >= 0 ? cand : this.data.lists[0].id;
    },

    addList(name, color) {
      const list = {
        id: Util.uid(),
        name: name || '新清单',
        color: color || PALETTE[this.data.lists.length % PALETTE.length]
      };
      this.snapshot();
      this.data.lists.push(list);
      this.persist();
      this.emit();
      return list;
    },

    updateList(id, patch) {
      const list = this.data.lists.find((l) => l.id === id);
      if (!list) return;
      this.snapshot();
      Object.assign(list, patch);
      this.persist();
      this.emit();
    },

    removeList(id) {
      if (this.data.lists.length <= 1) {
        Toast.show('至少要保留一个清单');
        return;
      }
      this.snapshot();
      this.data.lists = this.data.lists.filter((l) => l.id !== id);
      const fallback = this.data.lists[0].id;
      this.data.tasks.forEach((t) => {
        if (t.listId === id) t.listId = fallback;
      });
      if (this.ui.filterListId === id) this.ui.filterListId = null;
      this.persist();
      this.emit();
    },

    countByList(listId) {
      return this.data.tasks.filter((t) => t.listId === listId && !t.done).length;
    },

    /* 调整清单顺序：把 id 移到 beforeId 前面（beforeId 为空表示移到最后） */
    moveList(id, beforeId) {
      const lists = this.data.lists;
      const from = lists.findIndex((l) => l.id === id);
      if (from < 0 || id === beforeId) return;
      const next = lists.slice();
      const item = next.splice(from, 1)[0];
      let to = beforeId ? next.findIndex((l) => l.id === beforeId) : -1;
      if (to < 0) to = next.length;
      next.splice(to, 0, item);
      let same = true;
      for (let i = 0; i < next.length; i++) {
        if (next[i].id !== lists[i].id) { same = false; break; }
      }
      if (same) return;
      this.snapshot();
      this.data.lists = next;
      this.persist();
      this.emit();
    },

    /* ------------------------------ 死亡线 ------------------------------ */

    /* 按截止日期从近到远排序 */
    deadlinesSorted() {
      return this.data.deadlines.slice().sort((a, b) => (a.due < b.due ? -1 : a.due > b.due ? 1 : 0));
    },

    /* 距离截止还有几天：0 = 今天，负数 = 已逾期 */
    daysLeft(due) {
      const a = new Date(String(due) + 'T00:00:00');
      const b = new Date(Util.today() + 'T00:00:00');
      return Math.round((a - b) / 86400000);
    },

    deadlineById(id) {
      return this.data.deadlines.find((d) => d.id === id) || null;
    },

    addDeadline(partial) {
      const item = Object.assign({
        id: Util.uid(),
        title: '重要截止日',
        due: Util.today(),
        createdAt: Date.now()
      }, partial);
      this.snapshot();
      this.data.deadlines.push(item);
      this.persist();
      this.emit();
      return item;
    },

    updateDeadline(id, patch) {
      const item = this.deadlineById(id);
      if (!item) return null;
      this.snapshot();
      Object.assign(item, patch);
      this.persist();
      this.emit();
      return item;
    },

    removeDeadline(id) {
      if (!this.deadlineById(id)) return;
      this.snapshot();
      this.data.deadlines = this.data.deadlines.filter((d) => d.id !== id);
      this.persist();
      this.emit();
    },

    /* -------------------------------- 任务 -------------------------------- */

    tasksOn(dateStr) {
      return this.data.tasks
        .filter((t) => t.date === dateStr && !t.allDay)
        .sort((a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start));
    },

    allDayOn(dateStr) {
      return this.data.tasks.filter((t) => t.date === dateStr && t.allDay);
    },

    taskById(id) {
      return this.data.tasks.find((t) => t.id === id) || null;
    },

    addTask(partial) {
      const now = Date.now();
      const task = Object.assign({
        id: Util.uid(),
        title: '新任务',
        note: '',
        listId: this.defaultListId(),
        date: Util.today(),
        start: 9 * 60,
        end: 10 * 60,
        allDay: false,
        done: false,
        doneAt: null,
        priority: 0,
        createdAt: now,
        updatedAt: now
      }, partial);
      this.snapshot();
      if (this.data.settings.lastListId !== task.listId) this.data.settings.lastListId = task.listId;
      this.data.tasks.push(task);
      this.persist();
      this.emit();
      return task;
    },

    updateTask(id, patch, snapshot, silent) {
      const task = this.taskById(id);
      if (!task) return null;
      const listChanged = patch.listId && patch.listId !== task.listId;
      if (snapshot !== false) this.snapshot();
      Object.assign(task, patch, { updatedAt: Date.now() });
      if (listChanged) this.data.settings.lastListId = patch.listId;
      this.persist();
      if (!silent) this.emit();
      return task;
    },

    removeTask(id) {
      this.snapshot();
      this.data.tasks = this.data.tasks.filter((t) => t.id !== id);
      this.persist();
      this.emit();
    },

    toggleDone(id) {
      const task = this.taskById(id);
      if (!task) return;
      this.snapshot();
      task.done = !task.done;
      task.doneAt = task.done ? Date.now() : null;
      task.updatedAt = Date.now();
      this.persist();
      this.emit();
    },

    duplicateTask(id, dateStr) {
      const t = this.taskById(id);
      if (!t) return null;
      const copy = Util.clone(t);
      copy.id = Util.uid();
      copy.done = false;
      copy.doneAt = null;
      copy.createdAt = Date.now();
      copy.updatedAt = Date.now();
      if (dateStr) copy.date = dateStr;
      this.snapshot();
      this.data.tasks.push(copy);
      this.persist();
      this.emit();
      return copy;
    },

    /* 今天 / 本周 待办数量 */
    stats() {
      const today = Util.today();
      const start = Util.startOfWeek(new Date(), this.settings.weekStart);
      const weekDays = [];
      for (let i = 0; i < 7; i++) weekDays.push(Util.ymd(Util.addDays(start, i)));
      return {
        todayTotal: this.data.tasks.filter((t) => t.date === today && !t.done).length,
        weekTotal: this.data.tasks.filter((t) => weekDays.indexOf(t.date) >= 0 && !t.done).length
      };
    }
  };

  Store.persist = Util.debounce(() => Store.persistNow(), 150);

  window.Store = Store;
  window.PALETTE = PALETTE;
})();
