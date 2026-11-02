// QA 用的 window.pet 桩：让桌宠渲染层能在隐藏窗口里独立跑起来（不连主进程）
const { contextBridge } = require("electron");
const noop = () => {};
const off = () => () => {};
const commandListeners = [];

contextBridge.exposeInMainWorld("pet", {
  ignoreMouse: noop,
  moveBy: noop,
  startDrag: noop,
  endDrag: noop,
  loaderDone: noop,
  setSize: noop,
  setApiKey: noop,
  openSettings: noop,
  petCommand: noop,
  openStudio: noop,
  studioApplyOutfit: noop,
  studioPlayAction: noop,
  installUpdate: noop,
  quit: noop,
  walkStep: () => Promise.resolve({ x: 0, movedX: 0, direction: 1, hitEdge: false, distToEdge: 400 }),
  setFootDock: () => Promise.resolve({ height: 0 }),
  toggleTop: () => Promise.resolve(true),
  isTop: () => Promise.resolve(false),
  chat: () => Promise.resolve({ content: "EMOTION: smile\n喵" }),
  getSettings: () => Promise.resolve({ walkMode: false, walkModeSaved: true, top: false }),
  setSettings: () => Promise.resolve({}),
  checkUpdate: () => Promise.resolve({ status: "none" }),
  listOutfits: () => Promise.resolve([]),
  importOutfit: () => Promise.resolve({ ok: false, error: "cancel" }),
  removeOutfit: () => Promise.resolve({ ok: true }),
  onSettings: off,
  onUpdate: off,
  onTrayCommand: (cb) => {
    commandListeners.push(cb);
    return () => {};
  },
});
