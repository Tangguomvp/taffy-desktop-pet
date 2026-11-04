const { app, BrowserWindow } = require("electron");
const fs = require("fs");
const path = require("path");

app.commandLine.appendSwitch("enable-gpu");

const errors = [];

app.whenReady().then(async () => {
  let win;
  try {
    win = new BrowserWindow({
      width: 380,
      height: 680,
      show: false,
      backgroundColor: "#00000000",
      webPreferences: {
        preload: path.join(__dirname, "qa-preload.js"),
        contextIsolation: true,
        backgroundThrottling: false,
        offscreen: true,
      },
    });
    win.webContents.on("console-message", (event) => {
      if (event.level === "error" || event.level === "warning") {
        errors.push(event.level + ": " + event.message);
      }
      console.log("[renderer " + event.level + "] " + event.message);
    });
    win.webContents.setFrameRate(30);
    await win.loadFile(path.join(__dirname, "..", "renderer", "index.html"));
    const startedAt = Date.now();
    let ready = false;
    while (Date.now() - startedAt < 90000) {
      ready = await win.webContents.executeJavaScript(
        "Boolean(document.getElementById('loader') && document.getElementById('loader').hidden)"
      );
      if (ready) break;
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
    if (!ready) throw new Error("pet renderer never finished loading");

    const menu = await win.webContents.executeJavaScript(
      "Array.from(document.querySelectorAll('#actionMenu button')).map((b) => [b.dataset.motion, b.textContent])"
    );
    console.log("MENU", JSON.stringify(menu));

    // [动作, 采样时刻(ms)]：抬手/动作中段/收手，穿模最容易在这几段时间出现
    const plan = [
      ["wave", [700, 1300, 1900]],
      ["dance", [900, 1800, 3000]],
      ["bow", [600, 1200, 1900]],
      ["nod", [400, 800, 1200]],
      ["shake", [400, 900, 1400]],
      ["tilt", [600, 1200, 2000]],
    ];
    for (const [id, moments] of plan) {
      await win.webContents.executeJavaScript(
        "document.querySelector('#actionMenu button[data-motion=\"" + id + "\"]').click()"
      );
      let previous = 0;
      for (let index = 0; index < moments.length; index++) {
        const wait = moments[index] - previous;
        previous = moments[index];
        await new Promise((resolve) => setTimeout(resolve, wait));
        const image = await win.webContents.capturePage();
        const output = path.join(__dirname, "qa", "pet-" + id + "-" + (index + 1) + ".png");
        fs.mkdirSync(path.dirname(output), { recursive: true });
        fs.writeFileSync(output, image.toPNG());
        console.log("captured", id, index + 1, image.getSize());
      }
      // 等动作彻底结束，避免下一个动作被互斥拦住
      await new Promise((resolve) => setTimeout(resolve, 1200));
    }
    console.log("ERRORS", JSON.stringify(errors.filter((e) => !/MMDLoader: The module has been deprecated/.test(e))));
  } catch (error) {
    console.error(error?.stack || error);
    process.exitCode = 1;
  } finally {
    if (win && !win.isDestroyed()) win.destroy();
    app.quit();
  }
});