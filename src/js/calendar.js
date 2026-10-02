(function () {
  'use strict';

  /* 重叠任务列布局：同一时段的任务并排显示 */
  function packLayout(tasks) {
    const result = new Map();
    const colOf = new Map();
    let cluster = [];
    let clusterEnd = -1;
    let index = 0;

    const flush = () => {
      if (!cluster.length) return;
      const colEnds = [];
      cluster.forEach((t) => {
        let idx = -1;
        for (let i = 0; i < colEnds.length; i++) {
          if (colEnds[i] <= t.start) { idx = i; break; }
        }
        if (idx === -1) { idx = colEnds.length; colEnds.push(0); }
        colEnds[idx] = t.end;
        colOf.set(t, idx);
      });
      const total = colEnds.length;
      cluster.forEach((t) => {
        const col = colOf.get(t);
        let span = 1;
        for (let c = col + 1; c < total; c++) {
          const blocked = cluster.some((o) => o !== t && colOf.get(o) === c && o.start < t.end && o.end > t.start);
          if (blocked) break;
          span++;
        }
        result.set(t.id, { col: col, span: span, total: total });
      });
      cluster = [];
      clusterEnd = -1;
    };

    tasks.forEach((t) => {
      if (cluster.length && t.start >= clusterEnd) flush();
      cluster.push(t);
      clusterEnd = Math.max(clusterEnd, t.end);
    });
    flush();
    return result;
  }

  function isDark() {
    return document.documentElement.dataset.theme === 'dark';
  }

  const Calendar = {
    calEl: null,
    headEl: null,
    alldayEl: null,
    gridEl: null,
    days: [],
    create: null,
    drag: null,
    selection: null,
    selectionEl: null,
    hoverEl: null,
    lineTop: null,
    lineBottom: null,
    lastDay: null,

    init() {
      this.calEl = document.getElementById('calendar');
      this.headEl = document.getElementById('calHead');
      this.alldayEl = document.getElementById('allday');
      this.gridEl = document.getElementById('grid');

      this.gridEl.addEventListener('pointerdown', (e) => this.onGridDown(e));
      this.gridEl.addEventListener('pointermove', (e) => this.onGridMove(e));
      this.gridEl.addEventListener('pointerleave', () => this.hideHover());
      this.calEl.addEventListener('scroll', () => this.hideHover());
      this.alldayEl.addEventListener('click', (e) => this.onAllDayClick(e));
      window.addEventListener('resize', () => this.syncHeadHeight());
      setInterval(() => this.tick(), 30000);
      window.addEventListener('focus', () => this.tick());

      window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          if (this.create) this.cancelCreate();
          if (this.drag) this.cancelDrag();
        }
      });
    },

    /* ------------------------------ 视图数据 ------------------------------ */

    viewDays() {
      const anchor = Util.parseYmd(Store.ui.anchor);
      if (Store.ui.view === 'day') return [Store.ui.anchor];
      const start = Util.startOfWeek(anchor, Store.settings.weekStart);
      const out = [];
      for (let i = 0; i < 7; i++) out.push(Util.ymd(Util.addDays(start, i)));
      return out;
    },

    /* 当前吸附档：默认取设置里的值，按住 Shift 时精确到 1 分钟 */
    effectiveSnap(fine) {
      if (fine) return 1;
      const v = Store.settings.snap;
      return typeof v === 'number' && v > 0 ? v : 5;
    },

    snapMin(raw, fine) {
      const snap = this.effectiveSnap(fine);
      return Util.clamp(Math.round(raw / snap) * snap, 0, 1440);
    },

    hourHeight() {
      return Store.settings.hourHeight || 56;
    },

    dayStart() {
      const v = Store.settings.dayStart;
      return typeof v === 'number' ? v : 8 * 60;
    },

    dayEnd() {
      const v = Store.settings.dayEnd;
      return typeof v === 'number' ? v : 22 * 60;
    },

    spanHeight() {
      return ((this.dayEnd() - this.dayStart()) / 60) * this.hourHeight();
    },

    /* ------------------------------- 渲染 -------------------------------- */

    render(opts) {
      const options = opts || {};
      this.days = this.viewDays();
      this.lastDay = Util.today();
      document.documentElement.style.setProperty('--days', this.days.length);
      document.documentElement.style.setProperty('--hour-h', this.hourHeight() + 'px');
      document.documentElement.style.setProperty('--span-h', this.spanHeight() + 'px');

      const template = 'var(--gutter-w) repeat(' + this.days.length + ', minmax(0, 1fr))';
      [this.headEl, this.alldayEl, this.gridEl].forEach((node) => { node.style.gridTemplateColumns = template; });

      this.renderHead();
      this.renderAllDay();
      this.renderGrid();
      this.syncHeadHeight();
      if (options.focus) this.focusScroll();
    },

    syncHeadHeight() {
      const h = this.headEl ? this.headEl.getBoundingClientRect().height : 60;
      document.documentElement.style.setProperty('--head-h', Math.round(h) + 'px');
    },

    renderHead() {
      this.headEl.innerHTML = '';
      const first = Util.parseYmd(this.days[0]);
      const ghost = Util.el('div', 'day-head-ghost');
      ghost.appendChild(Util.el('span', null, (first.getMonth() + 1) + '月'));
      this.headEl.appendChild(ghost);

      this.days.forEach((ymd) => {
        const d = Util.parseYmd(ymd);
        const cell = Util.el('div', 'day-head');
        if (Util.isToday(d)) cell.classList.add('today');
        if (Util.isWeekend(d)) cell.classList.add('weekend');
        cell.appendChild(Util.el('div', 'wd', Util.WEEKDAYS[d.getDay()]));
        const dt = Util.el('div', 'dt', String(d.getDate()));
        if (d.getDate() === 1 || this.days.length === 1) {
          dt.appendChild(Util.el('small', null, (d.getMonth() + 1) + '月'));
        }
        cell.appendChild(dt);
        cell.title = Util.cnDateFull(d);
        cell.addEventListener('click', () => {
          if (Store.ui.view === 'week') {
            Store.ui.view = 'day';
            Store.ui.anchor = ymd;
            Store.setSetting('view', 'day');
          }
        });
        this.headEl.appendChild(cell);
      });
    },

    renderAllDay() {
      const wrap = this.alldayEl;
      wrap.innerHTML = '';
      const label = Util.el('div', 'gutter-label', '全天');
      wrap.appendChild(label);

      this.days.forEach((ymd) => {
        const cell = Util.el('div', 'allday-cell');
        cell.dataset.date = ymd;
        if (ymd === Util.today()) cell.classList.add('today');
        const tasks = Store.allDayOn(ymd);
        tasks.forEach((t) => {
          const state = this.taskState(t);
          if (state === 'hide') return;
          const list = Store.listById(t.listId);
          const chip = Util.el('div', 'allday-chip');
          chip.dataset.id = t.id;
          chip.style.setProperty('--chip-bg', Util.color(list.color, isDark() ? .22 : .13));
          chip.style.setProperty('--chip-line', list.color);
          chip.style.setProperty('--chip-fg', isDark() ? 'var(--text)' : 'var(--text)');
          if (t.done) chip.classList.add('done');
          if (state === 'dim') chip.classList.add('dim');
          if ((t.note || '').trim()) {
            const flag = Util.el('span', 'chip-note');
            flag.appendChild(Util.svg(Util.ICONS.note, 11));
            chip.appendChild(flag);
          }
          chip.appendChild(Util.el('span', null, t.title));
          chip.title = t.title + (t.note ? '\n' + t.note : '');
          cell.appendChild(chip);
        });
        wrap.appendChild(cell);
      });
    },

    renderGrid() {
      const grid = this.gridEl;
      grid.innerHTML = '';
      this.hoverEl = null;
      this.lineTop = null;
      this.lineBottom = null;

      const gutter = Util.el('div', 'gutter');
      const startHour = Math.floor(this.dayStart() / 60);
      const endHour = Math.ceil(this.dayEnd() / 60);
      for (let i = 0; i < endHour - startHour; i++) {
        const cell = Util.el('div', 'h');
        if (i === 0) {
          cell.appendChild(Util.el('span', 'first', Util.fmtTime(startHour * 60)));
        }
        const hour = startHour + i + 1;
        if (hour <= endHour) {
          cell.appendChild(Util.el('span', null, Util.fmtTime(hour * 60)));
        }
        gutter.appendChild(cell);
      }
      grid.appendChild(gutter);

      this.days.forEach((ymd, i) => {
        const d = Util.parseYmd(ymd);
        const col = Util.el('div', 'day-col');
        col.dataset.date = ymd;
        col.dataset.index = String(i);
        if (ymd === Util.today()) col.classList.add('today');
        if (Util.isWeekend(d)) col.classList.add('weekend');
        col.appendChild(Util.el('div', 'col-tasks'));
        grid.appendChild(col);
      });

      this.renderTasks();
      this.renderDeadlines();
      this.renderNowLine();
      this.paintSelection();
    },

    /* 死亡线：截止日当天，整列顶部画一条深红线 */
    renderDeadlines() {
      this.days.forEach((ymd, index) => {
        const col = this.gridEl.querySelector('.day-col[data-index="' + index + '"]');
        if (!col) return;
        const items = Store.data.deadlines.filter((d) => d.due === ymd);
        items.forEach((dl, i) => {
          const line = Util.el('div', 'dl-line');
          line.style.top = (i * 20 + 1) + 'px';
          line.appendChild(Util.el('span', 'dl-tag', dl.title));
          line.title = dl.title + ' · ' + dl.due + ' · 死亡线';
          col.appendChild(line);
        });
      });
    },

    taskState(task) {
      const ui = Store.ui;
      const s = Store.settings;
      if (task.done && !s.showDone) return 'hide';
      if (ui.search) {
        const q = ui.search.toLowerCase();
        const hay = (task.title + ' ' + (task.note || '')).toLowerCase();
        return hay.indexOf(q) >= 0 ? 'show' : 'dim';
      }
      if (ui.filterListId && task.listId !== ui.filterListId) return 'dim';
      return 'show';
    },

    renderTasks() {
      const hourH = this.hourHeight();
      const dark = isDark();

      this.days.forEach((ymd, index) => {
        const col = this.gridEl.querySelector('.day-col[data-index="' + index + '"]');
        if (!col) return;
        const layer = col.querySelector('.col-tasks');
        layer.innerHTML = '';

        const tasks = Store.tasksOn(ymd).filter((t) => this.taskState(t) !== 'hide');
        const layout = packLayout(tasks);

        tasks.forEach((task) => {
          const box = layout.get(task.id) || { col: 0, span: 1, total: 1 };
          const list = Store.listById(task.listId);
          const state = this.taskState(task);
          const dayStart = this.dayStart();
          const dayEnd = this.dayEnd();
          const clampTop = task.start < dayStart;
          const clampBottom = task.end > dayEnd;
          const from = Util.clamp(task.start, dayStart, Math.max(dayStart, dayEnd - 15));
          const to = Util.clamp(task.end, from + 15, Math.max(from + 15, dayEnd));
          const top = ((from - dayStart) / 60) * hourH;
          const height = Math.max(((to - from) / 60) * hourH - 2, 20);

          const el = Util.el('div', 'task');
          el.dataset.id = task.id;
          el.style.setProperty('--c', list.color);
          if (!task.done) {
            el.style.background = Util.color(list.color, dark ? .20 : .11);
            el.style.boxShadow = 'inset 0 0 0 1px ' + Util.color(list.color, dark ? .34 : .22);
          }
          el.style.top = top + 'px';
          el.style.height = height + 'px';
          el.style.left = 'calc(' + (box.col / box.total * 100) + '% + 3px)';
          el.style.width = 'calc(' + (box.span / box.total * 100) + '% - 5px)';
          if (height < 26) el.classList.add('compact');
          if (task.done) el.classList.add('done');
          if (state === 'dim') el.classList.add('dim');
          if (clampTop) el.classList.add('clamp-top');
          if (clampBottom) el.classList.add('clamp-bottom');

          el.appendChild(Util.el('div', 't-title', task.title));
          if ((task.note || '').trim()) {
            const dot = Util.el('div', 't-note-dot');
            dot.title = '有内容';
            el.appendChild(dot);
          }
          if (height >= 40) {
            el.appendChild(Util.el('div', 't-time', Util.fmtTime(task.start) + ' – ' + Util.fmtTime(task.end)));
          }
          if (task.priority >= 2) {
            el.appendChild(Util.el('div', 't-prio p' + task.priority));
          }

          const check = Util.el('button', 't-check');
          check.title = task.done ? '标记为未完成' : '标记为完成';
          check.appendChild(Util.svg(Util.ICONS.check, 13));
          check.addEventListener('click', (ev) => {
            ev.stopPropagation();
            Store.toggleDone(task.id);
          });
          el.appendChild(check);

          const rz = Util.el('div', 'rz');
          rz.title = '拖动调整时长';
          el.appendChild(rz);

          const tip = task.title + '\n' + Util.fmtTime(task.start) + ' – ' + Util.fmtTime(task.end) + ' · ' + list.name;
          el.title = task.note ? tip + '\n' + task.note : tip;

          layer.appendChild(el);
        });
      });
    },

    /* 每 30 秒一次：刷新「现在」红线；发现跨天（含睡眠唤醒）就整体重绘 */
    tick() {
      const day = Util.today();
      if (day !== this.lastDay) {
        this.lastDay = day;
        if (window.App) App.render(false);
        return;
      }
      this.renderNowLine();
    },

    renderNowLine() {
      const old = this.gridEl.querySelector('.now-line');
      if (old) old.remove();
      const todayCol = this.gridEl.querySelector('.day-col.today .col-tasks');
      if (!todayCol) return;
      const now = new Date();
      const minutes = now.getHours() * 60 + now.getMinutes();
      if (minutes < this.dayStart() || minutes > this.dayEnd()) return;
      const line = Util.el('div', 'now-line');
      line.style.top = (((minutes - this.dayStart()) / 60) * this.hourHeight()) + 'px';
      line.title = '现在 ' + Util.fmtTime(minutes);
      todayCol.appendChild(line);
    },

    /* 滚动到合适的时间位置 */
    focusScroll() {
      const hourH = this.hourHeight();
      const startHour = this.dayStart() / 60;
      const now = new Date();
      let target = startHour;
      if (Store.ui.view === 'week' && this.days.indexOf(Util.today()) >= 0) {
        target = now.getHours() + now.getMinutes() / 60 - 2.2;
      } else {
        const first = this.days
          .map((d) => Store.tasksOn(d).filter((t) => !t.done))
          .find((list) => list.length);
        if (first && first.length) target = first[0].start / 60 - 1;
      }
      this.calEl.scrollTop = Math.max(0, (target - startHour) * hourH);
    },

    scrollToNow() {
      const now = new Date();
      const startHour = this.dayStart() / 60;
      const top = (now.getHours() + now.getMinutes() / 60 - 2.2 - startHour) * this.hourHeight();
      this.calEl.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
    },

    /* ----------------------------- 拖拽：新建 ----------------------------- */

    /* ---------- 鼠标悬停：在左侧时间轴显示对齐的时间 ---------- */
    onGridMove(e) {
      const col = e.target && e.target.closest ? e.target.closest('.day-col') : null;
      if (!col) return;
      this.showHover(this.minuteAt(e.clientY, col, e.shiftKey));
    },

    showHover(minute) {
      if (minute == null) return;
      if (!this.hoverEl) {
        this.hoverEl = Util.el('div', 'hover-time');
        this.hoverEl.appendChild(Util.el('span'));
        this.gridEl.appendChild(this.hoverEl);
      }
      const hourH = this.hourHeight();
      const top = Util.clamp(((minute - this.dayStart()) / 60) * hourH, 11, Math.max(11, this.spanHeight() - 11));
      this.hoverEl.style.top = top + 'px';
      this.hoverEl.firstChild.textContent = Util.fmtTime(minute);
    },

    hideHover() {
      if (this.hoverEl) {
        this.hoverEl.remove();
        this.hoverEl = null;
      }
    },

    /* ---------- 拖动时的水平虚线辅助线 ---------- */
    removeDragLines() {
      if (this.lineTop) { this.lineTop.remove(); this.lineTop = null; }
      if (this.lineBottom) { this.lineBottom.remove(); this.lineBottom = null; }
    },

    minuteAt(clientY, colEl, fine) {
      const rect = colEl.getBoundingClientRect();
      const minutes = this.dayStart() + ((clientY - rect.top) / this.hourHeight()) * 60;
      return Util.clamp(this.snapMin(minutes, fine), this.dayStart(), this.dayEnd());
    },

    onGridDown(e) {
      if (e.button !== 0) return;
      if (e.target.closest('.task')) return this.onTaskDown(e, e.target.closest('.task'));
      const col = e.target.closest('.day-col');
      if (!col) return;
      this.startCreate(e, col);
    },

    startCreate(e, col) {
      const snap = this.effectiveSnap(e.shiftKey);
      const date = col.dataset.date;
      const from0 = Util.clamp(this.minuteAt(e.clientY, col, e.shiftKey), this.dayStart(), Math.max(this.dayStart(), this.dayEnd() - snap));

      const state = { col: col, startMin: from0, curMin: from0, moved: false, x: e.clientX, y: e.clientY, cancelled: false, snap: snap };
      this.create = state;

      const move = (ev) => {
        if (!state.moved && Math.abs(ev.clientY - state.y) <= 3) return;
        state.moved = true;
        state.snap = this.effectiveSnap(ev.shiftKey);
        state.curMin = this.minuteAt(ev.clientY, col, ev.shiftKey);
        this.updateSelection();
      };
      const up = (ev) => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        this.create = null;
        if (state.cancelled) return;
        /* 单击（没有拖动）：不弹窗、不建任务 */
        if (!state.moved) return;

        const snap = state.snap || this.effectiveSnap(false);
        let from = Math.min(state.startMin, state.curMin);
        let to = Math.max(state.startMin, state.curMin);
        if (to - from < snap) {
          to = Math.min(this.dayEnd(), from + snap);
          from = Math.max(this.dayStart(), to - snap);
        }
        this.selection = { date: date, from: from, to: to, snap: snap };
        this.paintSelection();

        const rect = col.getBoundingClientRect();
        Dialogs.openTask({
          mode: 'create',
          seed: { date: date, start: from, end: to },
          anchor: {
            x: Math.max(rect.left + 8, Math.min(ev.clientX, rect.right - 8)),
            y: Math.max(rect.top, Math.min(ev.clientY, rect.bottom - 40))
          }
        });
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    },

    updateSelection() {
      const s = this.create;
      if (!s) return;
      this.selection = {
        date: s.col.dataset.date,
        from: Math.min(s.startMin, s.curMin),
        to: Math.max(s.startMin, s.curMin),
        snap: s.snap
      };
      this.paintSelection();
    },

    /* 把选区画出来（弹窗打开期间保持显示） */
    paintSelection() {
      let box = this.selectionEl;
      const sel = this.selection;
      const col = sel ? this.gridEl.querySelector('.day-col[data-date="' + sel.date + '"]') : null;

      if (!sel || !col) {
        if (box) box.remove();
        this.selectionEl = null;
        this.removeDragLines();
        return;
      }
      if (!box || box.parentElement !== col) {
        if (box) box.remove();
        box = Util.el('div', 'selection');
        box.appendChild(Util.el('span'));
        this.selectionEl = box;
        col.appendChild(box);
      }
      const hourH = this.hourHeight();
      const floor = sel.snap || 1;
      const from = sel.from;
      const to = Math.max(sel.to, from + floor);
      box.style.top = (((from - this.dayStart()) / 60) * hourH) + 'px';
      box.style.height = Math.max(3, ((to - from) / 60) * hourH - 1) + 'px';
      box.firstChild.textContent = Util.fmtTime(from) + ' – ' + Util.fmtTime(to) + '  ' + Util.duration(to - from);

      if (!this.lineTop) {
        this.lineTop = Util.el('div', 'drag-line');
        this.lineBottom = Util.el('div', 'drag-line');
        this.gridEl.appendChild(this.lineTop);
        this.gridEl.appendChild(this.lineBottom);
      }
      this.lineTop.style.top = (((from - this.dayStart()) / 60) * hourH) + 'px';
      this.lineBottom.style.top = (((to - this.dayStart()) / 60) * hourH) + 'px';
    },

    clearSelection() {
      this.selection = null;
      if (this.selectionEl) {
        this.selectionEl.remove();
        this.selectionEl = null;
      }
      this.removeDragLines();
    },

    cancelCreate() {
      if (!this.create) return;
      this.create.cancelled = true;
      this.create = null;
      this.clearSelection();
    },

    onAllDayClick(e) {
      const chip = e.target.closest('.allday-chip');
      if (chip) {
        const task = Store.taskById(chip.dataset.id);
        if (task) {
          const rect = chip.getBoundingClientRect();
          Dialogs.openTask({ mode: 'edit', task: task, anchor: { x: rect.left, y: rect.bottom + 4 } });
        }
        return;
      }
      const cell = e.target.closest('.allday-cell');
      if (!cell) return;
      const rect = cell.getBoundingClientRect();
      Dialogs.openTask({
        mode: 'create',
        seed: { date: cell.dataset.date, allDay: true, start: 9 * 60, end: 10 * 60 },
        anchor: { x: Math.min(e.clientX, rect.right - 8), y: rect.bottom + 4 }
      });
    },

    /* ----------------------------- 拖拽：移动 ----------------------------- */

    onTaskDown(e, el) {
      if (e.button !== 0) return;
      if (e.target.closest('.t-check')) return;
      const task = Store.taskById(el.dataset.id);
      if (!task) return;

      const cols = this.gridEl.querySelectorAll('.day-col');
      if (!cols.length) return;
      const bounds = this.gridEl.getBoundingClientRect();
      const gutterW = this.gridEl.querySelector('.gutter').getBoundingClientRect().width;
      const colW = (bounds.width - gutterW) / cols.length;
      const originIndex = Number(el.parentElement.parentElement.dataset.index);
      const originDate = Util.parseYmd(task.date);
      const startX = e.clientX;
      const startY = e.clientY;
      const origHeight = el.getBoundingClientRect().height;
      const resizing = !!e.target.closest('.rz');
      const hourH = this.hourHeight();

      const state = { el: el, task: task, started: false, resizing: resizing, targetIndex: originIndex, deltaMin: 0, height: origHeight, cancelled: false };
      this.drag = state;
      el.setPointerCapture && el.setPointerCapture(e.pointerId);

      const move = (ev) => {
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;
        if (!state.started && Math.abs(dx) + Math.abs(dy) < 4) return;
        if (!state.started) {
          state.started = true;
          el.classList.add(resizing ? 'resizing' : 'dragging');
        }
        const step = this.effectiveSnap(ev.shiftKey);
        state.snap = step;
        if (resizing) {
          state.height = Util.clamp(origHeight + dy, Math.max(3, (hourH * step) / 60), hourH * 24);
          el.style.height = state.height + 'px';
          const mins = Math.round((state.height / hourH) * 60 / step) * step;
          const timeNode = el.querySelector('.t-time');
          if (timeNode) timeNode.textContent = Util.fmtTime(task.start) + ' – ' + Util.fmtTime(Math.min(this.dayEnd(), task.start + mins));
        } else {
          el.style.transform = 'translate(' + dx + 'px, ' + dy + 'px)';
          const idx = Util.clamp(Math.floor((ev.clientX - bounds.left - gutterW) / colW), 0, cols.length - 1);
          if (idx !== state.targetIndex) {
            cols.forEach((c, i) => c.classList.toggle('drop-target', i === idx));
            state.targetIndex = idx;
          }
          state.deltaMin = Math.round((dy / hourH) * 60 / step) * step;
        }
      };

      const up = (ev) => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        cols.forEach((c) => c.classList.remove('drop-target'));
        el.classList.remove('dragging', 'resizing');
        this.drag = null;
        if (state.cancelled) { el.style.transform = ''; el.style.height = ''; return; }

        if (!state.started) {
          const rect = el.getBoundingClientRect();
          Dialogs.openTask({ mode: 'edit', task: task, anchor: { x: rect.left + 12, y: rect.top } });
          return;
        }

        if (resizing) {
          const step = state.snap || this.effectiveSnap(false);
          const dur = Math.round((state.height / hourH) * 60 / step) * step;
          const base = task.start;
          const lower = base + step;
          const upper = Math.max(lower, this.dayEnd());
          const end = Util.clamp(base + Math.max(step, dur), lower, upper);
          Store.updateTask(task.id, { end: end });
        } else {
          const dur = task.end - task.start;
          const deltaDays = state.targetIndex - originIndex;
          let start = task.start + state.deltaMin;
          start = Util.clamp(start, this.dayStart(), Math.max(this.dayStart(), this.dayEnd() - dur));
          const date = Util.ymd(Util.addDays(originDate, deltaDays));
          if (start === task.start && date === task.date) return;
          Store.updateTask(task.id, { start: start, end: start + dur, date: date });
        }
      };

      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    },

    cancelDrag() {
      const s = this.drag;
      if (!s) return;
      s.cancelled = true;
      s.el.classList.remove('dragging', 'resizing');
      s.el.style.transform = '';
      s.el.style.height = '';
      this.drag = null;
      this.render();
    }
  };

  window.Calendar = Calendar;
})();
