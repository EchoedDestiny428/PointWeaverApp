const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  readPaths: (dirPath) => ipcRenderer.invoke('read-paths', dirPath),
  writePath: (dirPath, name, data) => ipcRenderer.invoke('write-path', dirPath, name, data),
  renamePath: (dirPath, oldName, newName) => ipcRenderer.invoke('rename-path', dirPath, oldName, newName),
  deletePath: (dirPath, name) => ipcRenderer.invoke('delete-path', dirPath, name),
  selectDir: () => ipcRenderer.invoke('select-dir')
});
