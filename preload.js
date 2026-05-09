const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("pomodoroWindow", {
  minimize: () => ipcRenderer.invoke("window:minimize"),
  close: () => ipcRenderer.invoke("window:close"),
  toggleTop: () => ipcRenderer.invoke("window:toggle-top"),
  selectAudioFile: () => ipcRenderer.invoke("audio:select-file")
});
