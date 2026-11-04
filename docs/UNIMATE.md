# 能不能借 UniMate 给塔菲做动作？（调研 + 结论 + 接入路线）

## 1. UniMate 是什么

[Friedrich-M/UniMate](https://github.com/Friedrich-M/UniMate)（SIGGRAPH Asia 2026）是一个
**文本驱动、跨骨架的动作生成模型**：给一个绑定好骨骼的 3D 资产和一句英文提示
（"An object jumps in place."），它用流匹配生成约 60 帧（2 秒）的骨骼动画，并输出
现成的 **GLB / FBX** 动画。它还带 in-betweening、动作编辑、动作串联（motion expansion）三种用法。

它同时发布了 **UniML3D** 数据集（13,769 段动作 / 7,430 套骨架）与 `rig_preprocess`，
后者可以把任意 GLB / glTF / FBX 骨架（含 Mixamo）标注并规范化成它认识的格式。

## 2. 为什么不能直接把 UniMate 塞进桌宠

| 项目 | UniMate 要求 | 这台机器的现状 |
| --- | --- | --- |
| Python | 3.10（`requirements.txt` 全量锁定） | 3.14.4，且没有 conda |
| PyTorch | `torch==2.5.1+cu124` | 3.14 没有对应 wheel |
| 显卡 | 推理同样吃 CUDA，权重数 GB | GTX 1060 6GB（能跑但很勉强） |
| 资产格式 | GLB / glTF / FBX + 关节语义标注（要用 LLM 打标并人工复核） | 桌宠用的是 **PMX（MMD）**，带 MMD 专有的 D 骨、捩骨、IK 骨 |
| 动作出处 | 数据集里约 2 秒的片段 | 桌宠是 60fps 实时程序化曲线，需要能随时打断/混合 |

也就是说：直接调用它的推理接口，在 6GB 卡 + Python 3.14 的环境里跑不通；即便跑通，
还要再做一次 **GLB 骨架 → PMX 骨骼** 的重定向（MMD 的 足D / ひじD / 捩 骨结构在
Mixamo/Objaverse 里没有对应物），并且它 60 帧的动作要重采样成关键帧曲线才能接进
`motion.mjs` 的通道体系。**这不是一次能顺手做完的接入。**

## 3. 真正值得借鉴的三点（这次已经用上）

1. **动作词汇表与提示风格**：它训练数据里的动词就是 jump / wave / clap / bow / dance 这类
   单词动作，正好对应桌面宠物最需要的"短、可打断、一眼看懂"的动作集合。
2. **动作分阶段的结构**：它的样本都带明确的 anticipation → action → follow-through，
   和本项目 `motion.mjs` 顶部注释里的运动学约定一致，所以新动作沿用同一套分段写法。
3. **canonicalization（骨架规范化）的思路**：把"骨骼名字 → 语义角色"的映射集中到一处。
   这次照此把 MMD 骨骼别名、手臂 IK、手势目标点从三份拷贝收敛成
   `renderer/actions.mjs` + `renderer/arm-ik.mjs` + `renderer/pose.mjs` 三个共享模块。

## 4. 如果以后真要跑 UniMate（离线生成 → 重定向）

1. 找一台 24GB 显存的机器（云 GPU 或本地新卡），`conda create -n unimate python=3.10`，
   `pip install -r requirements.txt --no-build-isolation`。
2. `hf download Linzhan/UniMate --repo-type model --local-dir outputs` 拉预览权重。
3. 把塔菲的 PMX 用 Blender + mmd_tools 转成 GLB（保留骨骼层级），丢进
   `data_process/rig_preprocess/`，用它的 LLM 打标 + 人工复核"哪根骨是髋/膝/头"。
4. `python -m unimate.inference.sample --exp_dir outputs/unimate_uniml3d_f60_v3 --asset <塔菲资产> --prompt "An object waves its right hand." --num_repetitions 4`，挑一段。
5. 把生成的 GLB 动画按 30fps 采样成每骨骼欧拉角曲线，重定向到 MMD 骨骼名（足D / ひじD /
   腕D / センター），再把曲线写进 `renderer/motion.mjs` 的新 sampler，或落成 JSON 曲线表
   由 `actions.mjs` 注册。桌宠端不需要改：只要 sampler 在 p=0 和 p=1 归零、通道名对得上，
   就能被 `pet.js` / `studio.js` / 预览页直接播放。

> 注意：那一步重定向才是真正的工作量（MMD 的 D 骨/捩骨要把旋转拆到多根骨上），
> 建议先用 1 个动作验证管线，再考虑批量。

## 5. 这次实际做了什么（不依赖 UniMate，纯手写曲线）

现在启用的动作（`renderer/actions.mjs` 的 `ACTIONS`），全部零外部依赖、60fps 实时：

| id | 菜单名 | 类型 | 时长 | 触发方式 |
| --- | --- | --- | --- | --- |
| `wave` | 招手打招呼 | 手势（右手 IK） | 2.6s | 动作展示 |
| `dance` | 摇摆舞步 | 身体（倒重心）+ 双手叉腰 IK | 4.4s | 动作展示 |
| `bow` | 鞠躬 | 身体（前折 + 屈膝，手自然下垂） | 2.4s | 动作展示 |
| `nod` | 点头答应 | 头/躯干（两下点头 + 屈膝下沉） | 1.4s | 动作展示 |
| `shake` | 摇头拒绝 | 头/躯干（左右摆头 + 肩带反向） | 1.6s | 动作展示 |
| `tilt` | 歪头卖萌 | 头/躯干（歪头 + 耸肩 + 重心偏移） | 2.4s | 动作展示 |
| `spin` | 张臂转圈软着陆 | 原有 | 1.4s | 动作展示 |
| `touch` | 害羞摸脸 | 原有手势 | 3.6s | 悬停/动作展示 |
| `stomp` | 跺脚 | 原有 | 1.0s | 连点/动作展示 |
| `walk` | 开始 / 停止走动 | 原有 | 持续 | 动作展示 |
| `idle` | 自然待机 | 原有 | — | 动作展示 |

已下线（代码留在 `motion.mjs` 里、未注册，菜单不出现）：**比心**（IK 控制不了腕部朝向，
做不出指尖相碰的心形）、**伸懒腰**（手够不到头顶，只能做上举外展）、**原地跳**（大臂僵硬）、
**拍手鼓掌**（两只手做不出掌心相对，合掌时会像指尖互插）。
恢复方法：在 `actions.mjs` 的 `ACTIONS` / `GESTURES` / `GESTURE_TARGETS`（或 `BODY_ACTIONS` /
`BODY_HANDS`）里把条目加回去。

原有 `idle / spin / touch / stomp / walk` 不变。动作菜单现在由 `renderer/actions.mjs` 的
`ACTIONS` 生成，新增动作不会再出现"菜单有、代码没有"的对不上。

### 手位是量出来的，不是估的（第一版就在这翻车过）

第一版手位是照包围盒估的，结果手插进脸和双马尾里。现在改成**先量网格表面**：

```
.\node_modules\electron\dist\electron.exe tools\probe-surface.js
# 输出 tools/probe-surface.json：每个 (|x|, y) 处的"最靠前的 z" + 采样点最近表面距离
```

量出来的关键数据（three 场景坐标，可直接当 IK 目标点用）：

- 肩关节 `y = 9.61`，手臂全伸 `3.64`；模型总高 `17.7`（大半是头发）。
- **双马尾最宽 `|x| ≈ 4.95`、裙摆最宽 `|x| ≈ 5.34`** —— 手臂最多伸到 `|x| ≈ 3.9`，
  所以"手伸到头发外侧"和"双手举过头顶"都**物理上做不到**。
- 前表面随高度变化：脸 `z ≈ 2.0~2.6`、裙前 `z ≈ 2.0~2.5`、腰 `z ≈ 1.4`。
- 结论：所有手势只能放在**身体前方**，且 `z` 要比该高度的前表面再远 `0.4` 以上；
  这成了回归测试（见下），以后改手位不会再把动作改回"穿模"。

现在的实测间隙（clearance = 手位 z − 局部前表面 z）：

| 动作 | 手位 | 间隙 |
| --- | --- | --- |
| 招手 | (-2.45, 11.15, 2.40) | 1.45 |
| 摇摆舞步（叉腰） | (±2.00, 8.70, 1.50) | 0.42 |
| —（点头/摇头/歪头不动手） | — | — |
| 害羞摸脸 | (-0.50, 10.80, 1.85) | 0.09（本来就该贴脸） |

### 三个反复踩到的坑（都有测试兜着了）

1. **手与手之间也要留间隙**：拍手最初两只手腕只隔 0.24，手掌和手指直接交叉成 X；
   摊手/叉腰这类双手动作的手腕间距都保持在 0.55 以上（拍手最后因为腕部朝向不可控而下线）。
2. **别把手臂伸到极限**：目标点离肩接近 3.6（全伸）时肘部锁死，视觉上大臂很僵。
   现在所有手势的距离都在 2.6~3.0（约 72~82%），肘部自然有弯。
3. **肩骨要跟着动**：只转腕骨不抬肩，大臂像焊死的杆。曲线里加了
   shoulderR/L 通道，抬手时肩胛会耸起来（跳跃 0.18 rad、伸懒腰 0.15）。

### 另一个坑：MMD 手臂不能靠欧拉角"摆姿势"

跳/舞一开始用 `腕` 骨的 x/z 欧拉角拼"手臂举高"，结果不是 T 型就是角度拧着——
MMD 的腕骨局部轴和直觉不一致。改成**手位走 IK**（`BODY_HANDS` + 曲线的 `handW`
权重），动作立刻正常：跳是双手往前上方举，舞是双手叉腰。

### 新增/修改的文件

- `renderer/motion.mjs`：7 条新曲线（`sampleWaveMotion` 等）+ 泛化的动作仲裁
  `canStartAction`（新增 `action` 仲裁键）。
- `renderer/actions.mjs`：动作清单（id / 菜单名 / 时长 / 表情 / 台词）+ 手势手位
  `GESTURE_TARGETS` + 身体动作手位 `BODY_HANDS`。
- `renderer/arm-ik.mjs`：手臂两段 IK（从三份拷贝收敛成一份），手势和身体动作共用。
- `renderer/pose.mjs`：预览用的姿态采样 + 骨骼应用（studio 与批量预览共享）。
- `renderer/pet.js`：`runAction` 统一入口、身体动作状态机、新通道叠加、动作菜单动态生成。
- `renderer/studio.js`、`renderer/preview_actions.html`：改用共享模块，预览覆盖 12 个动作。
- `tests/motion.test.mjs`：新增 18 条断言，其中一条是**手位离体表距离**的回归测试
  （内嵌实测表面表，手位一旦被改回去贴近身体就直接失败）。
- `tools/probe-surface.js` + `renderer/surface-probe.html`：网格表面量测工具（定手位用）。
- `tools/capture_actions.js`：动作变多后按屏滚动截图。
- `tools/qa-pet.js` + `tools/qa-preload.js`：在隐藏窗口里用桩 preload 跑真实桌宠渲染层，
  逐个点动作截图（`tools/qa/pet-*.png`），用来检查手有没有穿模。

### 自己再加一个动作要动哪几处

1. `renderer/motion.mjs`：写 sampler，**保证 p=0 / p=1 所有通道为 0**；
   手势类输出 `weight + targetX/Y/ZOffset(+L)`，身体类沿用跺脚的通道词汇；
   想让身体动作也用手位，就在 sampler 里给 `handW / handDY / handDZ`。
2. `renderer/actions.mjs`：`GESTURES`（手势）或 `BODY_ACTIONS`（身体）登记，再加进 `ACTIONS`。
3. 手位：手势写进 `GESTURE_TARGETS`，身体动作写进 `BODY_HANDS`——
   先用 `tools/probe-surface.js` 量一下局部前表面，保证间隙 ≥ 0.4。
4. `renderer/preview_actions.html` 的 `PREVIEW_PHASES`：给一个最有辨识度的定格相位。
5. `tests/motion.test.mjs`：加断言；`npm test` + `npm run preview:actions` 双绿。

`pet.js` 的 tick 不需要改——只要通道名落在既有集合里（`centerX/centerY/bodyX/bodyZ/headX/headZ/upperY/lowerY/legR/L/kneeR/L/footR/L/armR/L/armZR/ZL/elbowR/L/armOpen/impact/air`），
它已经把这些通道都加上了。