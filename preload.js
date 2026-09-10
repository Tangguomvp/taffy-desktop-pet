const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("pet", {
  ignoreMouse: (ignore) => ipcRenderer.send("ignore-mouse", ignore),
  moveBy: (dx, dy) => ipcRenderer.send("move-by", dx, dy),
  walkStep: (direction, distance) => ipcRenderer.invoke("walk-step", direction, distance),
  startDrag: (clientX, clientY) => ipcRenderer.send("drag-start", clientX, clientY),
  endDrag: () => ipcRenderer.send("drag-end"),
  loaderDone: () => ipcRenderer.send("loader-done"),
  setSize: (width, height) => ipcRenderer.send("set-size", width, height),
  setFootDock: (open) => ipcRenderer.invoke("set-foot-dock", open),
  toggleTop: () => ipcRenderer.invoke("toggle-top"),
  isTop: () => ipcRenderer.invoke("is-top"),
  chat: (history) => ipcRenderer.invoke("llm-chat", history),
  setApiKey: (key) => ipcRenderer.send("set-api-key", key),
  getSettings: () => ipcRenderer.invoke("get-settings"),
  setSettings: (partial) => ipcRenderer.invoke("set-settings", partial),
  onSettings: (cb) => {
    const listener = (_event, data) => cb(data);
    ipcRenderer.on("settings-changed", listener);
    return () => ipcRenderer.removeListener("settings-changed", listener);
  },
  openSettings: () => ipcRenderer.send("open-settings"),
  petCommand: (cmd) => ipcRenderer.send("pet-command", cmd),
  openStudio: (mode) => ipcRenderer.send("open-studio", mode),
  studioApplyOutfit: (id) => ipcRenderer.send("studio-apply-outfit", id),
  studioPlayAction: (motion) => ipcRenderer.send("studio-play-action", motion),
  checkUpdate: () => ipcRenderer.invoke("check-update"),
  installUpdate: () => ipcRenderer.send("install-update"),
  onUpdate: (channel, cb) => {
    const listener = (_event, data) => cb(data);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  },
  onTrayCommand: (cb) => {
    const listener = (_event, cmd) => cb(cmd);
    ipcRenderer.on("tray-command", listener);
    return () => ipcRenderer.removeListener("tray-command", listener);
  },
  quit: () => ipcRenderer.send("quit"),
  listOutfits: () => ipcRenderer.invoke("list-outfits"),
  importOutfit: () => ipcRenderer.invoke("import-outfit"),
  removeOutfit: (id) => ipcRenderer.invoke("remove-outfit", id),
});
