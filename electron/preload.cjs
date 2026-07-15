const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  readPaths: (dirPath) => ipcRenderer.invoke('read-paths', dirPath),
  writePath: (dirPath, name, data) => ipcRenderer.invoke('write-path', dirPath, name, data),
  selectDir: () => ipcRenderer.invoke('select-dir')
});
