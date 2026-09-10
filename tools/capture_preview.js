const { app, BrowserWindow } = require("electron");
const fs = require("fs");
const path = require("path");

app.commandLine.appendSwitch("enable-gpu");

const out = path.join(__dirname, "outfit_preview.png");

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1480,
    height: 1120,
    show: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });
  win.webContents.on("console-message", (e, level, msg, line, src) => {
    console.log(`[console ${level}] ${msg} (${src}:${line})`);
  });
  const html = path.join(__dirname, "..", "renderer", "preview_outfits.html");
  await win.loadFile(html);
  const start = Date.now();
  while (Date.now() - start < 90000) {
    const title = await win.webContents.executeJavaScript("document.title");
    if (title === "preview-ready") break;
    await new Promise((r) => setTimeout(r, 400));
  }
  await new Promise((r) => setTimeout(r, 800));
  const urls = await win.webContents.executeJavaScript(`
    [...document.querySelectorAll("canvas")].map((c, i) => ({
      i,
      w: c.width,
      h: c.height,
      label: c.parentElement.querySelector(".label").textContent,
      url: c.toDataURL("image/png"),
    }))
  `);
  const dir = path.join(__dirname, "preview");
  fs.mkdirSync(dir, { recursive: true });
  for (const item of urls) {
    const buf = Buffer.from(item.url.split(",")[1], "base64");
    const p = path.join(dir, `${item.i}.png`);
    fs.writeFileSync(p, buf);
    console.log("wrote", p, item.w, item.h, item.label, buf.length);
  }
  const img = await win.webContents.capturePage();
  fs.writeFileSync(out, img.toPNG());
  console.log("wrote", out, img.getSize());
  app.quit();
});
