# 塔菲桌宠 图标（icon）

当前图标：**塔菲立绘**（戴护目镜、粉色双马尾），抠掉背景后放在奶油色圆形底上。

## 现在的文件

| 文件 | 说明 |
| --- | --- |
| `icon.png` | 512×512 应用图标（electron-builder 生成 exe / 安装包图标，运行时也做窗口图标） |
| `icon.ico` | 多尺寸 ico（16/24/32/48/64/128/256） |
| `renderer/tray.png` | 64×64 托盘图标（托盘缩到 16px，所以裁得更近） |
| `tools/icon-work/taffy-cutout.png` | 抠好的透明背景图，`icon.png` 就是它生成的 |
| `tools/icon-work/taffy-mask.png` | 抠图用的遮罩 |
| `tools/icon-work/before-after.png` | 修改前后对比 |
| `tools/icon-work/cutout.py` | 抠图脚本（rembg + 连通域清理 + 遮罩硬化） |
| `tools/build-icon.ps1` | 加圆形底、导出 png / 多尺寸 ico |
| `tools/icon-render.html` + `render-icon.cjs` | 用桌宠自己的 3D 模型离屏渲染表情头像 |

> **没有入库的（只在本地保留，公开仓库不放版权原图）**：
> `source-taffy.png` 原始立绘、`alternatives/` 备选表情、`backup/` 最初旧图标、`applied/` 结果副本。
> 这四样都不参与构建，删掉也不影响 `icon.png` / `icon.ico` 的生成。

## 换一张立绘（当前方案）

1. 把图片放到 `tools/icon-work/source-taffy.png`，改 `cutout.py` 里的 `SRC`，然后：

       python tools\icon-work\cutout.py

   产出 `taffy-cutout.png`。边缘若还有原背景残留，调大 `harden()` 的 `core`（默认 128）。

2. 套圆形底：

       powershell -ExecutionPolicy Bypass -File tools\build-icon.ps1 ^
         -Bust tools\icon-work\taffy-cutout.png ^
         -OutPng icon.png -OutIco icon.ico ^
         -Size 512 -Scale 1.00 -Top 0.04

   `-Scale` 越大头越大，`-Top` 越大越靠下；托盘用 `-Size 64 -Scale 1.28 -Top -0.02 -Ring 1.2`。

## 换模型表情

`render-icon.cjs` 的 `EXPRESSIONS` 与 `renderer/pet.js` 的 morph 一致：
`smile / happy / blush / wink / love / star / ciya / omega / tease / hachu` 等（备选结果见本地 `alternatives/`）。

    cd tools
    $env:ICON_SIZE="1024"; $env:ICON_ONLY="love"; $env:ICON_ZOOM="1.22"; $env:ICON_YOFF="0.04"
    ..\node_modules\electron\dist\electron.exe render-icon.cjs

## 给已经装好的应用换图标

    $rc = "$env:LOCALAPPDATA\electron-builder\Cache\winCodeSign\winCodeSign-2.6.0\rcedit-x64.exe"
    Copy-Item "<安装目录>\永雏塔菲桌宠.exe" C:\tmp\a.exe
    & $rc C:\tmp\a.exe --set-icon C:\tmp\icon.ico
    Copy-Item C:\tmp\a.exe "<安装目录>\永雏塔菲桌宠.exe"

- rcedit **不认中文路径**（报 "Unable to load file"），所以先拷到纯英文路径，改完再拷回去。
- 只会动 `.rsrc` 段，代码段逐字节不变；改完 `ie4uinit.exe -show` 刷图标缓存。
- **`resources/app.asar` 不要手改** —— 里面每个文件都带 SHA256 integrity 校验，改了应用起不来；
  托盘图标要等下次 `npm run dist` 重新打包才会跟着变。

## 两个坑（踩过了）

1. 本机 `pwsh` 实际是 **Windows PowerShell 5.1**，读 UTF-8 无 BOM 的 `.ps1` 会按 GBK 解码 ——
   脚本里**不要写中文注释**，否则直接解析报错。
2. `cv2.imwrite` 不认中文路径，写文件要用 `cv2.imencode` + 二进制写（脚本里已处理）。
