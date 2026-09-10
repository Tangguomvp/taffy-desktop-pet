const SIZE_LABELS = ["很小", "小", "中", "大"];

const alwaysOnTopEl = document.getElementById("alwaysOnTop");
const walkModeEl = document.getElementById("walkMode");
const sizesEl = document.getElementById("sizes");
const apiKeyEl = document.getElementById("apiKey");
const keyHintEl = document.getElementById("keyHint");
const saveKeyEl = document.getElementById("saveKey");
const versionEl = document.getElementById("version");
const updateHintEl = document.getElementById("updateHint");
const checkUpdateEl = document.getElementById("checkUpdate");
const installUpdateEl = document.getElementById("installUpdate");
const actionsEl = document.getElementById("actions");
const outfitsEl = document.getElementById("outfits");

function paint(settings) {
  if (!settings) return;
  alwaysOnTopEl.checked = Boolean(settings.alwaysOnTop);
  walkModeEl.checked = Boolean(settings.walkMode);
  versionEl.textContent = settings.version ? "v" + settings.version : "";
  keyHintEl.textContent = settings.hasApiKey
    ? "已经存过 Key 了，留空再保存就不会改。"
    : "填入 DeepSeek 的 API Key 后就能和塔菲聊天。";
  apiKeyEl.placeholder = settings.hasApiKey ? "已保存，留空则不修改" : "sk-...";

  installUpdateEl.disabled = !settings.updateDownloaded;
  if (!settings.canCheckUpdate) {
    updateHintEl.textContent = "这版还没有配置更新源，等作者发布新版本就行。";
    checkUpdateEl.disabled = true;
    installUpdateEl.disabled = true;
  } else if (settings.updateDownloaded) {
    updateHintEl.textContent = "新版本 v" + (settings.updateVersion || "") + " 已下载，可以安装。";
  }

  sizesEl.innerHTML = "";
  SIZE_LABELS.forEach((label, i) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = label;
    if (i === settings.sizeIndex) btn.classList.add("active");
    btn.addEventListener("click", async () => {
      const next = await window.pet.setSettings({ sizeIndex: i });
      paint(next);
    });
    sizesEl.appendChild(btn);
  });
}

alwaysOnTopEl.addEventListener("change", async () => {
  const next = await window.pet.setSettings({ alwaysOnTop: alwaysOnTopEl.checked });
  paint(next);
});

walkModeEl.addEventListener("change", async () => {
  const next = await window.pet.setSettings({ walkMode: walkModeEl.checked });
  paint(next);
});

saveKeyEl.addEventListener("click", async () => {
  const key = apiKeyEl.value.trim();
  if (!key) {
    keyHintEl.textContent = "没有填写新的 Key 喵。";
    return;
  }
  const next = await window.pet.setSettings({ apiKey: key });
  apiKeyEl.value = "";
  paint(next);
  keyHintEl.textContent = "Key 已保存喵。";
});

actionsEl.addEventListener("click", () => window.pet.openStudio("actions"));
outfitsEl.addEventListener("click", () => window.pet.openStudio("outfits"));

checkUpdateEl.addEventListener("click", async () => {
  updateHintEl.textContent = "正在检查更新喵…";
  const res = await window.pet.checkUpdate();
  if (res && res.error === "no-feed") updateHintEl.textContent = "更新源还没配置喵。";
});

installUpdateEl.addEventListener("click", () => {
  window.pet.installUpdate();
});

window.pet.onUpdate("update-available", (v) => {
  updateHintEl.textContent = "发现新版本 v" + v + "，正在下载喵…";
});
window.pet.onUpdate("update-progress", (p) => {
  updateHintEl.textContent = "正在下载更新 " + p + "% 喵…";
});
window.pet.onUpdate("update-downloaded", (v) => {
  updateHintEl.textContent = "新版本 v" + v + " 已下载，可以安装。";
  installUpdateEl.disabled = false;
});
window.pet.onUpdate("update-none", () => {
  updateHintEl.textContent = "已经是最新版喵。";
});
window.pet.onUpdate("update-error", () => {
  updateHintEl.textContent = "检查更新失败喵，稍后再试？";
});

window.pet.onSettings((settings) => paint(settings));

window.pet.getSettings().then(paint).catch((err) => {
  keyHintEl.textContent = "设置读不出来喵。";
  console.error(err);
});
