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

## 下载

最新 Windows 安装包请到 [Releases](https://github.com/Tangguomvp/taffy-desktop-pet/releases) 下载：

| 版本 | 说明 | 下载 |
| --- | --- | --- |
| v1.0.4 | 最新版 | [Taffy-Desktop-Pet-Setup-1.0.4.exe](https://github.com/Tangguomvp/taffy-desktop-pet/releases/download/v1.0.4/Taffy-Desktop-Pet-Setup-1.0.4.exe) |

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
