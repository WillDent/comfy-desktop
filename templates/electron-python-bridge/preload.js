const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('pythonBridge', {
  invoke: (prompt) => ipcRenderer.invoke('python:invoke', { prompt }),
});
