// Offline head-close-up renderer for the Taffy desk-pet app icon.
const { app, BrowserWindow } = require("electron");
const fs = require("fs");
const path = require("path");

const OUT = path.join(__dirname, "icon-work", "candidates");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// name -> morph weights (mirrors renderer/pet.js EMOTIONS)
const EXPRESSIONS = {
  idle:     { "にこり": 0.28 },
  smile:    { "にこり": 0.78 },
  happy:    { "笑い": 0.95, "にこり": 0.20 },
  blush:    { "照れ": 0.88, "にこり": 0.48 },
  wink:     { "ウィンク": 1.0, "にこり": 0.40 },
  love:     { "はぁと": 1.0, "照れ": 0.32, "にこり": 0.28 },
  star:     { "星目": 1.0, "にこり": 0.32 },
  ciya:     { "CiYa": 1.0, "にこり": 0.28 },
  omega:    { "ω": 0.92, "にこり": 0.28 },
  tease:    { "てへぺろ": 1.0, "にこり": 0.3 },
  hachu:    { "はちゅ目": 1.0 },
  smileblush: { "にこり": 0.80, "照れ": 0.70 }
};

async function waitFor(fn, timeoutMs, label) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    if (await fn()) return;
    await sleep(150);
  }
  throw new Error("timeout: " + label);
}

app.whenReady().then(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const win = new BrowserWindow({
    show: false,
    width: 512,
    height: 512,
    useContentSize: true,
    transparent: true,
    webPreferences: { offscreen: true, webSecurity: false, backgroundThrottling: false },
  });
  win.webContents.on("console-message", (e, level, msg) => console.log("[page]", msg));

  await win.loadFile(path.join(__dirname, "icon-render.html"));
  await waitFor(
    () => win.webContents.executeJavaScript("document.title").then((t) => t === "render-ready" || String(t).startsWith("render-error")),
    60000,
    "model load"
  );
  const title = await win.webContents.executeJavaScript("document.title");
  if (String(title).startsWith("render-error")) throw new Error(title);
  console.log("model ready");

  const info = await win.webContents.executeJavaScript("window.__info()");
  console.log("INFO " + JSON.stringify(info));
  const names = await win.webContents.executeJavaScript("window.__morphNames()");
  console.log("MORPHS " + JSON.stringify(names));

  const mode = process.env.ICON_MODE || "bust";
  const size = Number(process.env.ICON_SIZE || 512);
  const zoom = Number(process.env.ICON_ZOOM || 1.15);
  const yOff = Number(process.env.ICON_YOFF || 0.03);
  const tag = process.env.ICON_TAG || "";
  const only = process.env.ICON_ONLY ? process.env.ICON_ONLY.split(",") : null;

  for (const [name, morphs] of Object.entries(EXPRESSIONS)) {
    if (only && !only.includes(name)) continue;
    const res = await win.webContents.executeJavaScript(
      "window.__shot(" + JSON.stringify({ morphs, mode, size, zoom, yOff }) + ")"
    );
    if (res.missing && res.missing.length) console.log("  missing morphs for " + name + ": " + res.missing.join(","));
    const buf = Buffer.from(String(res.data).replace(/^data:image\/png;base64,/, ""), "base64");
    const p = path.join(OUT, mode + "-" + size + tag + "-" + name + ".png");
    fs.writeFileSync(p, buf);
    console.log("wrote", path.basename(p), buf.length);
  }

  win.destroy();
  app.quit();
}).catch((e) => {
  console.error("render failed:", e && e.stack ? e.stack : e);
  app.exit(1);
});
