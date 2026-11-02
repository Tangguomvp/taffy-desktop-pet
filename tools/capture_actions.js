const { app, BrowserWindow } = require("electron");
const fs = require("fs");
const path = require("path");

app.commandLine.appendSwitch("enable-gpu");

app.whenReady().then(async () => {
  let win;
  try {
    win = new BrowserWindow({
      width: 1268,
      height: 1000,
      useContentSize: true,
      show: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
      },
    });
    win.webContents.on("console-message", (event) => {
      console.log(`[renderer ${event.level}] ${event.message}`);
    });
    await win.loadFile(path.join(__dirname, "..", "renderer", "preview_actions.html"));
    const startedAt = Date.now();
    let title = "";
    while (Date.now() - startedAt < 90000) {
      title = await win.webContents.executeJavaScript("document.title");
      if (title === "preview-actions-ready" || title === "preview-actions-error") break;
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
    if (title === "preview-actions-error") {
      const detail = await win.webContents.executeJavaScript("window.actionValidationError");
      throw new Error(detail || "action preview validation failed");
    }
    if (title !== "preview-actions-ready") throw new Error("action preview timed out");
    const validation = await win.webContents.executeJavaScript("window.actionValidation");
    // 动作变多后一屏放不下：按屏滚动，每屏存一张，方便逐张目视检查
    const pages = await win.webContents.executeJavaScript(
      "Math.max(1, Math.ceil(document.documentElement.scrollHeight / window.innerHeight))"
    );
    for (let page = 0; page < pages; page++) {
      await win.webContents.executeJavaScript(
        "window.scrollTo(0, " + page + " * window.innerHeight)"
      );
      await new Promise((resolve) => setTimeout(resolve, 150));
      const image = await win.webContents.capturePage();
      const output = path.join(
        __dirname,
        page === 0 ? "action_preview.png" : "action_preview_" + (page + 1) + ".png"
      );
      fs.writeFileSync(output, image.toPNG());
      console.log("wrote", output, image.getSize());
    }
    console.log("validated", validation, "pages", pages);
  } catch (error) {
    console.error(error?.stack || error);
    process.exitCode = 1;
  } finally {
    if (win && !win.isDestroyed()) win.destroy();
    app.quit();
  }
});
