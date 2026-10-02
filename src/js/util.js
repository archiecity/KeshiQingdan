(function () {
  'use strict';

  const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  const WEEKDAYS_SHORT = ['日', '一', '二', '三', '四', '五', '六'];

  const Util = {
    WEEKDAYS,
    WEEKDAYS_SHORT,

    pad: (n) => String(n).padStart(2, '0'),

    /* ---------- 日期 ---------- */
    ymd(d) {
      return `${d.getFullYear()}-${Util.pad(d.getMonth() + 1)}-${Util.pad(d.getDate())}`;
    },
    parseYmd(s) {
      const [y, m, d] = String(s).split('-').map(Number);
      return new Date(y, m - 1, d);
    },
    today() {
      return Util.ymd(new Date());
    },
    addDays(d, n) {
      return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
    },
    addMonths(d, n) {
      return new Date(d.getFullYear(), d.getMonth() + n, d.getDate());
    },
    startOfWeek(d, weekStart) {
      const ws = weekStart === 0 ? 0 : 1;
      const diff = ((d.getDay() - ws) % 7 + 7) % 7;
      return Util.addDays(d, -diff);
    },
    isSameDay(a, b) {
      return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
    },
    isToday(d) {
      return Util.isSameDay(d, new Date());
    },
    isWeekend(d) {
      const w = d.getDay();
      return w === 0 || w === 6;
    },
    cnDate(d) {
      return `${d.getMonth() + 1}月${d.getDate()}日`;
    },
    cnDateFull(d) {
      return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 · ${WEEKDAYS[d.getDay()]}`;
    },

    /* ---------- 时间 ---------- */
    fmtTime(min) {
      const m = ((Math.round(min) % 1440) + 1440) % 1440;
      return `${Util.pad(Math.floor(m / 60))}:${Util.pad(m % 60)}`;
    },
    parseTime(str) {
      const [h, m] = String(str).split(':').map(Number);
      if (Number.isNaN(h)) return 0;
      return Math.min(1439, h * 60 + (m || 0));
    },
    clamp(v, a, b) {
      return Math.max(a, Math.min(b, v));
    },
    duration(min) {
      const h = Math.floor(min / 60);
      const m = min % 60;
      if (h && m) return `${h} 小时 ${m} 分`;
      if (h) return `${h} 小时`;
      return `${m} 分钟`;
    },

    /* ---------- 其它 ---------- */
    uid() {
      return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    },
    clone(obj) {
      return JSON.parse(JSON.stringify(obj));
    },
    color(hex, alpha) {
      const h = String(hex || '#4C7DFA').replace('#', '');
      const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
      const r = parseInt(full.slice(0, 2), 16);
      const g = parseInt(full.slice(2, 4), 16);
      const b = parseInt(full.slice(4, 6), 16);
      return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    },
    el(tag, className, text) {
      const node = document.createElement(tag);
      if (className) node.className = className;
      if (text != null) node.textContent = text;
      return node;
    },
    svg(path, size) {
      const ns = 'http://www.w3.org/2000/svg';
      const s = document.createElementNS(ns, 'svg');
      s.setAttribute('viewBox', '0 0 24 24');
      s.setAttribute('width', size || 16);
      s.setAttribute('height', size || 16);
      s.setAttribute('fill', 'none');
      s.setAttribute('stroke', 'currentColor');
      s.setAttribute('stroke-width', '1.8');
      s.setAttribute('stroke-linecap', 'round');
      s.setAttribute('stroke-linejoin', 'round');
      const p = document.createElementNS(ns, 'path');
      p.setAttribute('d', path);
      s.appendChild(p);
      return s;
    },
    debounce(fn, wait) {
      let timer = null;
      const wrapped = function (...args) {
        clearTimeout(timer);
        timer = setTimeout(() => fn.apply(this, args), wait);
      };
      wrapped.flush = function (...args) {
        clearTimeout(timer);
        fn.apply(this, args);
      };
      return wrapped;
    }
  };

  Util.ICONS = {
    clock: 'M12 6v6l4 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z',
    calendar: 'M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z',
    list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
    plus: 'M12 5v14M5 12h14',
    search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16ZM21 21l-4.35-4.35',
    left: 'M15 18l-6-6 6-6',
    right: 'M9 18l6-6-6-6',
    down: 'M6 9l6 6 6-6',
    check: 'M20 6 9 17l-5-5',
    trash: 'M3 6h18M8 6V4h8v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6',
    close: 'M18 6 6 18M6 6l12 12',
    sun: 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10ZM12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42',
    moon: 'M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z',
    gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z',
    folder: 'M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.5l-2-2H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2Z',
    note: 'M4 4h16v12l-4 4H4V4Z M16 20v-4h4',
    flag: 'M4 22V4h11l-1.5 4L15 12H4',
    copy: 'M8 8h11a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z M4 16V4h12',
    edit: 'M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z',
    undo: 'M3 7v6h6M3.5 13a9 9 0 1 0 2.1-9.4L3 7',
    inbox: 'M22 12h-6l-2 3h-4l-2-3H2M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11Z',
    sun2: 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10Z',
    target: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z M12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12Z M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z'
  };

  window.Util = Util;
})();
