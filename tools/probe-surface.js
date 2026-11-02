// 量测塔菲 PMX 的"前表面 / 宽度"包络，用来给手势定手位（免得手插进脸或裙子）。
// 用法：
//   .\node_modules\electron\dist\electron.exe tools\probe-surface.js
//   可选：--points x,y,z;x,y,z （默认量一组常见手位）
// 输出：tools/probe-surface.json（网格表 + 采样点的最近表面距离）
const { app, BrowserWindow } = require("electron");
const fs = require("fs");
const path = require("path");

app.commandLine.appendSwitch("enable-gpu");

const DEFAULT_POINTS = [
  [-2.45, 11.15, 2.4],
  [-0.5, 9.45, 2.55],
  [0.5, 9.28, 2.5],
  [-0.85, 9.3, 2.6],
  [0.85, 9.3, 2.6],
  [-2.85, 10.3, 2.05],
  [2.85, 10.3, 2.05],
  [-2.05, 10.95, 2.15],
  [2.05, 10.95, 2.15],
  [-2.0, 8.7, 1.5],
  [2.0, 8.7, 1.5],
  [-0.5, 10.8, 1.85],
];

const arg = process.argv.find((item) => item.startsWith("--points="));
const POINTS = arg
  ? arg
      .slice("--points=".length)
      .split(";")
      .filter(Boolean)
      .map((item) => item.split(",").map(Number))
  : DEFAULT_POINTS;

const XS = [-4.5, -4, -3.5, -3, -2.5, -2, -1.5, -1, -0.5, 0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5];
const YS = [6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10, 10.5, 11, 11.5, 12, 12.5, 13, 13.5, 14, 14.5, 15];

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 600,
    height: 600,
    show: false,
    webPreferences: { nodeIntegration: false, contextIsolation: true, offscreen: true },
  });
  win.webContents.on("console-message", (event) => console.log("[r " + event.level + "] " + event.message));
  await win.loadFile(path.join(__dirname, "..", "renderer", "surface-probe.html"));
  const startedAt = Date.now();
  while (Date.now() - startedAt < 90000) {
    const title = await win.webContents.executeJavaScript("document.title");
    if (title === "surface-ready" || title === "surface-error") break;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  const grid = await win.webContents.executeJavaScript(
    "JSON.stringify(window.__surface.grid ? window.__surface.grid(" + JSON.stringify(XS) + ", " + JSON.stringify(YS) + ") : null)"
  );
  const probes = await win.webContents.executeJavaScript(
    "JSON.stringify(window.__surface.probe ? window.__surface.probe(" + JSON.stringify(POINTS) + ") : window.__surface)"
  );
  const out = path.join(__dirname, "probe-surface.json");
  fs.writeFileSync(out, JSON.stringify({ xs: XS, ys: YS, grid: JSON.parse(grid), probes: JSON.parse(probes) }, null, 1));
  console.log("wrote", out);
  win.destroy();
  app.quit();
});
