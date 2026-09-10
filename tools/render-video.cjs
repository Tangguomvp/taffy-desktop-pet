// 用 Electron 离屏渲染塔菲模型动作序列，页面内同步循环渲染后经 toDataURL 取帧，ffmpeg 合成 MP4
const { app, BrowserWindow } = require("electron");
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const FPS = 30;
// [动作名, 时长(ms)]。每个动作从 rest 开始，播完回到 rest，衔接无缝。
const ACTIONS = [
  ["idle", 2400],
  ["spin", 1500],
  ["touch", 3800],
  ["stomp", 1100],
  ["walk", 2200],
];
const TS = Date.now();
const OUT_DIR = path.join(__dirname, "..", `.frames-${TS}`);
const OUT_MP4 = path.join(__dirname, "..", "taffy-actions.mp4");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, timeoutMs, label) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    if (await fn()) return;
    await sleep(120);
  }
  throw new Error("timeout: " + label);
}

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    show: false,
    width: 480,
    height: 768,
    useContentSize: true,
    webPreferences: { offscreen: true, webSecurity: false, backgroundThrottling: false },
  });

  await win.loadFile(path.join(__dirname, "taffy-render.html"));
  await waitFor(
    () => win.webContents.executeJavaScript("document.title").then((t) => t === "render-ready"),
    40000,
    "model load"
  );
  console.log("model ready, rendering all actions");

  const frames = await win.webContents.executeJavaScript(
    `window.__renderAll(${JSON.stringify(ACTIONS)})`
  );
  console.log("rendered frames:", frames.length);

  fs.mkdirSync(OUT_DIR, { recursive: true });
  for (let i = 0; i < frames.length; i++) {
    const base64 = String(frames[i]).replace(/^data:image\/jpeg;base64,/, "");
    fs.writeFileSync(path.join(OUT_DIR, String(i).padStart(5, "0") + ".jpg"), Buffer.from(base64, "base64"));
  }
  win.destroy();
  app.quit();
}).catch((e) => {
  console.error("render failed:", e && e.stack ? e.stack : e);
  app.exit(1);
});

app.on("will-quit", () => {
  if (!fs.existsSync(OUT_DIR)) return;
  const files = fs.readdirSync(OUT_DIR).filter((f) => /\.jpg$/.test(f));
  if (files.length === 0) return;
  console.log("encoding MP4 with ffmpeg...");
  try {
    execFileSync(
      "ffmpeg",
      [
        "-y", "-framerate", String(FPS),
        "-i", path.join(OUT_DIR, "%05d.jpg"),
        "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "18", "-movflags", "+faststart",
        OUT_MP4,
      ],
      { stdio: "inherit" }
    );
    console.log("done:", OUT_MP4);
  } catch (e) {
    console.error("ffmpeg failed:", e.message);
  }
});
