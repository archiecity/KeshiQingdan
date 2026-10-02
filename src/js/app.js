(function () {
  'use strict';

  const el = Util.el;
  const svg = Util.svg;

  function navItem(opts) {
    const node = el('div', 'nav-item' + (opts.on ? ' on' : ''));
    const ico = el('span', 'ico');
    if (opts.dot) {
      const dot = el('span', 'dot');
      dot.style.background = opts.dot;
      ico.appendChild(dot);
    } else if (opts.icon) {
      ico.appendChild(svg(opts.icon, 16));
    }
    node.appendChild(ico);
    node.appendChild(el('span', 'label', opts.label));
    if (opts.count != null) node.appendChild(el('span', 'count', String(opts.count)));
    if (opts.more) {
      const more = el('span', 'more');
      more.appendChild(svg(Util.ICONS.down, 14));
      more.addEventListener('click', (e) => {
        e.stopPropagation();
        const rect = more.getBoundingClientRect();
        opts.more(rect.left, rect.bottom + 4, more);
      });
      node.appendChild(more);
    }
    if (opts.onClick) node.addEventListener('click', opts.onClick);
    if (opts.onContext) node.addEventListener('contextmenu', (e) => { e.preventDefault(); opts.onContext(e.clientX, e.clientY); });
    return node;
  }

  const Sidebar = {
    host: null,
    suppressClick: false,

    init() {
      this.host = document.getElementById('sidebar');
    },

    render() {
      const host = this.host;
      const stats = Store.stats();
      const ui = Store.ui;
      host.innerHTML = '';

      const group = el('div', 'side-group');
      group.appendChild(navItem({
        icon: Util.ICONS.calendar,
        label: '今天',
        count: stats.todayTotal,
        onClick: () => App.gotoToday()
      }));
      group.appendChild(navItem({
        icon: Util.ICONS.target,
        label: '本周',
        count: stats.weekTotal,
        onClick: () => App.gotoThisWeek()
      }));
      group.appendChild(navItem({
        icon: Util.ICONS.inbox,
        label: '全部任务',
        count: Store.data.tasks.filter((t) => !t.done).length,
        on: !ui.filterListId,
        onClick: () => { Store.ui.filterListId = null; Store.emit(); }
      }));
      host.appendChild(group);

      host.appendChild(el('div', 'side-sep'));

      const listGroup = el('div', 'side-group side-lists');
      const title = el('div', 'side-title');
      title.appendChild(el('span', null, '清单'));
      const addBtn = el('button');
      addBtn.title = '新建清单';
      addBtn.appendChild(svg(Util.ICONS.plus, 15));
      addBtn.addEventListener('click', async () => {
        const name = await Dialogs.prompt({ title: '新建清单', placeholder: '例如：工作、学习、副业', value: '' });
        if (name) Store.addList(name);
      });
      title.appendChild(addBtn);
      listGroup.appendChild(title);

      const listScroll = el('div', 'list-scroll');
      Store.data.lists.forEach((list) => {
        const item = navItem({
          dot: list.color,
          label: list.name,
          count: Store.countByList(list.id),
          on: ui.filterListId === list.id,
          onClick: () => {
            if (this.suppressClick) return;
            Store.ui.filterListId = ui.filterListId === list.id ? null : list.id;
            Store.emit();
          },
          more: (x, y, owner) => Dialogs.listMenu(list, x, y, owner),
          onContext: (x, y) => Dialogs.listMenu(list, x, y)
        });
        this.bindDrag(item, list);
        listScroll.appendChild(item);
      });
      listGroup.appendChild(listScroll);

      /* 死亡线：重要截止日的倒计时 */
      const dlGroup = el('div', 'side-group side-deadlines');
      const dlTitle = el('div', 'side-title');
      dlTitle.appendChild(el('span', null, '死亡线'));
      const dlAdd = el('button');
      dlAdd.title = '添加倒计时';
      dlAdd.appendChild(svg(Util.ICONS.plus, 15));
      dlAdd.addEventListener('click', async () => {
        const res = await Dialogs.deadlinePrompt({});
        if (res) { Store.addDeadline(res); Toast.show('已加入死亡线'); }
      });
      dlTitle.appendChild(dlAdd);
      dlGroup.appendChild(dlTitle);

      const dlList = el('div', 'dl-list');
      const deadlines = Store.deadlinesSorted();
      if (!deadlines.length) {
        dlList.appendChild(el('div', 'dl-empty', '重要的截止日放在这里'));
      }
      deadlines.forEach((dl) => {
        const days = Store.daysLeft(dl.due);
        const node = el('div', 'dl-item');
        if (days < 0) node.classList.add('overdue');
        else if (days <= 7) node.classList.add('soon');
        const num = el('div', 'dl-num');
        num.appendChild(el('b', null, String(days)));
        num.appendChild(el('i', null, '天'));
        node.appendChild(num);
        node.appendChild(el('div', 'dl-name', dl.title));
        node.title = dl.title + '｜' + dl.due + '｜' +
          (days < 0 ? '已逾期 ' + (-days) + ' 天' : (days === 0 ? '就是今天' : '还剩 ' + days + ' 天'));
        node.addEventListener('click', async () => {
          const res = await Dialogs.deadlinePrompt({ title: '编辑死亡线', name: dl.title, due: dl.due, id: dl.id });
          if (res) Store.updateDeadline(dl.id, res);
        });
        node.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          Dialogs.deadlineMenu(dl, e.clientX, e.clientY, node);
        });
        dlList.appendChild(node);
      });
      dlGroup.appendChild(dlList);
      host.appendChild(dlGroup);

      host.appendChild(el('div', 'side-sep'));
      host.appendChild(listGroup);

      const foot = el('div', 'side-foot');
      const switchRow = el('div', 'switch-row');
      switchRow.appendChild(el('span', 'label', '显示已完成'));
      const sw = el('div', 'switch' + (Store.settings.showDone ? ' on' : ''));
      sw.addEventListener('click', () => Store.setSetting('showDone', !Store.settings.showDone));
      switchRow.appendChild(sw);
      switchRow.addEventListener('click', (e) => {
        if (!sw.contains(e.target)) Store.setSetting('showDone', !Store.settings.showDone);
      });
      foot.appendChild(switchRow);

      const undoRow = el('div', 'switch-row');
      undoRow.appendChild(el('span', 'label', '撤销上一步（Ctrl+Z）'));
      undoRow.addEventListener('click', () => Store.undo());
      foot.appendChild(undoRow);
      host.appendChild(foot);
    },

    /* 上下拖动清单，调整它们的顺序 */
    bindDrag(item, list) {
      item.dataset.listId = list.id;
      item.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        if (e.target.closest('.more')) return;
        item.setPointerCapture && item.setPointerCapture(e.pointerId);
        this.suppressClick = false;
        const startY = e.clientY;
        let dragging = false;
        let beforeId = null;

        const rows = () => Array.from(this.host.querySelectorAll('.nav-item[data-list-id]'));
        const clearMarks = () => rows().forEach((row) => row.classList.remove('drop-before', 'drop-after'));

        const paint = (ev) => {
          let target = null;
          for (const row of rows()) {
            const r = row.getBoundingClientRect();
            if (ev.clientY < r.top + r.height / 2) { target = row; break; }
          }
          clearMarks();
          if (target && target !== item) {
            target.classList.add('drop-before');
          } else if (!target) {
            const all = rows();
            const last = all[all.length - 1];
            if (last && last !== item) last.classList.add('drop-after');
          }
          beforeId = target ? target.dataset.listId : null;
        };

        const move = (ev) => {
          if (!dragging && Math.abs(ev.clientY - startY) < 5) return;
          if (!dragging) { dragging = true; item.classList.add('list-dragging'); }
          paint(ev);
        };

        const up = () => {
          window.removeEventListener('pointermove', move);
          window.removeEventListener('pointerup', up);
          clearMarks();
          item.classList.remove('list-dragging');
          if (!dragging) return;
          this.suppressClick = true;
          setTimeout(() => { this.suppressClick = false; }, 60);
          Store.moveList(list.id, beforeId);
        };

        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
      });
    }
  };

  const Toolbar = {
    rangeEl: null,

    init() {
      this.rangeEl = document.getElementById('rangeLabel');

      const prevBtn = document.getElementById('btnPrev');
      prevBtn.appendChild(svg(Util.ICONS.left, 18));
      const nextBtn = document.getElementById('btnNext');
      nextBtn.appendChild(svg(Util.ICONS.right, 18));
      const newBtn = document.getElementById('btnNew');
      newBtn.appendChild(svg(Util.ICONS.plus, 15));
      newBtn.appendChild(el('span', null, '新建任务'));
      const searchBox = document.getElementById('searchBox');
      searchBox.insertBefore(svg(Util.ICONS.search, 15), searchBox.firstChild);
      document.getElementById('btnPrev').addEventListener('click', () => App.shift(-1));
      document.getElementById('btnNext').addEventListener('click', () => App.shift(1));
      document.getElementById('btnToday').addEventListener('click', () => App.gotoToday());
      document.getElementById('btnNew').addEventListener('click', (e) => App.newTask(e.currentTarget));

      document.querySelectorAll('#viewSeg button').forEach((btn) => {
        btn.addEventListener('click', () => {
          const view = btn.dataset.view;
          if (Store.ui.view === view) return;
          Store.ui.view = view;
          Store.setSetting('view', view);
          Calendar.render({ focus: true });
          Toolbar.render();
        });
      });

      const search = document.getElementById('search');
      search.addEventListener('input', () => {
        Store.ui.search = search.value.trim();
        Calendar.render();
        SearchPanel.selected = 0;
        SearchPanel.update(Store.ui.search);
      });
      search.addEventListener('focus', () => {
        if (Store.ui.search) {
          SearchPanel.selected = 0;
          SearchPanel.update(Store.ui.search);
        }
      });
      search.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          search.value = '';
          Store.ui.search = '';
          Calendar.render();
          search.blur();
          SearchPanel.hide();
          return;
        }
        if (!SearchPanel.isOpen()) return;
        if (e.key === 'ArrowDown') { e.preventDefault(); SearchPanel.move(1); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); SearchPanel.move(-1); }
        else if (e.key === 'Enter') { e.preventDefault(); SearchPanel.enter(); }
      });
    },

    render() {
      const anchor = Util.parseYmd(Store.ui.anchor);
      const weekStart = Util.startOfWeek(anchor, Store.settings.weekStart);
      let text;
      if (Store.ui.view === 'day') {
        text = Util.cnDateFull(anchor);
      } else {
        const end = Util.addDays(weekStart, 6);
        const sameMonth = weekStart.getMonth() === end.getMonth();
        text = weekStart.getFullYear() + '年' + (weekStart.getMonth() + 1) + '月' + weekStart.getDate() + '日 – ' +
          (sameMonth ? '' : (end.getMonth() + 1) + '月') + end.getDate() + '日';
      }
      this.rangeEl.innerHTML = '';
      this.rangeEl.appendChild(document.createTextNode(text));
      const week = el('small', null, Store.ui.view === 'day' ? '' : ('第 ' + App.isoWeek(weekStart) + ' 周'));
      this.rangeEl.appendChild(week);

      document.querySelectorAll('#viewSeg button').forEach((btn) => {
        btn.classList.toggle('on', btn.dataset.view === Store.ui.view);
      });
    }
  };

  /* ============================== 搜索面板 ============================== */

  const SearchPanel = {
    el: null,
    query: '',
    items: [],
    selected: 0,

    init() {
      document.addEventListener('pointerdown', (e) => {
        if (!this.isOpen()) return;
        if (this.el.contains(e.target)) return;
        const inBox = e.target && e.target.closest && e.target.closest('#searchBox');
        if (!inBox) this.hide();
      });
    },

    ensure() {
      if (this.el) return this.el;
      const panel = el('div', 'search-panel');
      panel.hidden = true;
      document.body.appendChild(panel);
      this.el = panel;
      return panel;
    },

    isOpen() {
      return !!(this.el && !this.el.hidden);
    },

    /* 排序：逾期的最前（最近过期在前），其余按离今天从近到远 */
    results(query) {
      const q = query.toLowerCase();
      const showDone = !!Store.settings.showDone;
      const today = Util.today();
      return Store.data.tasks
        .filter((t) => showDone || !t.done)
        .filter((t) => (t.title + ' ' + (t.note || '')).toLowerCase().indexOf(q) >= 0)
        .sort((a, b) => {
          const oa = a.date < today;
          const ob = b.date < today;
          if (oa !== ob) return oa ? -1 : 1;
          if (a.date !== b.date) return oa ? (a.date > b.date ? -1 : 1) : (a.date < b.date ? -1 : 1);
          if (!!a.allDay !== !!b.allDay) return a.allDay ? -1 : 1;
          return (a.start || 0) - (b.start || 0);
        });
    },

    meta(task) {
      const d = Util.parseYmd(task.date);
      const days = Store.daysLeft(task.date);
      const away = days < 0 ? '逾期' + (-days) + '天' : days === 0 ? '今天' : days === 1 ? '明天' : days + '天后';
      return Util.cnDate(d) + ' ' + Util.WEEKDAYS[d.getDay()] + ' · ' + away;
    },

    update(query) {
      this.query = query;
      if (!query) { this.hide(); return; }
      this.items = this.results(query);
      if (this.selected >= this.items.length) this.selected = Math.max(0, this.items.length - 1);
      this.render();
      this.show();
    },

    render() {
      const panel = this.ensure();
      panel.innerHTML = '';
      panel.appendChild(el('div', 'sp-head',
        this.items.length ? '找到 ' + this.items.length + ' 条 · ↑↓ 选择 · Enter 跳转' : '搜索任务'));

      if (!this.items.length) {
        panel.appendChild(el('div', 'sp-empty', '没有找到「' + this.query + '」'));
        return;
      }

      const today = Util.today();
      let overdueLabeled = false;
      this.items.forEach((task, i) => {
        if (!overdueLabeled && task.date < today) {
          overdueLabeled = true;
          panel.appendChild(el('div', 'sp-label', '已逾期'));
        }
        const row = el('div', 'sp-item' + (i === this.selected ? ' on' : '') + (task.done ? ' done' : ''));
        const dot = el('span', 'dot');
        dot.style.background = Store.listById(task.listId).color;
        row.appendChild(dot);
        row.appendChild(el('span', 'sp-title', task.title));
        if ((task.note || '').trim()) {
          const flag = el('span', 'sp-note');
          flag.appendChild(svg(Util.ICONS.note, 11));
          row.appendChild(flag);
        }
        row.appendChild(el('span', 'sp-meta', this.meta(task)));
        row.addEventListener('click', () => this.jump(task));
        panel.appendChild(row);
      });
    },

    show() {
      const panel = this.ensure();
      const box = document.getElementById('searchBox').getBoundingClientRect();
      const width = Math.max(380, Math.round(box.width));
      panel.style.width = width + 'px';
      panel.style.left = Util.clamp(Math.round(box.left), 12, Math.max(12, window.innerWidth - width - 12)) + 'px';
      panel.style.top = Math.round(box.bottom + 6) + 'px';
      panel.hidden = false;
    },

    hide() {
      if (this.el) this.el.hidden = true;
    },

    move(delta) {
      if (!this.items.length) return;
      this.selected = (this.selected + delta + this.items.length) % this.items.length;
      this.render();
      const rows = this.el.querySelectorAll('.sp-item');
      const row = rows[this.selected];
      if (row && row.scrollIntoView) row.scrollIntoView({ block: 'nearest' });
    },

    enter() {
      const task = this.items[this.selected];
      if (task) this.jump(task);
    },

    /* 跳到任务所在的那一周，并让卡片闪一下 */
    jump(task) {
      this.hide();
      if (Store.ui.view !== 'week') {
        Store.ui.view = 'week';
        Store.data.settings.view = 'week';
        Store.persist();
      }
      Store.ui.anchor = task.date;
      Toolbar.render();
      Calendar.render();
      const search = document.getElementById('search');
      if (search.blur) search.blur();
      const node = document.querySelector('.task[data-id="' + task.id + '"]');
      if (node) {
        node.classList.add('highlight');
        if (node.scrollIntoView) node.scrollIntoView({ block: 'center', behavior: 'smooth' });
      } else if (task.allDay && Calendar.calEl) {
        Calendar.calEl.scrollTop = 0;
      }
    }
  };

  /* ================================ App ================================ */

  const App = {
    async boot() {
      await Store.init();
      Dialogs.init();
      Calendar.init();
      Sidebar.init();
      Toolbar.init();
      SearchPanel.init();
      this.applyTheme(Store.settings.theme);
      this.bindTitlebar();
      this.bindKeys();

      Store.on(() => this.render(false));
      this.render(true);
    },

    render(focus) {
      Sidebar.render();
      Toolbar.render();
      Calendar.render({ focus: focus });
      this.applyTheme(Store.settings.theme);
      document.getElementById('tbToday').textContent = Util.cnDateFull(new Date());
    },

    applyTheme(theme) {
      const value = theme === 'dark' ? 'dark' : 'light';
      if (document.documentElement.dataset.theme === value) return;
      document.documentElement.dataset.theme = value;
      if (window.desktop) window.desktop.setTheme(value);
    },

    bindTitlebar() {
      document.getElementById('tbToday').textContent = Util.cnDateFull(new Date());
      const themeBtn = document.getElementById('btnTheme');
      const paint = () => {
        themeBtn.innerHTML = '';
        themeBtn.appendChild(svg(Store.settings.theme === 'dark' ? Util.ICONS.moon : Util.ICONS.sun, 16));
      };
      paint();
      themeBtn.addEventListener('click', () => {
        Store.setSetting('theme', Store.settings.theme === 'dark' ? 'light' : 'dark');
        paint();
      });
      const gearBtn = document.getElementById('btnSettings');
      gearBtn.appendChild(svg(Util.ICONS.gear, 16));
      gearBtn.addEventListener('click', (e) => {
        if (Dialogs.isSettingsOpen()) { Dialogs.closePop(); return; }
        const rect = e.currentTarget.getBoundingClientRect();
        Dialogs.openSettings({ x: rect.right - 330, y: rect.bottom + 8 }, gearBtn);
      });
    },

    bindKeys() {
      window.addEventListener('keydown', (e) => {
        const tag = (e.target.tagName || '').toLowerCase();
        const typing = tag === 'input' || tag === 'textarea' || e.target.isContentEditable;
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !typing) {
          e.preventDefault();
          Store.undo();
          return;
        }
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') {
          e.preventDefault();
          this.newTask(document.getElementById('btnNew'));
          return;
        }
        if (typing) return;
        if (e.key === 'ArrowLeft') { e.preventDefault(); this.shift(-1); }
        else if (e.key === 'ArrowRight') { e.preventDefault(); this.shift(1); }
        else if (e.key.toLowerCase() === 't') this.gotoToday();
        else if (e.key.toLowerCase() === 'n') this.newTask(document.getElementById('btnNew'));
        else if (e.key === '/') { e.preventDefault(); document.getElementById('search').focus(); }
      });
    },

    shift(dir) {
      const anchor = Util.parseYmd(Store.ui.anchor);
      Store.ui.anchor = Util.ymd(Store.ui.view === 'day' ? Util.addDays(anchor, dir) : Util.addDays(anchor, dir * 7));
      Toolbar.render();
      Calendar.render();
    },

    gotoToday() {
      Store.ui.anchor = Util.today();
      Toolbar.render();
      Calendar.render();
      Calendar.scrollToNow();
    },

    gotoThisWeek() {
      Store.ui.anchor = Util.today();
      Store.ui.view = 'week';
      Store.setSetting('view', 'week');
      Toolbar.render();
      Calendar.render({ focus: true });
      Calendar.renderNowLine();
    },

    newTask(anchorEl) {
      const date = Store.ui.view === 'day' ? Store.ui.anchor : Util.today();
      const now = new Date();
      const dayStart = typeof Store.settings.dayStart === 'number' ? Store.settings.dayStart : 8 * 60;
      const dayEnd = typeof Store.settings.dayEnd === 'number' ? Store.settings.dayEnd : 22 * 60;
      const snap = typeof Store.settings.snap === 'number' ? Store.settings.snap : 5;
      let start = Math.ceil((now.getHours() * 60 + now.getMinutes()) / snap) * snap;
      start = Util.clamp(start, dayStart, Math.max(dayStart, dayEnd - 60));
      const rect = anchorEl ? anchorEl.getBoundingClientRect() : null;
      Dialogs.openTask({
        mode: 'create',
        seed: { date: date, start: start, end: Math.min(1440, start + 60) },
        anchor: rect ? { x: rect.left, y: rect.bottom + 6 } : { x: window.innerWidth / 2, y: 120 }
      });
    },

    isoWeek(date) {
      const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
      const dayNum = d.getUTCDay() || 7;
      d.setUTCDate(d.getUTCDate() + 4 - dayNum);
      const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
      return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    }
  };

  window.App = App;
  window.Sidebar = Sidebar;
  window.Toolbar = Toolbar;
  window.SearchPanel = SearchPanel;

  document.addEventListener('DOMContentLoaded', () => App.boot());
  window.addEventListener('beforeunload', () => Store.persist.flush());
})();
