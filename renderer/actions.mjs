// 动作清单：菜单、托盘、动作预览 studio 与 pet.js 共用这一份。
// 这里不引入 three，纯数据 + 曲线，node --test 可以直接 import。
import {
  bodyRestPose,
  sampleBowMotion,
  sampleClapMotion,
  sampleDanceMotion,
  sampleTouchFaceMotion,
  sampleWaveMotion,
} from "./motion.mjs";

// 手势类动作：arms 决定用哪只手做 IK，duration 是整段动作时长（毫秒）
export const GESTURES = {
  touchFace: { duration: 3600, arms: "right" },
  wave: { duration: 2600, arms: "right" },
  clap: { duration: 2600, arms: "both" },
};

// 手部 IK 目标（模型空间坐标）。左右分开写：对称手势两只手不能共用一个点。
// 下面这些数字是**按网格实测**定的，不是估的（量测脚本：tools/probe-surface.js）：
//   · 肩关节 y=9.61，手臂全伸 3.64
//   · 脸前表面 z≈2.0~2.6、裙摆前表面 z≈2.0~2.5
//   · 双马尾最宽 |x|≈4.95、裙摆最宽 |x|≈5.34
// 所以手既举不过头顶，也伸不到头发外侧（|x| 最多 ~3.9）；手势只能放在**身体前方**，
// 且 z 要比该高度的前表面再远 0.6 以上，否则整只手会陷进脸/裙子/马尾里。
export const GESTURE_TARGETS = {
  // 摸脸：手贴在腮帮子前一点，z 从 1.72 提到 1.85，避免手掌陷进脸里
  touchFace: { R: { x: -0.5, y: 10.8, z: 1.85 } },
  // 招手：手立在脸侧偏前，z 拉到 2.4 才不会被侧发吃掉；离肩别太远，肘才弯得住
  wave: { R: { x: -2.45, y: 11.15, z: 2.4 } },
  // 拍手：双手在胸前开合，最近也留 0.7 的手腕间距，指尖不会交叉
  clap: { R: { x: -0.85, y: 9.3, z: 2.6 }, L: { x: 0.85, y: 9.3, z: 2.6 } },
};

// 手势静止态：没有任何手势在播放时的零值，取代原来的 sampleTouchFaceMotion(1)
export const GESTURE_REST = Object.freeze({
  weight: 0,
  shoulderR: 0,
  shoulderL: 0,
  targetXOffset: 0,
  targetYOffset: 0,
  targetZOffset: 0,
  targetXOffsetL: 0,
  targetYOffsetL: 0,
  targetZOffsetL: 0,
  headX: 0,
  headY: 0,
  headZ: 0,
  bodyX: 0,
  bodyZ: 0,
  upperY: 0,
});

const GESTURE_SAMPLERS = {
  touchFace: sampleTouchFaceMotion,
  wave: sampleWaveMotion,
  clap: sampleClapMotion,
};

// 身体类动作也可以接管双手（IK）。手位同样是按网格实测定的：
//   · 跳：双手往前上方够，落在脸侧但不进头发
//   · 舞：双手叉腰，贴着腰侧
export const BODY_HANDS = {
  dance: { R: { x: -2.0, y: 8.7, z: 1.5 }, L: { x: 2.0, y: 8.7, z: 1.5 } },
};

export function bodyHands(name) {
  return BODY_HANDS[name] || null;
}

// 身体类动作的静息通道（没有动作在播时用它，避免三处渲染各写一份零值）
export const BODY_REST = bodyRestPose();

// 身体类动作（腿脚/躯干驱动），sampler 输出与跺脚同一套通道。
// 鞠躬改成身体动作：手自然垂在身侧跟着躯干走，就不会再有"手插进裙子"的问题。
export const BODY_ACTIONS = {
  dance: { duration: 4400, sampler: sampleDanceMotion },
  bow: { duration: 2400, sampler: sampleBowMotion },
};

// 菜单顺序：常用互动在前，原有点击/悬停动作在后
export const ACTIONS = [
  { id: "idle", kind: "idle", name: "自然待机", line: "先安静待机一会儿喵。" },
  { id: "wave", kind: "gesture", gesture: "wave", name: "招手打招呼", emotion: "happy", line: "主人好呀，塔菲在这里喵！" },
  { id: "dance", kind: "body", action: "dance", name: "摇摆舞步", emotion: "star", line: "跟着节奏摇摆起来喵！" },
  { id: "clap", kind: "gesture", gesture: "clap", name: "拍手鼓掌", emotion: "happy", line: "鼓掌鼓掌喵！" },
  { id: "bow", kind: "body", action: "bow", name: "鞠躬", emotion: "smile", line: "谢谢雏草姬支持喵！" },
  { id: "spin", kind: "spin", name: "张臂转圈软着陆" },
  { id: "touch", kind: "gesture", gesture: "touchFace", name: "害羞摸脸", emotion: "blush", line: "别、别一直盯着看喵…" },
  { id: "stomp", kind: "stomp", name: "跺脚" },
  { id: "walk", kind: "walk", name: "开始 / 停止走动" },
];

export function actionById(id) {
  return ACTIONS.find((item) => item.id === id) || null;
}

export function gestureMotion(name, progress) {
  const sampler = GESTURE_SAMPLERS[name];
  return sampler ? sampler(progress) : null;
}

export function bodyMotion(name, progress) {
  const spec = BODY_ACTIONS[name];
  return spec ? spec.sampler(progress) : null;
}

export function gestureDuration(name) {
  const spec = GESTURES[name];
  return spec ? spec.duration : 0;
}

export function bodyDuration(name) {
  const spec = BODY_ACTIONS[name];
  return spec ? spec.duration : 0;
}
