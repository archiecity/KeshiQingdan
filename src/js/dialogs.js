(function () {
  'use strict';

  const el = Util.el;
  const svg = Util.svg;

  /* 通用：把节点放进容器 */
  function add(parent) {
    for (let i = 1; i < arguments.length; i++) {
      const node = arguments[i];
      if (node) parent.appendChild(node);
    }
    return parent;
  }

  const Dialogs = {
    pop: null,
    menu: null,
    mask: null,
    current: null,
    menuClose: null,
    notePop: null,
    refreshNoteBtn: null,
    noteTimer: null,
    popOwner: null,
    menuOwner: null,

    init() {
      this.pop = document.getElementById('pop');
      this.menu = document.getElementById('ctxmenu');
      document.addEventListener('pointerdown', (e) => {
        const inNote = this.notePop && !this.notePop.hidden && this.notePop.contains(e.target);
        const inMenu = this.menu && !this.menu.hidden && this.menu.contains(e.target);
        const inModal = e.target && e.target.closest && e.target.closest('.mask');
        const onPopOwner = this.popOwner && this.popOwner.isConnected && this.popOwner.contains(e.target);
        const onMenuOwner = this.menuOwner && this.menuOwner.isConnected && this.menuOwner.contains(e.target);
        if (this.pop && !this.pop.hidden && !this.pop.contains(e.target) && !inNote && !inMenu && !inModal && !onPopOwner) this.closePop();
        if (this.menu && !this.menu.hidden && !inMenu && !onMenuOwner) this.closeMenu();
      });
      document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        if (this.menu && !this.menu.hidden) { this.closeMenu(); e.stopPropagation(); return; }
        if (this.notePop && !this.notePop.hidden) { this.closeNote(); e.stopPropagation(); return; }
        if (this.pop && !this.pop.hidden) { this.closePop(); e.stopPropagation(); }
      }, true);
    },

    /* -------------------------------- 提示 -------------------------------- */

    toast(msg, type) {
      const node = el('div', 'toast' + (type === 'error' ? ' error' : ''), msg);
      document.body.appendChild(node);
      setTimeout(() => {
        node.classList.add('out');
        setTimeout(() => node.remove(), 220);
      }, 2200);
    },

    /* -------------------------------- 确认 -------------------------------- */

    confirm(opts) {
      return new Promise((resolve) => {
        const mask = el('div', 'mask');
        const box = el('div', 'confirm');
        add(box, el('h3', null, opts.title || '确认操作'), opts.message ? el('p', null, opts.message) : null);
        const foot = el('div', 'foot');
        const cancel = el('button', 'btn outline', '取消');
        const ok = el('button', 'btn primary', opts.okText || '确定');
        if (opts.danger) { ok.classList.remove('primary'); ok.classList.add('danger'); ok.style.background = 'var(--danger)'; ok.style.color = '#fff'; }
        cancel.addEventListener('click', () => { mask.remove(); resolve(false); });
        ok.addEventListener('click', () => { mask.remove(); resolve(true); });
        add(foot, cancel, ok);
        box.appendChild(foot);
        mask.appendChild(box);
        mask.addEventListener('pointerdown', (e) => { if (e.target === mask) { mask.remove(); resolve(false); } });
        document.body.appendChild(mask);
        ok.focus();
      });
    },

    prompt(opts) {
      return new Promise((resolve) => {
        const mask = el('div', 'mask');
        const box = el('div', 'confirm');
        add(box, el('h3', null, opts.title || '输入'), opts.message ? el('p', null, opts.message) : null);
        const input = el('input', 'field');
        input.type = 'text';
        input.placeholder = opts.placeholder || '';
        input.value = opts.value || '';
        input.style.width = '100%';
        input.style.marginBottom = '16px';
        input.style.padding = '9px 11px';
        input.style.borderRadius = '9px';
        input.style.border = '0';
        input.style.background = 'var(--field)';
        box.appendChild(input);
        const foot = el('div', 'foot');
        const cancel = el('button', 'btn outline', '取消');
        const ok = el('button', 'btn primary', '确定');
        const done = (val) => { mask.remove(); resolve(val); };
        cancel.addEventListener('click', () => done(null));
        ok.addEventListener('click', () => done(input.value.trim() || null));
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') { e.preventDefault(); done(input.value.trim() || null); }
        });
        add(foot, cancel, ok);
        box.appendChild(foot);
        mask.appendChild(box);
        mask.addEventListener('pointerdown', (e) => { if (e.target === mask) done(null); });
        document.body.appendChild(mask);
        input.focus();
        input.select();
      });
    },

    /* ------------------------------ 死亡线弹窗 ----------------------------- */

    deadlinePrompt(opts) {
      const options = opts || {};
      return new Promise((resolve) => {
        const mask = el('div', 'mask');
        const box = el('div', 'confirm dl-dialog');
        add(box, el('h3', null, options.title || '死亡线'));
        add(box, el('p', null, '写下一个必须完成的日子，倒计时会一直挂在左侧。'));

        const name = el('input', 'field');
        name.type = 'text';
        name.placeholder = '标题，例如：高考、论文 deadline';
        name.value = options.name || '';
        box.appendChild(name);

        const row = el('div', 'dl-due');
        row.appendChild(el('span', 'k', '截止日期'));
        const due = el('input', 'field');
        due.type = 'date';
        due.value = options.due || Util.today();
        row.appendChild(due);
        box.appendChild(row);

        const foot = el('div', 'foot');
        const cancel = el('button', 'btn outline', '取消');
        const ok = el('button', 'btn primary', options.okText || '确定');
        if (options.id) {
          const del = el('button', 'btn danger');
          add(del, svg(Util.ICONS.trash, 14), el('span', null, '删除'));
          del.title = '删除这条死亡线';
          del.addEventListener('click', async () => {
            const yes = await Dialogs.confirm({
              title: '删除死亡线',
              message: '「' + (name.value.trim() || '这条死亡线') + '」将从倒计时里移除，此操作可以撤销。',
              okText: '删除',
              danger: true
            });
            if (!yes) return;
            Store.removeDeadline(options.id);
            mask.remove();
            resolve(null);
            Toast.show('已删除', 'error');
          });
          foot.appendChild(del);
          foot.appendChild(el('div', 'spacer'));
        }
        add(foot, cancel, ok);
        box.appendChild(foot);

        const done = (val) => { mask.remove(); resolve(val); };
        const submit = () => {
          const title = name.value.trim();
          if (title && due.value) done({ title: title, due: due.value });
        };
        const sync = () => { ok.disabled = !name.value.trim() || !due.value; };
        name.addEventListener('input', sync);
        due.addEventListener('input', sync);
        name.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') { e.preventDefault(); submit(); }
          else if (e.key === 'Escape') done(null);
        });
        due.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') { e.preventDefault(); submit(); }
          else if (e.key === 'Escape') done(null);
        });
        cancel.addEventListener('click', () => done(null));
        ok.addEventListener('click', submit);
        mask.addEventListener('pointerdown', (e) => { if (e.target === mask) done(null); });
        sync();
        mask.appendChild(box);
        document.body.appendChild(mask);
        name.focus();
        name.select();
      });
    },

    /* ------------------------------ 上下文菜单 ----------------------------- */

    openMenu(items, x, y, owner) {
      this.menuOwner = owner || null;
      const menu = this.menu;
      menu.innerHTML = '';
      items.forEach((item) => {
        if (!item) return;
        if (item.type === 'sep') { menu.appendChild(el('div', 'menu-sep')); return; }
        if (item.type === 'label') { menu.appendChild(el('div', 'menu-label', item.label)); return; }
        if (item.type === 'swatches') {
          const wrap = el('div', 'menu-swatches');
          PALETTE.forEach((c) => {
            const dot = el('i');
            dot.style.background = c;
            dot.title = c;
            dot.addEventListener('click', () => { this.closeMenu(); item.onPick(c); });
            wrap.appendChild(dot);
          });
          menu.appendChild(wrap);
          return;
        }
        const node = el('div', 'menu-item' + (item.danger ? ' danger' : ''));
        const ico = el('span', 'ico');
        if (item.icon) ico.appendChild(svg(item.icon, 15));
        node.appendChild(ico);
        node.appendChild(el('span', null, item.label));
        node.addEventListener('click', () => { this.closeMenu(); item.onClick && item.onClick(); });
        menu.appendChild(node);
      });

      menu.hidden = false;
      menu.style.left = '0px';
      menu.style.top = '0px';
      const w = menu.offsetWidth;
      const h = menu.offsetHeight;
      const left = Util.clamp(x, 8, Math.max(8, window.innerWidth - w - 8));
      const top = Util.clamp(y, 8, Math.max(8, window.innerHeight - h - 8));
      menu.style.left = left + 'px';
      menu.style.top = top + 'px';
    },

    closeMenu() {
      if (this.menu) this.menu.hidden = true;
      this.menuOwner = null;
    },

    /* 这个菜单是不是由某个按钮打开的（用于再点一次关闭） */
    isMenuOpenFor(owner) {
      return !!(owner && this.menu && !this.menu.hidden && this.menuOwner === owner);
    },

    isSettingsOpen() {
      return !!(this.pop && !this.pop.hidden && this.pop.classList.contains('settings-panel'));
    },

    /* ------------------------------ 任务弹窗 ------------------------------ */

    closePop() {
      this.closeNote();
      if (window.Calendar) Calendar.clearSelection();
      if (this.pop) this.pop.hidden = true;
      this.pop.innerHTML = '';
      this.current = null;
      this.refreshNoteBtn = null;
      this.popOwner = null;
    },

    /* ---------------------------- 正文（备忘录） ---------------------------- */

    ensureNote() {
      if (this.notePop) return this.notePop;
      const np = el('section', 'notepad');
      np.hidden = true;

      const head = el('div', 'np-head');
      const brand = el('div', 'np-title');
      brand.appendChild(svg(Util.ICONS.note, 15));
      brand.appendChild(el('span', null, '内容'));
      head.appendChild(brand);
      const sub = el('div', 'np-sub');
      head.appendChild(sub);
      const close = el('button', 'icon-btn');
      close.title = '关闭（Esc）';
      close.appendChild(svg(Util.ICONS.close, 15));
      close.addEventListener('click', () => this.closeNote());
      head.appendChild(close);
      np.appendChild(head);

      const ta = el('textarea', 'np-body');
      ta.placeholder = '在这里写正文：细节、清单、会议记录、地址、灵感…';
      ta.spellcheck = false;
      np.appendChild(ta);

      const foot = el('div', 'np-foot');
      const count = el('span', 'np-count');
      const hint = el('span', 'np-hint');
      const spacer = el('div', 'spacer');
      const done = el('button', 'btn primary', '完成');
      done.addEventListener('click', () => this.closeNote());
      add(foot, count, hint, spacer, done);
      np.appendChild(foot);

      const syncCount = () => { count.textContent = ta.value.trim() ? ta.value.length + ' 字' : ''; };
      ta.addEventListener('input', syncCount);
      ta.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          this.closeNote();
        } else if (e.key === 'Tab') {
          e.preventDefault();
          const s = ta.selectionStart;
          ta.value = ta.value.slice(0, s) + '\t' + ta.value.slice(ta.selectionEnd);
          ta.selectionStart = ta.selectionEnd = s + 1;
          syncCount();
        }
      });

      this.notePop = np;
      document.body.appendChild(np);
      return np;
    },

    openNote() {
      const draft = this.current;
      if (!draft) return;
      const np = this.ensureNote();
      const ta = np.querySelector('.np-body');
      if (!np.hidden) { ta.focus(); return; }
      np.querySelector('.np-sub').textContent = draft.title ? '「' + draft.title + '」' : '这条任务';
      np.querySelector('.np-hint').textContent = draft.id ? '关闭即自动保存，可 Ctrl+Z 撤销' : '点任务窗口的「确定」后一起保存';
      ta.value = draft.note || '';
      np.hidden = false;
      const w = Math.min(560, window.innerWidth - 28);
      const h = Math.min(440, window.innerHeight - 70);
      np.style.width = w + 'px';
      np.style.height = h + 'px';
      np.style.left = Math.round((window.innerWidth - w) / 2) + 'px';
      np.style.top = Math.round(Math.max(14, (window.innerHeight - h) / 2 - 36)) + 'px';
      ta.dispatchEvent(new Event('input'));
      ta.focus();
      ta.setSelectionRange(ta.value.length, ta.value.length);
    },

    /* 关闭正文窗口：新任务只改草稿；已有任务关闭即自动保存 */
    syncNoteToDraft() {
      const np = this.notePop;
      if (!np || np.hidden || !this.current) return;
      const ta = np.querySelector('.np-body');
      if (ta) this.current.note = ta.value;
      if (this.refreshNoteBtn) this.refreshNoteBtn();
    },

    closeNote() {
      const np = this.notePop;
      if (!np || np.hidden) return;
      np.hidden = true;
      const draft = this.current;
      if (!draft) return;
      const ta = np.querySelector('.np-body');
      const value = ta ? ta.value : '';
      const changed = value !== (draft.note || '');
      draft.note = value;
      if (changed && draft.id) {
        /* 先静默保存，等拖拽结束后再整体刷新，避免打断正在进行的拖动 */
        Store.updateTask(draft.id, { note: value }, true, true);
        this.scheduleNoteRefresh();
      }
      if (changed && this.refreshNoteBtn) this.refreshNoteBtn();
    },

    scheduleNoteRefresh() {
      if (this.noteTimer) return;
      const tick = () => {
        if (window.Calendar && (Calendar.drag || Calendar.create)) {
          this.noteTimer = setTimeout(tick, 300);
          return;
        }
        this.noteTimer = null;
        Store.emit();
      };
      this.noteTimer = setTimeout(tick, 120);
    },

    place(anchor) {
      const pop = this.pop;
      pop.style.visibility = 'hidden';
      pop.hidden = false;
      const w = pop.offsetWidth;
      const h = pop.offsetHeight;
      let left = anchor.x - 16;
      let top = anchor.y + 10;
      if (left + w > window.innerWidth - 14) left = window.innerWidth - w - 14;
      if (left < 14) left = 14;
      if (top + h > window.innerHeight - 14) top = Math.max(14, anchor.y - h - 10);
      if (top < 14) top = 14;
      pop.style.left = Math.round(left) + 'px';
      pop.style.top = Math.round(top) + 'px';
      pop.style.visibility = 'visible';
    },

    openTask(opts) {
      this.closeNote();
      this.popOwner = null;
      const isEdit = opts.mode === 'edit';
      const seed = opts.seed || {};
      const base = isEdit ? opts.task : Object.assign({
        title: '',
        note: '',
        listId: Store.defaultListId(),
        date: Util.today(),
        start: 9 * 60,
        end: 10 * 60,
        allDay: false,
        priority: 0
      }, seed);

      const draft = {
        id: base.id,
        title: base.title || '',
        note: base.note || '',
        listId: base.listId,
        date: base.date,
        start: base.start,
        end: base.end,
        allDay: !!base.allDay,
        priority: base.priority || 0
      };

      const pop = this.pop;
      pop.innerHTML = '';
      pop.classList.remove('settings-panel');
      pop.classList.toggle('wide', isEdit);

      const head = el('div', 'pop-head');
      head.appendChild(el('h3', null, isEdit ? '编辑任务' : '添加任务'));
      const hint = el('div', 'hint', Util.cnDate(Util.parseYmd(draft.date)) + ' ' + Util.WEEKDAYS[Util.parseYmd(draft.date).getDay()]);
      head.appendChild(hint);
      pop.appendChild(head);

      const title = el('input', 'field');
      title.type = 'text';
      title.placeholder = '准备做点什么？';
      title.value = draft.title;
      pop.appendChild(title);

      const noteBtn = el('button', 'note-btn');
      const renderNoteBtn = () => {
        const text = (draft.note || '').replace(/\s+/g, ' ').trim();
        noteBtn.innerHTML = '';
        const ico = el('span', 'ico');
        ico.appendChild(svg(Util.ICONS.note, 15));
        add(noteBtn, ico, el('span', 'txt', text || '内容：写正文、细节、备忘，可当记事本用'));
        noteBtn.classList.toggle('has', !!text);
      };
      renderNoteBtn();
      this.refreshNoteBtn = renderNoteBtn;
      noteBtn.addEventListener('click', () => this.openNote());
      pop.appendChild(noteBtn);

      const rows = el('div', 'rows');
      pop.appendChild(rows);

      /* 清单 */
      const listRow = add(el('div', 'row'), el('div', 'k'));
      listRow.firstChild.appendChild(svg(Util.ICONS.list, 14));
      listRow.firstChild.appendChild(el('span', null, '清单'));
      const listVal = el('div', 'v');
      const listChip = el('button', 'chip');
      const renderListChip = () => {
        const list = Store.listById(draft.listId);
        listChip.innerHTML = '';
        const dot = el('span', 'dot');
        dot.style.background = list.color;
        add(listChip, dot, el('span', null, list.name), svg(Util.ICONS.down, 12));
      };
      renderListChip();
      listChip.addEventListener('click', () => {
        if (Dialogs.isMenuOpenFor(listChip)) { Dialogs.closeMenu(); return; }
        const rect = listChip.getBoundingClientRect();
        const items = Store.data.lists.map((l) => ({
          label: l.name,
          icon: Util.ICONS.target,
          onClick: () => { draft.listId = l.id; renderListChip(); listChip.style.color = l.color; }
        }));
        items.push({ type: 'sep' });
        items.push({
          label: '新建清单…',
          icon: Util.ICONS.plus,
          onClick: async () => {
            const name = await Dialogs.prompt({ title: '新建清单', placeholder: '清单名称', value: '' });
            if (!name) return;
            const list = Store.addList(name);
            draft.listId = list.id;
            renderListChip();
          }
        });
        Dialogs.openMenu(items, rect.left, rect.bottom + 6, listChip);
      });
      listChip.style.color = Store.listById(draft.listId).color;
      listVal.appendChild(listChip);
      listRow.appendChild(listVal);
      rows.appendChild(listRow);

      /* 时间 */
      const timeRow = add(el('div', 'row'), el('div', 'k'));
      timeRow.firstChild.appendChild(svg(Util.ICONS.clock, 14));
      timeRow.firstChild.appendChild(el('span', null, '时间'));
      const timeVal = el('div', 'v');
      const dateInput = el('input');
      dateInput.type = 'date';
      dateInput.value = draft.date;
      const startInput = el('input');
      startInput.type = 'time';
      startInput.value = Util.fmtTime(draft.start);
      const tilde = el('span', 'tilde', '–');
      const endInput = el('input');
      endInput.type = 'time';
      endInput.value = Util.fmtTime(draft.end);
      const allDayChip = el('button', 'chip' + (draft.allDay ? ' on' : ''), '全天');

      const syncTimeVisibility = () => {
        const hide = draft.allDay;
        startInput.style.display = hide ? 'none' : '';
        tilde.style.display = hide ? 'none' : '';
        endInput.style.display = hide ? 'none' : '';
        allDayChip.classList.toggle('on', hide);
        hint.textContent = Util.cnDate(Util.parseYmd(draft.date)) + ' ' + Util.WEEKDAYS[Util.parseYmd(draft.date).getDay()] +
          (hide ? ' · 全天' : ' · ' + Util.fmtTime(draft.start) + ' – ' + Util.fmtTime(draft.end) + '（' + Util.duration(draft.end - draft.start) + '）');
      };
      dateInput.addEventListener('change', () => { draft.date = dateInput.value || Util.today(); syncTimeVisibility(); });
      startInput.addEventListener('change', () => {
        draft.start = Util.parseTime(startInput.value);
        if (draft.end <= draft.start) { draft.end = Math.min(1440, draft.start + 60); endInput.value = Util.fmtTime(draft.end); }
        startInput.value = Util.fmtTime(draft.start);
        syncTimeVisibility();
      });
      endInput.addEventListener('change', () => {
        draft.end = Util.parseTime(endInput.value);
        if (draft.end <= draft.start) { draft.end = Math.min(1440, draft.start + 15); }
        endInput.value = Util.fmtTime(draft.end);
        syncTimeVisibility();
      });
      allDayChip.addEventListener('click', () => { draft.allDay = !draft.allDay; syncTimeVisibility(); });
      add(timeVal, dateInput, startInput, tilde, endInput, allDayChip);
      timeRow.appendChild(timeVal);
      rows.appendChild(timeRow);

      /* 优先级 */
      const prioRow = add(el('div', 'row'), el('div', 'k'));
      prioRow.firstChild.appendChild(svg(Util.ICONS.flag, 14));
      prioRow.firstChild.appendChild(el('span', null, '优先级'));
      const prioVal = el('div', 'v');
      const prios = [
        { v: 0, label: '无' },
        { v: 1, label: '低' },
        { v: 2, label: '中' },
        { v: 3, label: '高' }
      ];
      const prioChips = prios.map((p) => {
        const chip = el('button', 'chip' + (draft.priority === p.v ? ' on' : ''), p.label);
        if (p.v === 2) chip.style.color = 'inherit';
        chip.addEventListener('click', () => {
          draft.priority = p.v;
          prioChips.forEach((c, i) => c.classList.toggle('on', prios[i].v === p.v));
        });
        prioVal.appendChild(chip);
        return chip;
      });
      prioRow.appendChild(prioVal);
      rows.appendChild(prioRow);

      /* 底部按钮 */
      const foot = el('div', 'pop-foot');
      if (isEdit) {
        const del = el('button', 'btn danger');
        add(del, svg(Util.ICONS.trash, 14), el('span', null, '删除'));
        del.addEventListener('click', async () => {
          const ok = await Dialogs.confirm({ title: '删除任务', message: '「' + (draft.title || '未命名任务') + '」将被删除，此操作可以撤销。', okText: '删除', danger: true });
          if (!ok) return;
          Dialogs.closePop();
          Store.removeTask(draft.id);
          Toast.show('已删除', 'error');
        });
        foot.appendChild(del);
      }
      const spacer = el('div', 'spacer');
      const cancel = el('button', 'btn outline', '取消');
      const save = el('button', 'btn primary', isEdit ? '保存' : '确定');
      cancel.addEventListener('click', () => Dialogs.closePop());
      const doSave = () => {
        this.syncNoteToDraft();
        const titleValue = title.value.trim();
        if (!titleValue) { title.focus(); title.style.boxShadow = '0 0 0 1.5px var(--danger)'; return; }
        dialogsSave(draft, titleValue, draft.note, isEdit);
        Dialogs.closePop();
      };
      save.addEventListener('click', doSave);
      title.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); doSave(); }
      });
      add(foot, spacer, cancel, save);
      pop.appendChild(foot);

      this.current = draft;
      syncTimeVisibility();
      this.place(opts.anchor || { x: window.innerWidth / 2, y: 120 });
      title.focus();
      if (isEdit) title.select();
    },

    /* ------------------------------ 设置面板 ------------------------------ */

    openSettings(anchor, owner) {
      this.closeNote();
      this.popOwner = owner || null;
      const pop = this.pop;
      pop.innerHTML = '';
      pop.hidden = false;
      pop.classList.add('settings-panel');

      const s = Store.settings;
      pop.appendChild(el('h3', null, '设置'));
      pop.appendChild(el('div', 'sub', '所有数据都保存在你自己的电脑上'));

      const block1 = el('div', 'set-block');
      block1.style.borderTop = '0';
      block1.appendChild(el('div', 'k', '主题'));
      const themeSeg = el('div', 'seg');
      [['light', '浅色'], ['dark', '深色']].forEach((pair) => {
        const b = el('button', s.theme === pair[0] ? 'on' : '', pair[1]);
        b.addEventListener('click', () => { Store.setSetting('theme', pair[0]); Dialogs.closePop(); });
        themeSeg.appendChild(b);
      });
      block1.appendChild(themeSeg);
      pop.appendChild(block1);

      pop.appendChild(this.segBlock('每周起始日', [['1', '周一'], ['0', '周日']].map((p) => ({ value: Number(p[0]), label: p[1] })), 'weekStart'));

      const b3 = el('div', 'set-block');
      b3.appendChild(el('div', 'k', '时间刻度'));
      const seg = el('div', 'seg');
      [[44, '紧凑'], [56, '标准'], [72, '宽松']].forEach((pair) => {
        const b = el('button', s.hourHeight === pair[0] ? 'on' : '', pair[1]);
        b.addEventListener('click', () => { Store.setSetting('hourHeight', pair[0]); Dialogs.closePop(); });
        seg.appendChild(b);
      });
      b3.appendChild(seg);
      pop.appendChild(b3);

      const snapBlock = this.segBlock('吸附精度（分钟）', [
        { value: 5, label: '5' },
        { value: 10, label: '10' },
        { value: 15, label: '15' },
        { value: 30, label: '30' }
      ], 'snap');
      snapBlock.appendChild(el('div', 'set-note', '按住 Shift 拖动 / 悬停，可精确到 1 分钟'));
      pop.appendChild(snapBlock);

      const b4 = el('div', 'set-block');
      const line = el('div', 'set-line');
      line.appendChild(el('div', 'k', '显示已完成的任务'));
      const sw = el('div', 'switch' + (s.showDone ? ' on' : ''));
      sw.addEventListener('click', () => { Store.setSetting('showDone', !s.showDone); Dialogs.closePop(); });
      line.appendChild(sw);
      b4.appendChild(line);
      pop.appendChild(b4);

      const b5 = el('div', 'set-block');
      b5.appendChild(el('div', 'k', '数据'));
      const btns = el('div', 'set-line');
      const openDir = el('button', 'btn outline');
      add(openDir, svg(Util.ICONS.folder, 14), el('span', null, '数据文件夹'));
      openDir.addEventListener('click', () => {
        if (window.desktop) window.desktop.openDataDir();
        else Toast.show('浏览器版本无此功能');
      });
      const exp = el('button', 'btn outline', '导出');
      exp.addEventListener('click', async () => {
        if (!window.desktop) return Toast.show('浏览器版本请直接复制数据');
        const r = await window.desktop.exportData(Store.data);
        if (r && r.ok) Toast.show('已导出到 ' + r.filePath);
      });
      const imp = el('button', 'btn outline', '导入');
      imp.addEventListener('click', async () => {
        if (!window.desktop) return;
        const r = await window.desktop.importData();
        if (r && r.ok) {
          const go = await Dialogs.confirm({ title: '导入数据', message: '导入会覆盖当前所有任务和清单，确定继续吗？', okText: '导入并覆盖' });
          if (!go) return;
          Store.replaceData(r.data);
          Dialogs.closePop();
          Toast.show('导入完成');
        }
      });
      add(btns, openDir, exp, imp);
      b5.appendChild(btns);
      pop.appendChild(b5);

      const b6 = el('div', 'set-block');
      b6.appendChild(el('div', 'k', '备份与恢复'));
      const backupList = el('div', 'backup-list');
      backupList.appendChild(el('div', 'set-note', '正在读取备份…'));
      b6.appendChild(backupList);
      b6.appendChild(el('div', 'set-note', '每天第一次打开会自动留一份快照（保留最近 30 份）；恢复前也会自动备份当前数据。'));
      pop.appendChild(b6);

      const fillBackups = async () => {
        backupList.innerHTML = '';
        if (!window.desktop || !window.desktop.listBackups) {
          backupList.appendChild(el('div', 'set-note', '浏览器版本没有自动备份'));
          return;
        }
        let list = [];
        try {
          const r = await window.desktop.listBackups();
          list = (r && r.list) || [];
        } catch { /* 忽略 */ }
        if (!list.length) {
          backupList.appendChild(el('div', 'set-note', '还没有备份。从明天起，每天第一次打开都会自动留一份。'));
          return;
        }
        const p2 = (n) => String(n).padStart(2, '0');
        list.slice(0, 20).forEach((item) => {
          const row = el('div', 'backup-item');
          const meta = el('div', 'backup-meta');
          meta.appendChild(el('div', 'backup-label', item.label));
          const d = new Date(item.time);
          const size = item.size >= 1024 ? (item.size / 1024).toFixed(1) + ' KB' : item.size + ' B';
          meta.appendChild(el('div', 'backup-time',
            d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()) + ' ' +
            p2(d.getHours()) + ':' + p2(d.getMinutes()) + ' · ' + size));
          row.appendChild(meta);
          const btn = el('button', 'btn outline', '恢复');
          btn.addEventListener('click', async () => {
            const ok = await Dialogs.confirm({
              title: '恢复数据',
              message: '将把任务恢复到「' + item.label + '」。当前数据会先自动另存一份，确定继续吗？',
              okText: '恢复',
              danger: true
            });
            if (!ok) return;
            const res = await window.desktop.restoreBackup(item.file);
            if (res && res.ok) {
              Store.replaceData(res.data);
              Dialogs.closePop();
              Toast.show('已恢复到 ' + item.label);
            } else {
              Toast.show('恢复失败：' + ((res && res.error) || '未知错误'), 'error');
            }
          });
          row.appendChild(btn);
          backupList.appendChild(row);
        });
      };
      fillBackups();

      const info = el('div', 'set-note', '数据文件：' + (Store.dataFile || '（浏览器本地存储）'));
      pop.appendChild(info);

      this.place(anchor);
    },

    segBlock(title, options, key) {
      const block = el('div', 'set-block');
      block.appendChild(el('div', 'k', title));
      const seg = el('div', 'seg');
      options.forEach((opt) => {
        const b = el('button', Store.settings[key] === opt.value ? 'on' : '', opt.label);
        b.addEventListener('click', () => { Store.setSetting(key, opt.value); Dialogs.closePop(); });
        seg.appendChild(b);
      });
      block.appendChild(seg);
      return block;
    },

    listMenu(list, x, y, owner) {
      if (this.isMenuOpenFor(owner)) { this.closeMenu(); return; }
      this.openMenu([
        {
          label: '重命名',
          icon: Util.ICONS.edit,
          onClick: async () => {
            const name = await Dialogs.prompt({ title: '重命名清单', value: list.name });
            if (name) Store.updateList(list.id, { name: name });
          }
        },
        {
          label: '只看这个清单',
          icon: Util.ICONS.target,
          onClick: () => { Store.ui.filterListId = list.id; Store.emit(); }
        },
        { type: 'sep' },
        { type: 'label', label: '颜色' },
        { type: 'swatches', onPick: (color) => Store.updateList(list.id, { color: color }) },
        { type: 'sep' },
        {
          label: '删除清单',
          icon: Util.ICONS.trash,
          danger: true,
          onClick: async () => {
            const ok = await Dialogs.confirm({
              title: '删除清单',
              message: '「' + list.name + '」里的任务会移动到第一个清单，不会被删除。',
              okText: '删除',
              danger: true
            });
            if (ok) Store.removeList(list.id);
          }
        }
      ], x, y, owner);
    },

    deadlineMenu(dl, x, y, owner) {
      if (this.isMenuOpenFor(owner)) { this.closeMenu(); return; }
      this.openMenu([
        {
          label: '编辑',
          icon: Util.ICONS.edit,
          onClick: async () => {
            const res = await Dialogs.deadlinePrompt({ title: '编辑死亡线', name: dl.title, due: dl.due, id: dl.id });
            if (res) Store.updateDeadline(dl.id, res);
          }
        },
        { type: 'sep' },
        {
          label: '删除',
          icon: Util.ICONS.trash,
          danger: true,
          onClick: async () => {
            const ok = await Dialogs.confirm({
              title: '删除死亡线',
              message: '「' + dl.title + '」将从倒计时里移除，此操作可以撤销。',
              okText: '删除',
              danger: true
            });
            if (ok) Store.removeDeadline(dl.id);
          }
        }
      ], x, y, owner);
    }
  };

  function dialogsSave(draft, titleValue, noteValue, isEdit) {
    const payload = {
      title: titleValue,
      note: noteValue,
      listId: draft.listId,
      date: draft.date,
      start: draft.start,
      end: draft.end,
      allDay: draft.allDay,
      priority: draft.priority
    };
    if (isEdit) {
      Store.updateTask(draft.id, payload);
      Toast.show('已保存');
    } else {
      const t = Store.addTask(payload);
      const node = document.querySelector('.task[data-id="' + t.id + '"]');
      if (node) node.classList.add('highlight');
      Toast.show('已添加 · ' + Util.fmtTime(t.start) + ' – ' + Util.fmtTime(t.end));
    }
  }

  window.Dialogs = Dialogs;
  window.Toast = { show: (m, t) => Dialogs.toast(m, t) };
})();
