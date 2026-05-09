const { app, BrowserWindow, dialog, ipcMain, nativeImage } = require("electron");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 560,
    height: 620,
    minWidth: 340,
    minHeight: 260,
    alwaysOnTop: true,
    resizable: true,
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    title: "ポモドーロ",
    icon: nativeImage.createEmpty(),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false
    }
  });

  mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  mainWindow.setAlwaysOnTop(true, "screen-saver");
  mainWindow.loadFile("index.html");
}

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

ipcMain.handle("window:minimize", () => {
  mainWindow?.minimize();
});

ipcMain.handle("window:close", () => {
  mainWindow?.close();
});

ipcMain.handle("window:toggle-top", () => {
  if (!mainWindow) return false;
  const next = !mainWindow.isAlwaysOnTop();
  mainWindow.setAlwaysOnTop(next, "screen-saver");
  return next;
});

ipcMain.handle("audio:select-file", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "アラームに使う音楽を選択",
    properties: ["openFile"],
    filters: [
      { name: "Audio", extensions: ["mp3", "m4a", "aac", "wav", "ogg", "flac"] },
      { name: "All Files", extensions: ["*"] }
    ]
  });

  if (result.canceled || result.filePaths.length === 0) return null;

  const filePath = result.filePaths[0];
  return {
    path: filePath,
    url: pathToFileURL(filePath).href,
    name: path.basename(filePath)
  };
});
