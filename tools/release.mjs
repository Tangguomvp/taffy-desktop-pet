#!/usr/bin/env node
// 一键发版：升版本 → 打包 → 更新 README/更新源 → 提交推送 → 打 tag → 发 Release（GitHub 传安装包，Gitee 建 Release）。
//
// 默认「只建草稿」：草稿不进 release 列表，别人的自动更新不会动；确认后跑
//   npm run release -- --publish-tag v1.2.3
// 才会放行（发布草稿 + 补 Gitee Release + 更新源指向新版本）。
//
// 常用：
//   npm run release                     # patch 升版，建草稿并上传资源
//   npm run release -- --version 1.2.0  # 指定版本
//   npm run release -- --publish        # 升版并直接公开（会自动更新源）
//   npm run release -- --publish-tag v1.2.0
//   npm run release -- --dry-run        # 只打印计划，不写文件、不打包
//   npm run release -- --no-build       # 复用 dist 里已有的安装包
//   npm run release -- --skip-push      # 只在本地提交/打标签
//   npm run release -- --no-release     # 只升版+打包+提交+打标签，不发 Release（演练/本地打包）
//   npm run release -- --notes notes.md # 自定义发布说明
import { execFileSync, execSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
// 脚本放在 <app>/gitee-repo/tools/ 下：ROOT 指回 app 目录（打包、依赖都在那边），CLONE 是发版用的克隆
const ROOT = path.basename(path.dirname(HERE)) === "gitee-repo" ? path.dirname(path.dirname(HERE)) : path.dirname(HERE);
// TAFFY_RELEASE_CLONE 可指向另一个克隆，方便演练（默认就是 app 旁边的 gitee-repo）
const CLONE = process.env.TAFFY_RELEASE_CLONE
  ? path.resolve(process.env.TAFFY_RELEASE_CLONE)
  : path.join(ROOT, "gitee-repo");
const GH = { owner: "Tangguomvp", repo: "taffy-desktop-pet" };
const GITEE = { owner: "tangguotang", repo: "eternal-nest-taffy-pet-table" };
const PRODUCT = "永雏塔菲桌宠";
const ASSET = (v) => "Taffy-Desktop-Pet-Setup-" + v + ".exe";

const log = (...args) => console.log(...args);
const step = (msg) => log("\n== " + msg + " ==");
const die = (msg) => {
  console.error("\n[失败] " + msg);
  process.exit(1);
};

// ---------- 参数 ----------
function parseArgs(argv) {
  const opts = { publish: false, publishTag: "", dryRun: false, noBuild: false, skipPush: false, noRelease: false, version: "", notes: "" };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => {
      const value = argv[++i];
      if (!value || value.startsWith("--")) die(arg + " 缺少参数值");
      return value;
    };
    if (arg === "--help" || arg === "-h") printHelp();
    else if (arg === "--publish") opts.publish = true;
    else if (arg === "--publish-tag") opts.publishTag = next();
    else if (arg === "--version") opts.version = next();
    else if (arg === "--notes") opts.notes = next();
    else if (arg === "--dry-run") opts.dryRun = true;
    else if (arg === "--no-build") opts.noBuild = true;
    else if (arg === "--skip-push") opts.skipPush = true;
    else if (arg === "--no-release") opts.noRelease = true;
    else die("未知参数 " + arg);
  }
  return opts;
}

function printHelp() {
  log(fs.readFileSync(fileURLToPath(import.meta.url), "utf8").split("\n").slice(1, 16).join("\n").replace(/^\/\/ ?/gm, ""));
  process.exit(0);
}

// ---------- 工具 ----------
function sh(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { cwd: CLONE, stdio: "inherit", ...opts });
}
function capture(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { cwd: CLONE, encoding: "utf8", ...opts }).trim();
}
function gitCred(host) {
  const payload = "protocol=https\nhost=" + host + "\n\n";
  const out = capture("git", ["credential", "fill"], { input: payload });
  const pass = (out.split("\n").find((line) => line.startsWith("password=")) || "").slice("password=".length);
  if (!pass) die("没有找到 " + host + " 的凭据（git credential fill 为空）");
  return pass;
}
async function ghApi(pathname, init = {}) {
  const token = gitCred("github.com");
  const res = await fetch("https://api.github.com" + pathname, {
    ...init,
    headers: {
      Authorization: "token " + token,
      Accept: "application/vnd.github+json",
      "User-Agent": "taffy-release",
      ...(init.body ? { "Content-Type": "application/json; charset=utf-8" } : {}),
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  if (!res.ok) die("GitHub API " + pathname + " 返回 " + res.status + "：" + text.slice(0, 300));
  return text ? JSON.parse(text) : {};
}
function hashFile(file) {
  const hash = createHash("sha512");
  const fd = fs.openSync(file, "r");
  const buf = Buffer.allocUnsafe(1024 * 1024);
  let read = 0;
  while ((read = fs.readSync(fd, buf, 0, buf.length, null)) > 0) hash.update(buf.subarray(0, read));
  fs.closeSync(fd);
  return { size: fs.statSync(file).size, sha512: hash.digest("base64") };
}
function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}
function writeText(file, text) {
  fs.writeFileSync(file, text, "utf8");
}
function bumpPatch(version) {
  const [major, minor, patch] = String(version).split(".").map(Number);
  return major + "." + minor + "." + (patch + 1);
}
function latestTag() {
  try {
    const tags = capture("git", ["tag", "-l", "v*", "--sort=-v:refname"]).split("\n").filter(Boolean);
    return tags[0] || "";
  } catch {
    return "";
  }
}

function latestTagExcept(exclude) {
  try {
    const tags = capture("git", ["tag", "-l", "v*", "--sort=-v:refname"])
      .split("\n")
      .filter((tag) => tag && tag !== exclude);
    return tags[0] || "";
  } catch {
    return "";
  }
}

// ---------- 版本号 ----------
function bumpVersionFiles(version, dryRun) {
  const pkgFiles = [path.join(ROOT, "package.json"), path.join(CLONE, "package.json")];
  const lockFiles = [path.join(ROOT, "package-lock.json"), path.join(CLONE, "package-lock.json")];

  for (const file of pkgFiles) {
    if (!fs.existsSync(file)) continue;
    const text = fs.readFileSync(file, "utf8");
    const current = readJson(file).version;
    if (current === version) {
      log("   已是最新版本号：" + path.relative(ROOT, file));
      continue;
    }
    // 只改根对象的 version（依赖项用的是 ^x.y.z 范围，不会被误伤）
    const next = text.replace(/("version":\s*")[^"]+(")/, "$1" + version + "$2");
    if (!dryRun) writeText(file, next);
    log("   " + path.relative(ROOT, file) + ": " + current + " -> " + version + (dryRun ? "（dry-run 未写入）" : ""));
  }

  for (const file of lockFiles) {
    if (!fs.existsSync(file)) continue;
    const text = fs.readFileSync(file, "utf8");
    const lock = JSON.parse(text);
    if (lock.version === version) continue;
    const eol = text.includes("\r\n") ? "\r\n" : "\n";
    lock.version = version;
    if (lock.packages && lock.packages[""]) lock.packages[""].version = version;
    let out = JSON.stringify(lock, null, 2) + "\n";
    if (eol === "\r\n") out = out.replace(/\n/g, "\r\n");
    if (!dryRun) writeText(file, out);
    log("   " + path.relative(ROOT, file) + ": version -> " + version + (dryRun ? "（dry-run 未写入）" : ""));
  }
}

// ---------- 打包与资源 ----------
function buildInstaller() {
  step("打包（electron-builder --win nsis）");
  execSync("npm run dist", { cwd: ROOT, stdio: "inherit" });
}
function resolveArtifact(version, dryRun) {
  const file = path.join(ROOT, "dist", PRODUCT + " Setup " + version + ".exe");
  if (!fs.existsSync(file)) {
    if (dryRun) return file;
    die("找不到安装包：" + file + "（先跑 npm run dist，或去掉 --no-build）");
  }
  return file;
}

// ---------- 更新源 / README ----------
function renderLatestYml(version, sha512, size) {
  const file = path.join(CLONE, "updates", "latest.yml");
  const old = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
  const eol = old.includes("\r\n") ? "\r\n" : "\n";
  const keep = old
    ? old.split(/\r?\n/).filter((line) => line.startsWith("#")).join(eol)
    : "# 发新版时同步改 version / url / sha512 / size。安装包托管在 GitHub Releases。";
  return [
    keep,
    "version: " + version,
    "files:",
    "  - url: https://github.com/" + GH.owner + "/" + GH.repo + "/releases/download/v" + version + "/" + ASSET(version),
    "    sha512: " + sha512,
    "    size: " + size,
    "path: " + ASSET(version),
    "sha512: " + sha512,
    "releaseDate: '" + new Date().toISOString() + "'",
    "",
  ].join(eol);
}

// 国内直连 GitHub 慢/被重置，所以额外发布两份"镜像源" latest.yml（放在 Gitee 上），
// 应用里检测到官方源失败会自动切到这些镜像（ghfast.top / gh-proxy.com）。
const MIRROR_FEEDS = [
  { id: "ghfast", prefix: "https://ghfast.top/" },
  { id: "ghproxy", prefix: "https://gh-proxy.com/" },
];

function renderMirrorYml(prefix, version, sha512, size) {
  return [
    "# 镜像源（应用自动回退用）：下载地址前面加了加速前缀，其余与 updates/latest.yml 一致",
    "version: " + version,
    "files:",
    "  - url: " + prefix + "https://github.com/" + GH.owner + "/" + GH.repo + "/releases/download/v" + version + "/" + ASSET(version),
    "    sha512: " + sha512,
    "    size: " + size,
    "path: " + ASSET(version),
    "sha512: " + sha512,
    "releaseDate: '" + new Date().toISOString() + "'",
    "",
  ].join("\n");
}

function writeMirrorFeeds(version, sha512, size) {
  for (const feed of MIRROR_FEEDS) {
    const dir = path.join(CLONE, "updates", "mirror", feed.id);
    fs.mkdirSync(dir, { recursive: true });
    writeText(path.join(dir, "latest.yml"), renderMirrorYml(feed.prefix, version, sha512, size));
    log("   镜像源：" + path.relative(ROOT, path.join(dir, "latest.yml")));
  }
}

function renderReadme(version, previous, publishing) {
  const file = path.join(CLONE, "README.md");
  const text = fs.readFileSync(file, "utf8");
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const row = (v, label) =>
    "| v" + v + " | " + label + " | [" + ASSET(v) + "](https://github.com/" + GH.owner + "/" + GH.repo + "/releases/download/v" + v + "/" + ASSET(v) + ") |";
  const rows = [];
  rows.push(row(version, publishing ? "最新版" : "待发布（GitHub 草稿）"));
  if (previous && previous !== version) rows.push(row(previous, "上一版"));
  const table = ["| 版本 | 说明 | 下载 |", "| --- | --- | --- |", ...rows].join(eol);
  const tableRegex = /\| 版本 \| 说明 \| 下载 \|\r?\n\| --- \| --- \| --- \|\r?\n(?:\|[^\r\n]*\r?\n?)+/;
  if (!tableRegex.test(text)) die("README 里找不到下载表格，请检查格式");
  const note = publishing
    ? "> 已安装 " + previous + " / 更早版本的用户：启动后会自动检测到 v" + version + " 并后台下载，退出时自动安装。"
    : "> v" + version + " 先以草稿 Release 上传（草稿不参与自动更新检查）：旧版本暂时不会收到更新提示。确认放行后跑 npm run release -- --publish-tag v" + version + "。";
  const replaced = table + eol + eol + note;
  return text.replace(tableRegex, replaced).replace(/(\r?\n){3,}/g, eol + eol);
}

// ---------- 提交/推送/tag ----------
function commitAndPush(version, publishing, skipPush, dryRun) {
  step("提交并推送");
  const files = ["package.json", "package-lock.json", "README.md"];
  if (publishing) {
    files.push("updates/latest.yml");
    for (const feed of MIRROR_FEEDS) files.push("updates/mirror/" + feed.id + "/latest.yml");
  }
  const existing = files.filter((file) => fs.existsSync(path.join(CLONE, file)));
  if (dryRun) {
    log("   dry-run: git add " + existing.join(" ") + " && commit && push");
    return;
  }
  sh("git", ["add", ...existing]);
  const changed = capture("git", ["status", "--porcelain"]).length > 0;
  if (changed) {
    const message = publishing ? "release: v" + version : "chore: 版本升到 " + version + "（待发布）";
    sh("git", ["commit", "-m", message]);
  } else {
    log("   没有文件改动，跳过提交");
  }
  const tag = "v" + version;
  const hasTag = capture("git", ["tag", "-l", tag]).length > 0;
  if (!hasTag) sh("git", ["tag", "-a", tag, "-m", tag + ": 发布 " + version]);
  if (skipPush) {
    log("   --skip-push：未推送");
    return;
  }
  sh("git", ["push", "origin", "master"]);
  sh("git", ["push", "origin", tag]);
  sh("git", ["push", "github", "master:main"]);
  sh("git", ["push", "github", tag]);
}

// ---------- Release ----------
function releaseNotes(version, opts) {
  if (opts.notes) {
    if (!fs.existsSync(opts.notes)) die("找不到发布说明文件：" + opts.notes);
    return fs.readFileSync(opts.notes, "utf8");
  }
  // 打完 tag 之后再生成说明，所以要排除当前版本，否则 range 是空的
  const prev = latestTagExcept("v" + version);
  let commits = "";
  try {
    commits = capture("git", ["log", "--pretty=format:- %s", prev ? prev + "..HEAD" : "-10"]).trim();
  } catch {
    commits = "";
  }
  // 版本号/发布提交本身不进说明
  commits = commits
    .split("\n")
    .filter((line) => line && !/^- (chore: 版本升到|release: )/.test(line))
    .join("\n");
  const lines = ["## v" + version, ""];
  if (commits) lines.push("### 本次提交", commits, "");
  lines.push(
    "### 自动更新",
    "- 安装包 " + ASSET(version) + "（GitHub Releases）",
    "- 客户端启动后会读取该 Release 的 latest.yml 自动更新",
    ""
  );
  return lines.join("\n");
}

// GitHub 的 /releases/tags/<tag> 查不到草稿（草稿在发布前还没挂到 tag 上），
// 所以要列出来自己找，才支持"放行草稿"。
async function findGithubRelease(tag) {
  const releases = await ghApi("/repos/" + GH.owner + "/" + GH.repo + "/releases?per_page=50");
  const found = (releases || []).find((release) => release.tag_name === tag);
  if (!found) die("找不到 tag 为 " + tag + " 的 Release");
  return found;
}

async function createGithubRelease(version, notes, draft) {
  step("创建 GitHub Release" + (draft ? "（草稿）" : ""));
  const release = await ghApi("/repos/" + GH.owner + "/" + GH.repo + "/releases", {
    method: "POST",
    body: JSON.stringify({
      tag_name: "v" + version,
      name: PRODUCT + " v" + version,
      body: notes,
      draft,
      prerelease: false,
    }),
  });
  log("   release id = " + release.id + "，draft = " + release.draft);
  return release;
}

function uploadAsset(releaseId, file, name) {
  const token = gitCred("github.com");
  log("   上传 " + name + "（" + (fs.statSync(file).size / 1024 / 1024).toFixed(1) + " MB）");
  // 大文件上传走直连（--noproxy）比走代理快得多；git 推送仍旧走代理，
  // 所以只给这条 curl 单独设置 no_proxy，改全局会把 git push 也带偏。
  execFileSync(
    "curl.exe",
    [
      "-sS", "--noproxy", "*", "-X", "POST",
      "-H", "Authorization: token " + token,
      "-H", "Content-Type: application/octet-stream",
      "--data-binary", "@" + file,
      "https://uploads.github.com/repos/" + GH.owner + "/" + GH.repo + "/releases/" + releaseId + "/assets?name=" + encodeURIComponent(name),
    ],
    { stdio: "inherit" }
  );
}

async function createGiteeRelease(version, notes) {
  step("创建 Gitee Release");
  const token = gitCred("gitee.com");
  const bodyFile = path.join(os.tmpdir(), "taffy-gitee-body-" + version + ".txt");
  writeText(bodyFile, notes);
  const nameFile = path.join(os.tmpdir(), "taffy-gitee-name-" + version + ".txt");
  writeText(nameFile, "v" + version);
  const args = [
    "-sS", "-X", "POST", "https://gitee.com/api/v5/repos/" + GITEE.owner + "/" + GITEE.repo + "/releases",
    "--data-urlencode", "access_token=" + token,
    "--data-urlencode", "tag_name=v" + version,
    "--data-urlencode", "name@" + nameFile,
    "--data-urlencode", "body@" + bodyFile,
    "--data-urlencode", "target_commitish=" + capture("git", ["rev-parse", "HEAD"]),
  ];
  const out = String(execFileSync("curl.exe", args, { encoding: "utf8" }));
  if (/"message"\s*:/.test(out) && !/"id"\s*:/.test(out)) log("   Gitee 响应：" + out.slice(0, 300));
  else log("   Gitee release 已创建");
}

// ---------- 放行已有草稿 ----------
async function publishExistingDraft(tagArg, opts) {
  const tag = String(tagArg).startsWith("v") ? tagArg : "v" + tagArg;
  const version = tag.replace(/^v/, "");
  step("放行 " + tag);
  let release = await findGithubRelease(tag);
  if (release.draft) {
    await ghApi("/repos/" + GH.owner + "/" + GH.repo + "/releases/" + release.id, {
      method: "PATCH",
      body: JSON.stringify({ draft: false }),
    });
    log("   GitHub 草稿已发布");
    // 发布后资源的下载地址会从 untagged-… 变成 /download/<tag>/…，必须重新取一遍
    release = await findGithubRelease(tag);
  } else log("   GitHub 该版本已是公开状态");

  const ymlAsset = (release.assets || []).find((asset) => asset.name === "latest.yml");
  if (!ymlAsset) die("该 Release 里没有 latest.yml，无法确定 sha512/size");
  const token = gitCred("github.com");
  const ymlRes = await fetch(ymlAsset.url, {
    headers: { Authorization: "token " + token, Accept: "application/octet-stream", "User-Agent": "taffy-release" },
  });
  if (!ymlRes.ok) die("下载 latest.yml 失败：" + ymlRes.status);
  const yml = await ymlRes.text();
  const sha512 = (yml.match(/sha512:\s*(\S+)/) || [])[1];
  const size = Number((yml.match(/size:\s*(\d+)/) || [])[1]);
  if (!sha512 || !size) die("latest.yml 里解析不到 sha512/size");
  log("   sha512/size 取自 Release 资源：" + size + " 字节");

  const prevVersion = (yml.match(/version:\s*(\S+)/) || [])[1] || version;
  if (opts.dryRun) {
    log("   dry-run: 会更新 updates/latest.yml 与 README 并提交推送；Gitee Release 若缺失会创建");
    return;
  }
  writeText(path.join(CLONE, "updates", "latest.yml"), renderLatestYml(version, sha512, size));
  writeText(path.join(CLONE, "README.md"), renderReadme(version, previousVersionOf(version), true));
  await createGiteeRelease(version, releaseNotes(version, opts));
  commitAndPush(version, true, opts.skipPush, false);
  log("\n放行完成：v" + version + " 已对所有客户端可见（下次启动检查到就会下载）。");
}

function previousVersionOf(version) {
  const tag = latestTagExcept("v" + version);
  return tag ? tag.replace(/^v/, "") : "";
}

// ---------- 主流程 ----------
async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.publishTag) return publishExistingDraft(opts.publishTag, opts);

  if (!fs.existsSync(path.join(CLONE, ".git"))) die("找不到 " + CLONE + "（发版要在仓库克隆里提交）");
  const currentVersion = readJson(path.join(CLONE, "package.json")).version;
  const version = opts.version || bumpPatch(currentVersion);
  const publishing = opts.publish;
  const previous = currentVersion === version ? previousVersionOf(version) : currentVersion;

  log("版本：" + currentVersion + " -> " + version + (publishing ? "（直接公开）" : "（草稿）"));
  log("安装包：dist/" + PRODUCT + " Setup " + version + ".exe");

  bumpVersionFiles(version, opts.dryRun);
  if (!opts.noBuild && !opts.dryRun) buildInstaller();
  const artifact = resolveArtifact(version, opts.dryRun);

  let sha512 = "";
  let size = 0;
  if (fs.existsSync(artifact)) {
    const hash = hashFile(artifact);
    sha512 = hash.sha512;
    size = hash.size;
    log("   sha512=" + sha512);
    log("   size=" + size);
  } else if (!opts.dryRun) die("安装包不存在：" + artifact);

  const tmpDir = path.join(os.tmpdir(), "taffy-release-" + version);
  const tmpExe = path.join(tmpDir, ASSET(version));
  const tmpYml = path.join(tmpDir, "latest.yml");
  if (!opts.dryRun) {
    fs.mkdirSync(tmpDir, { recursive: true });
    fs.copyFileSync(artifact, tmpExe);
    writeText(tmpYml, renderLatestYml(version, sha512, size));
  }

  step("更新 README" + (publishing ? " 与更新源" : "（草稿模式不动更新源）"));
  // 不管是不是 dry-run 都先算一遍，保证表格改写逻辑在当前 README 上真的能匹配
  const newReadme = renderReadme(version, previous, publishing);
  const newFeed = publishing ? renderLatestYml(version, sha512, size) : "";
  if (!opts.dryRun && publishing) {
    writeMirrorFeeds(version, sha512, size);
  }

  if (opts.dryRun) {
    const readmeLines = newReadme.split(/\r?\n/);
    const tableStart = readmeLines.findIndex((line) => line.startsWith("| 版本 | 说明 | 下载 |"));
    log("   README 下载表格预览：");
    for (const row of readmeLines.slice(tableStart, tableStart + 5)) log("     " + row);
    if (publishing) {
      log("   updates/latest.yml 预览：");
      for (const line of newFeed.split(/\r?\n/).slice(-8)) log("     " + line);
    }
  } else {
    writeText(path.join(CLONE, "README.md"), newReadme);
    if (publishing) writeText(path.join(CLONE, "updates", "latest.yml"), newFeed);
  }

  if (opts.dryRun) {
    step("dry-run 结束");
    log("   会执行：提交推送 → tag v" + version + " → 建 GitHub Release（" + (publishing ? "公开" : "草稿") + "）→ 上传安装包与 latest.yml" + (publishing ? " → 建 Gitee Release" : ""));
    return;
  }

  commitAndPush(version, publishing, opts.skipPush, false);
  if (opts.noRelease) {
    step("完成（--no-release：未创建 Release）");
    log("   安装包：" + tmpExe);
    return;
  }
  const release = await createGithubRelease(version, releaseNotes(version, opts), !publishing);
  uploadAsset(release.id, tmpExe, ASSET(version));
  uploadAsset(release.id, tmpYml, "latest.yml");
  if (publishing) await createGiteeRelease(version, releaseNotes(version, opts));

  step("完成");
  log("   安装包：" + tmpExe);
  log("   GitHub：https://github.com/" + GH.owner + "/" + GH.repo + "/releases/tag/v" + version);
  if (publishing) log("   自动更新：已生效（旧版本下次启动会检测到 v" + version + "）");
  else log("   自动更新：未生效（草稿）。确认后执行：npm run release -- --publish-tag v" + version);
}

main().catch((error) => {
  console.error(error?.stack || error);
  process.exit(1);
});