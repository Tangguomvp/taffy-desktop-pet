<div align="center">
  <img src="icon.png" alt="永雏塔菲桌宠" width="128" />
  <h1>永雏塔菲桌宠</h1>
  <p>Taffy Desktop Pet · Windows 桌面上的 Electron 桌宠</p>
</div>

## 简介

使用 Electron + Three.js（MMDLoader）加载永雏塔菲官方 1883 MMD 模型（PMX）的桌面宠物。

> 仅供个人电脑自用，请勿二次上传或商用。

## 功能

- 🖱️ 左键拖动：搬家；单击：说话；双击：转圈；连点：跺脚
- 😊 悬停约 5 秒：害羞摸脸
- 🚶 待机散步（可在设置开启），走到屏幕边缘跺脚折返
- 📋 右键菜单：说话 / 变小 / 变大 / 退出
- 📌 托盘菜单：设置、退出
- ⚙️ 设置窗口：置顶、待机散步、大小、API Key、动作预览、换装预览、检查更新
- 👗 换装：自带 1883 配色与多套自制服装，支持导入官方 2.0 / 兔女郎模型

## 动作

托盘右键 →「动作展示」，或 设置 →「动作预览」先看循环预览再点「让小菲做这个」。
除走路外动作互斥，点新的立刻打断旧的；点她、拖她也会打断。

| 动作 | 类型 | 时长 |
| --- | --- | --- |
| 自然待机 | 待机 | — |
| 招手打招呼 | 右手 IK | 2.6s |
| 摇摆舞步 | 身体（倒重心）+ 双手叉腰 IK | 4.4s |
| 鞠躬 | 身体（前折 + 屈膝） | 2.4s |
| 点头答应 | 头/躯干 | 1.4s |
| 摇头拒绝 | 头/躯干 | 1.6s |
| 歪头卖萌 | 头/躯干 + 耸肩 | 2.4s |
| 张臂转圈软着陆 | 原有 | 1.4s |
| 害羞摸脸 | 原有手势 | 3.6s |
| 跺脚 | 原有 | 1.0s |
| 开始 / 停止走动 | 原有 | 持续 |

手位（招手 / 叉腰）由手臂 IK 送到目标点，目标点是拿
`tools/probe-surface.js` 量过模型网格表面才定的：脸前 `z≈2.0~2.6`、腰 `z≈1.4`、
裙前 `z≈2.2`，而双马尾最宽 `|x|≈4.95`、手臂只有 `3.64`——所以手既举不过头顶，
也伸不到头发外侧，手势只能放在身体前方。细节见 [docs/UNIMATE.md](docs/UNIMATE.md)。

## 下载

最新 Windows 安装包请到 [Releases](https://github.com/Tangguomvp/taffy-desktop-pet/releases) 下载：

| 版本 | 说明 | 下载 |
| --- | --- | --- |
| v1.0.7 | 最新版 | [Taffy-Desktop-Pet-Setup-1.0.7.exe](https://github.com/Tangguomvp/taffy-desktop-pet/releases/download/v1.0.7/Taffy-Desktop-Pet-Setup-1.0.7.exe) |
| v1.0.6 | 上一版 | [Taffy-Desktop-Pet-Setup-1.0.6.exe](https://github.com/Tangguomvp/taffy-desktop-pet/releases/download/v1.0.6/Taffy-Desktop-Pet-Setup-1.0.6.exe) |

> 已安装 1.0.6 / 更早版本的用户：启动后会自动检测到 v1.0.7 并后台下载，退出时自动安装。
## 使用

双击 `start.bat` 启动，详细操作见 [使用说明.txt](使用说明.txt)。

## 开发

```bash
npm install
npm start        # 本地运行
npm run dist     # 打包 Windows 安装包（NSIS）
npm test         # 运行测试
```

技术栈：Electron 35 · Three.js 0.170 · electron-builder · electron-updater

## 模型与借物

默认使用永雏塔菲官方 1883 MMD 模型（1883_0915）。

| 项目 | 署名 |
| --- | --- |
| 模型所属 | 永雏塔菲 |
| 建模 | Francesca |
| 绑定/表情 | 客官IIIII |

官方配布：<https://www.bilibili.com/video/BV1Bg411J7hy/>（网盘提取码 `1883`）

⚠️ 模型仅供个人电脑自用，请勿二次上传、改模商用或公开分发。详见 [借物.txt](借物.txt)。

## 许可

本项目仅用于个人学习与自用，模型版权归原作者所有，请遵守模型配布方的使用规约。
