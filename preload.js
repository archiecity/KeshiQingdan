'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktop', {
  isDesktop: true,
  platform: process.platform,

  load: () => ipcRenderer.invoke('store:load'),
  save: (data) => ipcRenderer.invoke('store:save', data),
  info: () => ipcRenderer.invoke('app:info'),

  exportData: (data) => ipcRenderer.invoke('store:export', data),
  importData: () => ipcRenderer.invoke('store:import'),
  listBackups: () => ipcRenderer.invoke('store:list-backups'),
  restoreBackup: (file) => ipcRenderer.invoke('store:restore', file),
  openDataDir: () => ipcRenderer.invoke('app:open-data-dir'),

  setTheme: (theme) => ipcRenderer.invoke('theme:set', theme),
  windowState: (state) => ipcRenderer.send('window:state', state)
});
