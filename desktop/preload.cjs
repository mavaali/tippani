const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("tippani", {
  load: () => ipcRenderer.invoke("desktop-load"),
  accounts: () => ipcRenderer.invoke("desktop-accounts"),
  signIn: () => ipcRenderer.invoke("desktop-sign-in"),
  cliHelp: () => ipcRenderer.invoke("desktop-cli-help"),
  start: setup => ipcRenderer.invoke("desktop-start", setup),
  pickLocal: () => ipcRenderer.invoke("desktop-pick-local"),
  open: () => ipcRenderer.invoke("desktop-open"),
  stop: () => ipcRenderer.invoke("desktop-stop"),
  quit: () => ipcRenderer.invoke("desktop-quit"),
  onStatus: callback => ipcRenderer.on("desktop-status", (_event, message) => callback(message)),
  onAuthStatus: callback => ipcRenderer.on("desktop-auth-status", (_event, message) => callback(message)),
});
