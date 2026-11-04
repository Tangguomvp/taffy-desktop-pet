// 用 Electron 离屏渲染塔菲动作序列，页面内同步渲染后经 toDataURL 取帧，ffmpeg 合成 MP4
// 用法: .\node_modules\electron\dist\electron.exe tools\render-video.cjs
const { app, BrowserWindow } = require("electron");
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const FPS = 30;
// [动作 id, 播放时长(ms)]：时长比动作本身略长一点，尾帧停在归零后的待机姿态
const ACTIONS = [
  ["idle", 2000],
  ["wave", 2900],
  ["dance", 4700],
  ["bow", 2500],
  ["nod", 1700],
  ["shake", 1900],
  ["tilt", 2700],
  ["spin", 1800],
  ["touch", 3900],
  ["stomp", 1300],
  ["walk", 2300],
];
const OUT_DIR = path.join(__dirname, "demo", ".frames");
const OUT_MP4 = path.join(__dirname, "demo", "taffy-actions-11.mp4");

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
    60000,
    "model load"
  );
  console.log("model ready, rendering", ACTIONS.length, "actions");

  const started = Date.now();
  const frames = await win.webContents.executeJavaScript(
    "window.__renderAll(" + JSON.stringify(ACTIONS) + ")"
  );
  console.log("rendered frames:", frames.length, "in", ((Date.now() - started) / 1000).toFixed(1) + "s");

  fs.mkdirSync(OUT_DIR, { recursive: true });
  for (const file of fs.readdirSync(OUT_DIR)) fs.unlinkSync(path.join(OUT_DIR, file));
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
        "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "20", "-movflags", "+faststart",
        OUT_MP4,
      ],
      { stdio: "inherit" }
    );
    console.log("done:", OUT_MP4);
    // 帧留着也没用，编码成功就清掉
    for (const file of fs.readdirSync(OUT_DIR)) fs.unlinkSync(path.join(OUT_DIR, file));
    fs.rmdirSync(OUT_DIR);
  } catch (e) {
    console.error("ffmpeg failed:", e.message);
  }
});