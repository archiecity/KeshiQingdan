'use strict';
/*
 * 把应用打包成自带运行时的绿色版：
 *   可视清单/可视清单.exe          主程序
 *   可视清单/resources/app/        应用代码
 *   可视清单/data/                 任务数据（首次运行自动创建）
 * 运行：node dev/build-portable.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, '可视清单');
const RES_APP = path.join(OUT, 'resources', 'app');

const FILES = ['package.json', 'main.js', 'preload.js'];
const DIRS = ['src', 'build'];
const EXE_FROM = 'electron.exe';
const EXE_TO = '可视清单.exe';

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const src = path.join(from, entry.name);
    const dst = path.join(to, entry.name);
    if (entry.isDirectory()) copyDir(src, dst);
    else fs.copyFileSync(src, dst);
  }
}

if (!fs.existsSync(path.join(OUT, EXE_FROM)) && !fs.existsSync(path.join(OUT, EXE_TO))) {
  const dist = path.join(ROOT, 'node_modules', 'electron', 'dist');
  if (fs.existsSync(path.join(dist, EXE_FROM))) {
    console.log('首次打包：从 node_modules/electron/dist 复制运行时…');
    copyDir(dist, OUT);
  } else {
    console.error('找不到 Electron 运行时：请先运行 npm install，或把 electron.exe 放进 可视清单/ 目录');
    process.exit(1);
  }
}

if (fs.existsSync(path.join(OUT, EXE_FROM))) {
  fs.renameSync(path.join(OUT, EXE_FROM), path.join(OUT, EXE_TO));
}

fs.mkdirSync(RES_APP, { recursive: true });
for (const file of FILES) fs.copyFileSync(path.join(ROOT, file), path.join(RES_APP, file));
for (const dir of DIRS) copyDir(path.join(ROOT, dir), path.join(RES_APP, dir));

console.log('打包完成：' + path.join(OUT, EXE_TO));
