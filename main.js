const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, screen, dialog } = require("electron");
const path = require("path");
const fs = require("fs");
const { pathToFileURL } = require("url");
const { spawn } = require("child_process");
const { autoUpdater } = require("electron-updater");
const { advanceWithinWorkArea } = require("./window-motion.cjs");

// ---------- 自动更新配置 ----------
// 默认从 GitHub Releases 拉取更新（latest.yml + 安装包）。
// 设置环境变量 TAFFY_UPDATE_URL 可改用自定义 generic 源；TAFFY_UPDATE=0 关闭自动更新。
const GITHUB_UPDATE = { owner: "Tangguomvp", repo: "taffy-desktop-pet" };
const UPDATE_FEED_URL = process.env.TAFFY_UPDATE_URL || "";
const useAutoUpdate = app.isPackaged && process.env.TAFFY_UPDATE !== "0";
let updateDownloaded = false;
let updateAvailableVersion = "";

function sendToRenderer(channel, data) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, data);
  if (settingsWin && !settingsWin.isDestroyed()) settingsWin.webContents.send(channel, data);
}

if (useAutoUpdate) {
  if (UPDATE_FEED_URL) {
    autoUpdater.setFeedURL({ provider: "generic", url: UPDATE_FEED_URL, useMultipleRangeRequest: true });
  } else {
    autoUpdater.setFeedURL({ provider: "github", ...GITHUB_UPDATE });
  }
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("update-available", (info) => {
    updateAvailableVersion = info.version;
    sendToRenderer("update-available", info.version);
  });
  autoUpdater.on("update-not-available", () => sendToRenderer("update-none"));
  autoUpdater.on("download-progress", (p) => sendToRenderer("update-progress", Math.round(p.percent)));
  autoUpdater.on("update-downloaded", (info) => {
    updateDownloaded = true;
    sendToRenderer("update-downloaded", info.version);
  });
  autoUpdater.on("error", (err) => sendToRenderer("update-error", String((err && err.message) || err)));

  // 启动后延迟检查更新
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch(() => {});
  }, 8000);
}
// 查找 setToolWin.exe：兼容开发模式 / 打包目录 / portable 解压布局
function findToolWinExe() {
  const candidates = [
    path.join(process.resourcesPath, "setToolWin.exe"),
    path.join(__dirname, "setToolWin.exe"),
    path.join(path.dirname(process.execPath), "resources", "setToolWin.exe"),
    path.join(path.dirname(process.execPath), "setToolWin.exe"),
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return p;
    } catch {}
  }
  return null;
}

app.commandLine.appendSwitch("enable-transparent-visuals");

// 打包版使用独立配置目录，避免与开发版/他人实例冲突
if (app.isPackaged) {
  app.setPath("userData", path.join(app.getPath("appData"), "TaffyDeskPet"));
}

let win = null;
let settingsWin = null;
const studioWins = { actions: null, outfits: null };
let tray = null;
let alwaysOnTop = true;
const PET_SIZE_STEPS = [
  [200, 310],
  [280, 430],
  [360, 560],
  [460, 720],
];
const FOOT_DOCK_HEIGHT = 52;
let footDock = { open: false, height: 0 };

function setWindowBoundsSafe(x, y, width, height) {
  if (!win || win.isDestroyed()) return;
  const prevResizable = win.isResizable();
  if (!prevResizable) win.setResizable(true);
  win.setBounds({
    x: Math.round(x),
    y: Math.round(y),
    width: Math.round(Math.max(1, width)),
    height: Math.round(Math.max(1, height)),
  });
  win.setResizable(prevResizable);
  applyToolWindow();
}

const settingsPath = path.join(app.getPath("userData"), "pet-settings.json");

function loadSettings() {
  try {
    return JSON.parse(fs.readFileSync(settingsPath, "utf8"));
  } catch {
    return {};
  }
}

function saveSettings(partial) {
  const next = { ...loadSettings(), ...partial };
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  fs.writeFileSync(settingsPath, JSON.stringify(next, null, 2));
}

function defaultBounds() {
  const area = screen.getPrimaryDisplay().workArea;
  const width = 360;
  const height = 560;
  return {
    x: area.x + area.width - width - 24,
    y: area.y + area.height - height - 8,
    width,
    height,
  };
}

// 给窗口加 WS_EX_TOOLWINDOW：隐藏任务栏 / Alt+Tab / 任务视图 / 贴靠布局
// 附带 SWP_FRAMECHANGED：清除 DWM 残留标题栏（防抖，120ms 内最多执行一次）
let toolWinPending = false;
function applyToolWindow() {
  if (!win || win.isDestroyed() || toolWinPending) return;
  toolWinPending = true;
  setTimeout(() => {
    toolWinPending = false;
    try {
      const exe = findToolWinExe();
      if (!exe) return;
      const hwnd = win.getNativeWindowHandle().readBigUInt64LE(0).toString();
      const child = spawn(exe, [hwnd], { stdio: "ignore", windowsHide: true });
      // 异步错误（如 ENOENT）不会抛成 Uncaught Exception 导致崩溃
      child.on("error", () => {});
    } catch {}
  }, 120);
}

function createWindow() {
  const saved = loadSettings();
  if (typeof saved.alwaysOnTop === "boolean") alwaysOnTop = saved.alwaysOnTop;
  const fallback = defaultBounds();
  const width = saved.width || fallback.width;
  const height = saved.height || fallback.height;
  let x = saved.x ?? fallback.x;
  let y = saved.y ?? fallback.y;

  const area = screen.getPrimaryDisplay().workArea;
  if (x < area.x - 80 || y < area.y - 80 || x > area.x + area.width - 80 || y > area.y + area.height - 80) {
    x = fallback.x;
    y = fallback.y;
  }

  win = new BrowserWindow({
    x,
    y,
    width,
    height,
    title: "",
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    hasShadow: false,
    roundedCorners: false,
    thickFrame: false,
    resizable: false,
    skipTaskbar: true,
    alwaysOnTop,
    show: false,
    focusable: true,
    autoHideMenuBar: true,
    fullscreenable: false,
    maximizable: false,
    minimizable: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: false,
    },
  });

  win.setMenu(null);
  win.setAlwaysOnTop(true, "screen-saver");
  win.setBackgroundColor("#00000000");
  win.setMenuBarVisibility(false);
  win.webContents.on("did-start-loading", () => {
    spawnButtonWatcher();
  });
  win.loadFile(path.join(__dirname, "renderer", "index.html"));

  win.once("ready-to-show", () => {
    win.showInactive();
    win.setSkipTaskbar(false);
    win.setSkipTaskbar(true);
    applyToolWindow();
  });

  // 窗口尺寸变化可能触发 DWM 残留标题栏，缩放后立即清除（无需等周期）
  win.on("resize", () => applyToolWindow());

  // 周期加固（1.5s）：防止其他操作触发残留标题栏/样式重置
  setInterval(() => {
    if (win && !win.isDestroyed()) {
      win.setSkipTaskbar(false);
      win.setSkipTaskbar(true);
      applyToolWindow();
    }
  }, 1500);

  // 位置保存防抖：拖动期间 setPosition 高频触发 moved，直接写磁盘会卡顿
  let moveSaveTimer = null;
  win.on("moved", () => {
    if (!win) return;
    const [nx, ny] = win.getPosition();
    if (moveSaveTimer) clearTimeout(moveSaveTimer);
    moveSaveTimer = setTimeout(() => saveSettings({ x: nx, y: ny }), 400);
  });

}

function petSizeIndex(width) {
  let best = 2;
  let dist = Infinity;
  PET_SIZE_STEPS.forEach(([sw], i) => {
    const d = Math.abs(sw - width);
    if (d < dist) {
      dist = d;
      best = i;
    }
  });
  return best;
}

function applyPetSize(width, height) {
  if (!win || win.isDestroyed()) return;
  const [x, y] = win.getPosition();
  const [cw, ch] = win.getSize();
  const prevResizable = win.isResizable();
  if (!prevResizable) win.setResizable(true);
  win.setSize(width, height);
  win.setResizable(prevResizable);
  win.setPosition(Math.round(x + cw - width), Math.round(y + ch - height));
  saveSettings({ width, height });
  applyToolWindow();
}

function collectSettings() {
  const saved = loadSettings();
  let width = saved.width || 360;
  let height = saved.height || 560;
  if (win && !win.isDestroyed()) {
    const size = win.getSize();
    width = size[0];
    height = footDock.open ? Math.max(1, size[1] - footDock.height) : size[1];
  }
  return {
    alwaysOnTop,
    walkMode: Boolean(saved.walkMode),
    walkModeSaved: Object.prototype.hasOwnProperty.call(saved, "walkMode"),
    hasApiKey: Boolean((process.env.DEEPSEEK_API_KEY || saved.deepseekKey || "").trim()),
    sizeIndex: petSizeIndex(width),
    width,
    height,
    version: app.getVersion(),
    canCheckUpdate: useAutoUpdate,
    updateDownloaded,
    updateVersion: updateAvailableVersion,
  };
}

function openSettingsWindow() {
  if (settingsWin && !settingsWin.isDestroyed()) {
    settingsWin.show();
    settingsWin.focus();
    return;
  }
  const iconFile = path.join(__dirname, "icon.png");
  settingsWin = new BrowserWindow({
    width: 420,
    height: 740,
    title: "设置 · 永雏塔菲桌宠",
    show: false,
    resizable: true,
    minWidth: 400,
    minHeight: 560,
    minimizable: true,
    maximizable: false,
    skipTaskbar: false,
    autoHideMenuBar: true,
    icon: fs.existsSync(iconFile) ? iconFile : undefined,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  settingsWin.setMenu(null);
  settingsWin.loadFile(path.join(__dirname, "renderer", "settings.html"));
  settingsWin.once("ready-to-show", () => settingsWin.show());
  settingsWin.on("closed", () => {
    settingsWin = null;
  });
}

function openStudioWindow(mode) {
  const key = mode === "outfits" ? "outfits" : "actions";
  const existing = studioWins[key];
  if (existing && !existing.isDestroyed()) {
    existing.show();
    existing.focus();
    return;
  }
  const iconFile = path.join(__dirname, "icon.png");
  const studio = new BrowserWindow({
    width: 860,
    height: 640,
    title: key === "outfits" ? "换装预览 · 永雏塔菲桌宠" : "动作预览 · 永雏塔菲桌宠",
    show: false,
    resizable: true,
    minWidth: 720,
    minHeight: 520,
    skipTaskbar: false,
    autoHideMenuBar: true,
    icon: fs.existsSync(iconFile) ? iconFile : undefined,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: false,
    },
  });
  studio.setMenu(null);
  studio.loadFile(path.join(__dirname, "renderer", "studio.html"), { query: { mode: key } });
  studio.once("ready-to-show", () => studio.show());
  studio.on("closed", () => {
    studioWins[key] = null;
  });
  studioWins[key] = studio;
}

function createTray() {
  const iconFile = path.join(__dirname, "renderer", "tray.png");
  const image = fs.existsSync(iconFile)
    ? nativeImage.createFromPath(iconFile)
    : nativeImage.createFromDataURL(
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAPElEQVRYR+3XsQ0AIAwDQfbfGVs6RIoU7gqw5J4ZAAAAAAAAAAAAwL8zN5mZqaqqZqaqZgYAAAAAAAAAAMAvXgMABQABF3nEXgAAAABJRU5ErkJggg=="
      );
  tray = new Tray(image.resize({ width: 16, height: 16 }));
  tray.setToolTip("永雏塔菲桌宠");
  const trayMenu = Menu.buildFromTemplate([
      { label: "设置", click: () => openSettingsWindow() },
      { type: "separator" },
      { label: "退出", click: () => app.quit() },
      { label: `v${app.getVersion()}`, enabled: false },
    ]);
  tray.setContextMenu(trayMenu);
  tray.on("click", () => win?.showInactive());
}

function createTraySafe() {
  try {
    createTray();
  } catch (err) {
    console.error("tray create error", err);
  }
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", (_event, argv) => {
    if (win) {
      const wantReload = !app.isPackaged && Array.isArray(argv) && argv.includes("--reload-source");
      if (wantReload && !win.webContents.isDestroyed()) {
        win.webContents.reloadIgnoringCache();
      }
      win.showInactive();
      win.setAlwaysOnTop(true, "screen-saver");
    }
  });

  app.whenReady().then(() => {
    setTimeout(() => {
      createWindow();
      createTraySafe();
    }, 400);
  });
}

app.on("window-all-closed", () => app.quit());

ipcMain.on("ignore-mouse", (_event, ignore) => {
  if (!win) return;
  win.setIgnoreMouseEvents(Boolean(ignore), { forward: true });
});

ipcMain.on("move-by", (_event, dx, dy) => {
  if (!win) return;
  const [x, y] = win.getPosition();
  win.setPosition(Math.round(x + dx), Math.round(y + dy));
});

ipcMain.handle("walk-step", (_event, direction, distance) => {
  if (!win || win.isDestroyed()) return null;
  const bounds = win.getBounds();
  const workArea = screen.getDisplayMatching(bounds).workArea;
  const safeDistance = Math.min(24, Math.max(0, Number(distance) || 0));
  const result = advanceWithinWorkArea(bounds, workArea, direction, safeDistance);
  win.setPosition(result.x, bounds.y);
  return result;
});

// 平滑窗口拖动：主进程按光标位置高频跟随。
// 按下/松开由 PowerShell 监视进程用 GetAsyncKeyState 检测（不依赖渲染进程事件，
// 渲染端在贴图解码时主线程阻塞、pointerup 会被合并/丢弃/伪触发）。
let dragPoll = null;
let dragWatcher = null;
let dragWatchBuf = "";
let loadDragEnabled = false;

function stopDragPoll() {
  if (dragPoll) {
    clearTimeout(dragPoll);
    dragPoll = null;
  }
}

// 用按下点（窗口内坐标）作为抓取偏移启动轮询拖动
function startDragAt(clientX, clientY) {
  if (!loadDragEnabled || !win || win.isDestroyed() || dragPoll) return;
  const offX = Number.isFinite(clientX) ? clientX : 0;
  const offY = Number.isFinite(clientY) ? clientY : 0;
  const tick = () => {
    if (!loadDragEnabled || !win || win.isDestroyed()) {
      stopDragPoll();
      return;
    }
    const cur = screen.getCursorScreenPoint();
    win.setPosition(Math.round(cur.x - offX), Math.round(cur.y - offY));
    dragPoll = setTimeout(tick, 8);
  };
  tick();
}

function killButtonWatcher() {
  if (dragWatcher) {
    try {
      dragWatcher.kill();
    } catch {}
    dragWatcher = null;
  }
  dragWatchBuf = "";
}

function handleWatchLine(line) {
  if (!line) return;
  if (line.startsWith("PRESS")) {
    if (!loadDragEnabled || !win || win.isDestroyed()) return;
    const parts = line.split(/\s+/);
    const px = Number(parts[1]);
    const py = Number(parts[2]);
    const b = win.getBounds();
    if (Number.isFinite(px) && Number.isFinite(py) && px >= b.x && px <= b.x + b.width && py >= b.y && py <= b.y + b.height) {
      startDragAt(px - b.x, py - b.y);
    }
    return;
  }
  if (line === "RELEASE") stopDragPoll();
}

// 加载期间常驻的左键监视：PRESS（按下，带光标坐标）→ 起点在窗口内则开始拖动；
// RELEASE（松开）→ 停止拖动。加载完成后立刻停掉跟随，避免松手后的过期按下把窗口粘在光标上。
function spawnButtonWatcher() {
  killButtonWatcher();
  stopDragPoll();
  loadDragEnabled = true;
  try {
    const watcher = spawn(
      "powershell.exe",
      [
        "-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden",
        "-ExecutionPolicy", "Bypass",
        "-File", path.join(__dirname, "button-watch.ps1"),
      ],
      { windowsHide: true }
    );
    dragWatcher = watcher;
    watcher.stdout.on("data", (data) => {
      dragWatchBuf += String(data);
      const lines = dragWatchBuf.split(/\r?\n/);
      dragWatchBuf = lines.pop() ?? "";
      for (const raw of lines) handleWatchLine(raw.trim());
    });
    watcher.on("exit", () => {
      if (dragWatcher === watcher) dragWatcher = null;
      stopDragPoll();
    });
    watcher.on("error", () => {
      if (dragWatcher === watcher) dragWatcher = null;
    });
  } catch {
    dragWatcher = null;
  }
}

function endLoadDrag() {
  loadDragEnabled = false;
  stopDragPoll();
  killButtonWatcher();
}

ipcMain.on("drag-start", (_event, clientX, clientY) => {
  // 仅加载期使用轮询拖动。监视进程在跑时忽略渲染端伪 pointerdown，
  // 否则主线程阻塞期间积压的按下会在松开后把窗口重新粘到光标上。
  if (!loadDragEnabled || dragWatcher) return;
  startDragAt(clientX, clientY);
});
ipcMain.on("drag-end", () => {
  if (loadDragEnabled && dragWatcher) return;
  stopDragPoll();
});
ipcMain.on("loader-done", () => {
  endLoadDrag();
});

ipcMain.handle("set-foot-dock", (_event, open) => {
  if (!win || win.isDestroyed()) return { open: false, height: 0 };
  const b = win.getBounds();
  if (!open) {
    if (footDock.open && footDock.height > 0) {
      const height = Math.max(1, b.height - footDock.height);
      footDock = { open: false, height: 0 };
      setWindowBoundsSafe(b.x, b.y, b.width, height);
    } else {
      footDock = { open: false, height: 0 };
    }
    return { ...footDock };
  }
  if (footDock.open) return { ...footDock };
  const area = screen.getDisplayMatching(b).workArea;
  const grow = FOOT_DOCK_HEIGHT;
  const spaceBelow = area.y + area.height - (b.y + b.height);
  const overflow = Math.max(0, grow - Math.max(0, spaceBelow));
  footDock = { open: true, height: grow };
  setWindowBoundsSafe(b.x, b.y - overflow, b.width, b.height + grow);
  return { ...footDock };
});

ipcMain.on("set-size", (_event, width, height) => {
  applyPetSize(width, height);
});

ipcMain.on("open-settings", () => openSettingsWindow());
ipcMain.on("open-studio", (_event, mode) => openStudioWindow(mode));

ipcMain.on("pet-command", (_event, cmd) => {
  if (!win || win.isDestroyed()) return;
  win.showInactive();
  win.setAlwaysOnTop(alwaysOnTop, "screen-saver");
  win.webContents.send("tray-command", { cmd });
});

ipcMain.on("studio-apply-outfit", (_event, id) => {
  if (!win || win.isDestroyed()) return;
  win.webContents.send("tray-command", { cmd: "apply-outfit", id });
});

ipcMain.on("studio-play-action", (_event, motion) => {
  if (!win || win.isDestroyed()) return;
  win.webContents.send("tray-command", { cmd: "play-action", motion });
});

ipcMain.handle("get-settings", () => collectSettings());

ipcMain.handle("set-settings", (_event, partial) => {
  const next = partial && typeof partial === "object" ? partial : {};
  if (typeof next.alwaysOnTop === "boolean") {
    alwaysOnTop = next.alwaysOnTop;
    saveSettings({ alwaysOnTop });
    if (win && !win.isDestroyed()) win.setAlwaysOnTop(alwaysOnTop, "screen-saver");
    sendToRenderer("tray-command", { cmd: "top", on: alwaysOnTop });
  }
  if (typeof next.walkMode === "boolean") {
    saveSettings({ walkMode: next.walkMode });
  }
  if (typeof next.apiKey === "string") {
    const key = next.apiKey.trim();
    if (key) saveSettings({ deepseekKey: key });
  }
  if (Number.isInteger(next.sizeIndex) && PET_SIZE_STEPS[next.sizeIndex]) {
    const [width, height] = PET_SIZE_STEPS[next.sizeIndex];
    applyPetSize(width, height);
  }
  const snapshot = collectSettings();
  sendToRenderer("settings-changed", snapshot);
  return snapshot;
});

ipcMain.handle("toggle-top", () => {
  alwaysOnTop = !alwaysOnTop;
  win?.setAlwaysOnTop(alwaysOnTop, "screen-saver");
  return alwaysOnTop;
});

ipcMain.handle("is-top", () => alwaysOnTop);

ipcMain.handle("check-update", async () => {
  if (!useAutoUpdate) return { ok: false, error: "no-feed" };
  try {
    const result = await autoUpdater.checkForUpdates();
    return { ok: true, version: result && result.updateInfo && result.updateInfo.version };
  } catch (err) {
    return { ok: false, error: String((err && err.message) || err) };
  }
});

ipcMain.on("install-update", () => {
  if (updateDownloaded && useAutoUpdate) autoUpdater.quitAndInstall();
});

ipcMain.on("quit", () => app.quit());

// ---------- DeepSeek 对话 ----------
const DEEPSEEK_BASE = process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com";
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || "deepseek-chat";

ipcMain.handle("llm-chat", async (_event, history) => {
  const settings = loadSettings();
  const apiKey = (process.env.DEEPSEEK_API_KEY || settings.deepseekKey || "").trim();
  if (!apiKey) return { ok: false, error: "no-key" };
  if (!/^[\x20-\x7E]+$/.test(apiKey)) return { ok: false, error: "bad-key" };
  if (!Array.isArray(history) || history.length === 0) return { ok: false, error: "bad-input" };
  try {
    const res = await fetch(`${DEEPSEEK_BASE}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: DEEPSEEK_MODEL,
        messages: history,
        max_tokens: 200,
        temperature: 0.9,
      }),
      signal: AbortSignal.timeout(25000),
    });
    if (!res.ok) {
      let detail = "";
      try { detail = (await res.text()).slice(0, 300); } catch {}
      return { ok: false, error: "http", status: res.status, detail };
    }
    const data = await res.json();
    const content = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || "";
    return { ok: true, content: String(content).trim() };
  } catch (err) {
    return { ok: false, error: "network", detail: String((err && err.message) || err) };
  }
});

ipcMain.on("set-api-key", (_event, key) => {
  saveSettings({ deepseekKey: String(key || "").trim() });
});

// ---------- 官方 / 导入服装 ----------
function userOutfitRoot() {
  return path.join(app.getPath("userData"), "outfits");
}

function bundledOfficialRoot() {
  return path.join(__dirname, "models", "official");
}

function findPmx(dir, depth = 0) {
  if (depth > 4) return null;
  let entries = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return null;
  }
  const files = entries.filter((e) => e.isFile()).map((e) => e.name);
  const pmx = files.find((n) => n.toLowerCase().endsWith(".pmx"));
  if (pmx) return path.join(dir, pmx);
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const name = e.name.toLowerCase();
    if (name === "tex" || name === "textures" || name.startsWith(".")) continue;
    const found = findPmx(path.join(dir, e.name), depth + 1);
    if (found) return found;
  }
  return null;
}

function sanitizeId(name) {
  const ascii = String(name || "")
    .replace(/[^\w-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
  if (ascii && /[a-zA-Z0-9]/.test(ascii)) return ascii.toLowerCase();
  return "outfit";
}

function guessOutfitMeta(folderName, pmxName) {
  const s = `${folderName} ${pmxName}`.toLowerCase();
  if (/兔|bunny|rabbit/.test(s)) {
    return { id: "bunny", name: "官方兔女郎", emotion: "wink", line: "兔女郎小菲柱上线喵！" };
  }
  if (/2\.0|2_0|mmd[_-]?2|v2/.test(s)) {
    return { id: "v2", name: "官方 2.0", emotion: "star", line: "2.0 新形象，关注塔菲谢谢喵！" };
  }
  if (/1883/.test(s)) {
    return { id: "1883off", name: "官方 1883", emotion: "happy", line: "1883 发明家套装喵！" };
  }
  const id = sanitizeId(folderName);
  return {
    id: id === "outfit" ? `imp_${Date.now().toString(36)}` : id,
    name: folderName || path.parse(pmxName).name || "导入服装",
    emotion: "happy",
    line: "换好新衣服了喵！",
  };
}

function readManifest(dir) {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(dir, "outfit.json"), "utf8"));
    if (!raw || typeof raw !== "object") return null;
    return raw;
  } catch {
    return null;
  }
}

function describeOutfitDir(dir, imported) {
  const pmx = findPmx(dir);
  if (!pmx) return null;
  const folderName = path.basename(dir);
  const meta = readManifest(dir) || guessOutfitMeta(folderName, path.basename(pmx));
  return {
    id: String(meta.id || folderName),
    name: String(meta.name || folderName),
    emotion: String(meta.emotion || "happy"),
    line: String(meta.line || "换好新衣服了喵！"),
    pmxUrl: pathToFileURL(pmx).href,
    imported: Boolean(imported),
  };
}

function listExtraOutfits() {
  const items = [];
  const seen = new Set();
  const groups = [
    { root: bundledOfficialRoot(), imported: false },
    { root: userOutfitRoot(), imported: true },
  ];
  for (const { root, imported } of groups) {
    if (!fs.existsSync(root)) continue;
    let names = [];
    try {
      names = fs.readdirSync(root);
    } catch {
      continue;
    }
    for (const name of names) {
      const dir = path.join(root, name);
      try {
        if (!fs.statSync(dir).isDirectory()) continue;
      } catch {
        continue;
      }
      const item = describeOutfitDir(dir, imported);
      if (!item || seen.has(item.id)) continue;
      seen.add(item.id);
      items.push(item);
    }
  }
  return items;
}

ipcMain.handle("list-outfits", () => listExtraOutfits());

ipcMain.handle("import-outfit", async () => {
  if (!win || win.isDestroyed()) return { ok: false, error: "no-window" };
  const wasTop = alwaysOnTop;
  try {
    win.setAlwaysOnTop(false);
  } catch {}
  let picked;
  try {
    picked = await dialog.showOpenDialog(win, {
      title: "选择官方模型文件夹（里面要有 .pmx 和贴图）",
      properties: ["openDirectory"],
    });
  } finally {
    if (win && !win.isDestroyed() && wasTop) {
      win.setAlwaysOnTop(true, "screen-saver");
    }
  }
  if (picked.canceled || !picked.filePaths[0]) return { ok: false, error: "cancel" };
  const selected = picked.filePaths[0];
  const pmx = findPmx(selected);
  if (!pmx) return { ok: false, error: "no-pmx" };
  const srcDir = path.dirname(pmx);
  const meta = guessOutfitMeta(path.basename(srcDir), path.basename(pmx));
  const root = userOutfitRoot();
  fs.mkdirSync(root, { recursive: true });
  let id = meta.id;
  let dest = path.join(root, id);
  let n = 2;
  while (fs.existsSync(dest)) {
    id = `${meta.id}_${n}`;
    dest = path.join(root, id);
    n += 1;
  }
  fs.cpSync(srcDir, dest, { recursive: true });
  const saved = {
    id,
    name: meta.name,
    emotion: meta.emotion,
    line: meta.line,
  };
  fs.writeFileSync(path.join(dest, "outfit.json"), JSON.stringify(saved, null, 2), "utf8");
  const item = describeOutfitDir(dest, true);
  if (!item) return { ok: false, error: "copy-failed" };
  return { ok: true, outfit: item };
});

ipcMain.handle("remove-outfit", (_event, id) => {
  const safe = sanitizeId(id);
  if (!safe || safe === "outfit") return { ok: false, error: "bad-id" };
  const dest = path.join(userOutfitRoot(), String(id));
  const root = path.resolve(userOutfitRoot());
  const resolved = path.resolve(dest);
  if (resolved === root || !resolved.startsWith(root + path.sep)) {
    return { ok: false, error: "bad-path" };
  }
  if (!fs.existsSync(resolved)) return { ok: false, error: "missing" };
  fs.rmSync(resolved, { recursive: true, force: true });
  return { ok: true };
});
