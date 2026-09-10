// 诊断：渲染 1 帧耗时
const { app, BrowserWindow } = require("electron");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const waitFor = async (fn, t, l) => { const s = Date.now(); while (Date.now() - s < t) { if (await fn()) return; await sleep(120); } throw new Error("timeout " + l); };

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    show: false, width: 480, height: 768, useContentSize: true,
    webPreferences: { offscreen: true, webSecurity: false, backgroundThrottling: false },
  });
  win.webContents.on("console-message", (e, lvl, msg) => console.log("[renderer]", msg));
  await win.loadFile(require("path").join(__dirname, "taffy-render.html"));
  await waitFor(() => win.webContents.executeJavaScript("document.title").then((t) => t === "render-ready"), 40000, "load");
  let t = Date.now();
  await win.webContents.executeJavaScript("window.__render('idle', 0)");
  console.log("render() alone:", Date.now() - t, "ms");
  t = Date.now();
  const d = await win.webContents.executeJavaScript("window.__snap()");
  console.log("__snap() toDataURL:", Date.now() - t, "ms, len", d.length);
  win.destroy();
  app.quit();
}).catch((e) => { console.error("diag failed:", e && e.stack || e); app.exit(1); });
