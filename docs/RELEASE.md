# 发版流程（固定脚本）

发版全部由 `tools/release.mjs` 完成，一条命令跑完：升版本 → 打包 → 改 README/更新源 →
提交推送 → 打 tag → 建 Release（GitHub 传安装包，Gitee 建 Release）。

## 三条常用命令

```bash
# 1) 日常发版：patch 升版，打包，建「草稿」Release 并上传安装包
npm run release

# 2) 自己去草稿里下载试装（GitHub 登录后能在 Releases 里看到 Draft）
#    确认没问题后放行：发布草稿 + 建 Gitee Release + 把更新源指到新版本
npm run release -- --publish-tag v1.2.3

# 3) 想一步到位（升版即公开，所有人下次启动就会收到更新）
npm run release -- --publish
```

先彩排不落地：

```bash
npm run release -- --dry-run         # 只打印计划和新 README 表格，不写文件、不打包
npm run release -- --version 1.2.0   # 指定版本号（默认 patch +1）
npm run release -- --no-build        # 复用 dist 里已有的安装包
npm run release -- --skip-push       # 只本地提交/打 tag，不推远端
npm run release -- --no-release      # 只升版+打包+提交+打 tag，不建 Release
npm run release -- --notes notes.md  # 自定义发布说明（默认从 git log 生成）
```

## 它具体做了什么

1. 读 `package.json` 版本，算新版本号（默认 patch +1），改本机目录与 `gitee-repo` 克隆里的
   `package.json` / `package-lock.json`（只改根 version，不会误伤依赖版本）
2. `npm run dist` 出 `dist/永雏塔菲桌宠 Setup <版本>.exe`
3. 复制成 ASCII 文件名 `Taffy-Desktop-Pet-Setup-<版本>.exe` 到临时目录，算 sha512(base64) 与 size
4. 改 `README.md` 下载表格（新版本 + 上一版两行）；**公开模式**下同时改 `updates/latest.yml`
5. 在 `gitee-repo` 里 commit、push `master`（同时推 GitHub 的 `main`）、打 `v<版本>` tag 并推两个远端
6. GitHub 建 Release（默认草稿），上传安装包与 `latest.yml`
7. 公开模式下再建 Gitee Release（说明里指向 GitHub 下载）

## 两个更新源，别搞混

| 客户端版本 | 读哪里 | 说明 |
| --- | --- | --- |
| ≥ 1.0.4 | **GitHub Release 里的 latest.yml** | `main.js` 用 `provider: "github"`，取最新非草稿 Release 的资源 |
| 1.0.0 – 1.0.2 | Gitee raw `updates/latest.yml` | 老客户端写死了 generic 源 |

所以：

- **草稿 = 谁都不会更新**（草稿不在 release 列表里）
- **公开 = ≥1.0.4 自动更新**；同时脚本把 Gitee 的 `updates/latest.yml` 也指到新版本，老客户端才跟上
- 想做“能下载但不自动更新”做不到：GitHub provider 一定去读最新非草稿 Release 的 `latest.yml`，
  资源缺失会直接报错（客户端弹“检查更新失败”）。要 staged 就用草稿。

## 前置条件

- `gitee-repo/` 克隆在 app 目录旁边，当前在 `master`、工作区干净
- `git credential fill` 能同时拿到 github.com 与 gitee.com 的凭据（现在用 Git Credential Manager）
- 能跑 `npm run dist`（electron-builder 已装，首次会下载 electron 包）
- Gitee 单个附件上限约 100MB，149MB 的安装包**只上传到 GitHub**，Gitee Release 只写说明

## 回滚

```bash
# 撤回错误 tag 与提交
git -C gitee-repo tag -d v1.2.3
git -C gitee-repo push origin :refs/tags/v1.2.3
git -C gitee-repo push github :refs/tags/v1.2.3
# Release 在网页上删掉（GitHub / Gitee），再把 updates/latest.yml 改回旧版本并提交
```

如果坏版本已经进了更新源：先把 `updates/latest.yml` 的 version 改回旧版并 push（老客户端立刻停止更新），
再删 Release、删 tag，最后重新发一个修好的版本。

## 手动兜底（脚本跑不了时）

1. `npm run dist`
2. 把 `dist/永雏塔菲桌宠 Setup <版本>.exe` 改名成 `Taffy-Desktop-Pet-Setup-<版本>.exe`
3. GitHub → Releases → Draft a new release，tag 填 `v<版本>`，上传安装包 + 手写 `latest.yml`
   （version / url / sha512 / size；sha512 用 `openssl dgst -sha512 -binary 文件 | openssl base64` 算）
4. Gitee → 新建 Release，tag 同名，说明里放 GitHub 下载链接
5. 仓库里更新 `updates/latest.yml` 与 README 表格，提交推送

## 已知坑

- **PowerShell 5.1 读 UTF-8 无 BOM 的 .ps1 会乱码**，所以发版脚本用 Node 写，别改成 .ps1
- **README 是 CRLF**，脚本里所有正则都按 `\r?\n` 处理
- `package-lock.json` 只能用“解析 JSON 改版本号再写回”，不能用正则全局替换（会改掉依赖的 version）
- Gitee API 更新 Release 必须同时带 `name` 和 `body`，只传 `body` 会 400
