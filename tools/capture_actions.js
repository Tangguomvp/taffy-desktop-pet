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
    const image = await win.webContents.capturePage();
    const output = path.join(__dirname, "action_preview.png");
    fs.writeFileSync(output, image.toPNG());
    console.log("validated", validation);
    console.log("wrote", output, image.getSize());
  } catch (error) {
    console.error(error?.stack || error);
    process.exitCode = 1;
  } finally {
    if (win && !win.isDestroyed()) win.destroy();
    app.quit();
  }
});
