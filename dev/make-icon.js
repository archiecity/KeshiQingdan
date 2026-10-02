'use strict';
/*
 * 生成应用图标：build/icon.ico、build/icon.png、src/assets/icon.png
 * 纯 Node 实现（zlib 压缩 + 手写 PNG / ICO），不依赖任何三方库。
 * 运行：node dev/make-icon.js
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.join(__dirname, '..');
const SS = 4; // 超采样倍数，用于抗锯齿

/* ------------------------------- 绘制 ------------------------------- */

const GRAD_TOP = [0x60, 0x8d, 0xff];
const GRAD_BOTTOM = [0x3a, 0x5f, 0xe8];

function mix(a, b, t) {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t)
  ];
}

/* 圆角矩形覆盖测试（归一化坐标） */
function inRoundRect(x, y, rx0, ry0, rx1, ry1, r) {
  if (x < rx0 || x > rx1 || y < ry0 || y > ry1) return false;
  const cx = Math.min(Math.max(x, rx0 + r), rx1 - r);
  const cy = Math.min(Math.max(y, ry0 + r), ry1 - r);
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= r * r;
}

/* 归一化坐标下的颜色（含 alpha），无覆盖时返回 null */
const BARS = [
  { x: 0.215, h: 0.33 },
  { x: 0.415, h: 0.52 },
  { x: 0.615, h: 0.42 }
];
const BAR_W = 0.155;
const BASE_Y = 0.755;

function sample(x, y) {
  const R = 0.235; // 圆角半径
  if (!inRoundRect(x, y, 0, 0, 1, 1, R)) return null;

  const bg = mix(GRAD_TOP, GRAD_BOTTOM, Math.min(1, Math.max(0, (y - 0.04) / 0.92)));

  for (const bar of BARS) {
    const top = BASE_Y - bar.h;
    if (inRoundRect(x, y, bar.x, top, bar.x + BAR_W, BASE_Y, BAR_W / 2)) {
      return [255, 255, 255, 255];
    }
  }
  return [bg[0], bg[1], bg[2], 255];
}

function renderRGBA(size) {
  const big = size * SS;
  const out = Buffer.alloc(size * size * 4);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const x = (px * SS + sx + 0.5) / big;
          const y = (py * SS + sy + 0.5) / big;
          const c = sample(x, y);
          if (c) { r += c[0]; g += c[1]; b += c[2]; a += 255; }
        }
      }
      const n = SS * SS;
      const i = (py * size + px) * 4;
      const cover = a / n;
      if (cover > 0) {
        out[i] = Math.round(r / (a / 255));
        out[i + 1] = Math.round(g / (a / 255));
        out[i + 2] = Math.round(b / (a / 255));
        out[i + 3] = Math.round(cover);
      }
    }
  }
  return out;
}

/* ------------------------------- PNG ------------------------------- */

let CRC_TABLE = null;
function crc32(buf) {
  if (zlib.crc32) return zlib.crc32(buf) >>> 0;
  if (!CRC_TABLE) {
    CRC_TABLE = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      CRC_TABLE[n] = c;
    }
  }
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodePNG(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

/* ------------------------------- ICO ------------------------------- */

function encodeICOBMP(size, rgba) {
  const header = Buffer.alloc(40);
  header.writeUInt32LE(40, 0);
  header.writeInt32LE(size, 4);
  header.writeInt32LE(size * 2, 8);
  header.writeUInt16LE(1, 12);
  header.writeUInt16LE(32, 14);
  header.writeUInt32LE(0, 16);
  header.writeUInt32LE(size * size * 4, 20);

  const pixels = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    const src = (size - 1 - y) * size * 4;
    for (let x = 0; x < size; x++) {
      const i = src + x * 4;
      const o = (y * size + x) * 4;
      pixels[o] = rgba[i + 2];
      pixels[o + 1] = rgba[i + 1];
      pixels[o + 2] = rgba[i];
      pixels[o + 3] = rgba[i + 3];
    }
  }

  const maskRow = Math.ceil(size / 32) * 4;
  const mask = Buffer.alloc(maskRow * size, 0);
  return Buffer.concat([header, pixels, mask]);
}

function encodeICO(entries) {
  const dir = Buffer.alloc(6);
  dir.writeUInt16LE(0, 0);
  dir.writeUInt16LE(1, 2);
  dir.writeUInt16LE(entries.length, 4);

  let offset = 6 + entries.length * 16;
  const dirEntries = [];
  const blobs = [];
  for (const e of entries) {
    const data = encodeICOBMP(e.size, e.rgba);
    const b = Buffer.alloc(16);
    b[0] = e.size >= 256 ? 0 : e.size;
    b[1] = e.size >= 256 ? 0 : e.size;
    b[2] = 0;
    b[3] = 0;
    b.writeUInt16LE(1, 4);
    b.writeUInt16LE(32, 6);
    b.writeUInt32LE(data.length, 8);
    b.writeUInt32LE(offset, 12);
    offset += data.length;
    dirEntries.push(b);
    blobs.push(data);
  }
  return Buffer.concat([dir].concat(dirEntries, blobs));
}

/* ------------------------------- 输出 ------------------------------- */

const sizes = [256, 128, 64, 48, 32, 16];
const rendered = sizes.map((size) => ({ size, rgba: renderRGBA(size) }));

fs.mkdirSync(path.join(ROOT, 'build'), { recursive: true });
fs.mkdirSync(path.join(ROOT, 'src', 'assets'), { recursive: true });

const main = rendered[0];
fs.writeFileSync(path.join(ROOT, 'src', 'assets', 'icon.png'), encodePNG(256, main.rgba));
fs.writeFileSync(path.join(ROOT, 'build', 'icon.png'), encodePNG(256, main.rgba));
fs.writeFileSync(path.join(ROOT, 'build', 'icon.ico'), encodeICO(rendered));

console.log('icon.ico / icon.png 已生成：' + sizes.join(', '));
