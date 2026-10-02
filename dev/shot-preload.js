'use strict';
// 截图用的空 preload：不暴露任何桥接，让页面走 localStorage 分支
window.addEventListener('error', (e) => {
  window.__errors = window.__errors || [];
  window.__errors.push(String(e.message));
});
window.addEventListener('unhandledrejection', (e) => {
  window.__errors = window.__errors || [];
  window.__errors.push('unhandled: ' + String(e.reason && e.reason.message || e.reason));
});
