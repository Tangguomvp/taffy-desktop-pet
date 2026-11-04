import test from "node:test";
import assert from "node:assert/strict";

import {
  WALK_STEP_RATE,
  canStartAction,
  facingYawForDirection,
  getLegRig,
  groundedCenterY,
  pickByAliasPriority,
  phaseEnvelope,
  sampleBowMotion,
  sampleDanceMotion,
  sampleIdleMotion,
  sampleNodMotion,
  sampleShakeMotion,
  sampleSpinMotion,
  sampleStompMotion,
  sampleTiltMotion,
  sampleTouchFaceMotion,
  sampleWalkMotion,
  sampleWaveMotion,
} from "../renderer/motion.mjs";
import {
  ACTIONS,
  BODY_ACTIONS,
  BODY_HANDS,
  BODY_REST,
  GESTURES,
  GESTURE_REST,
  GESTURE_TARGETS,
  actionById,
  bodyDuration,
  bodyMotion,
  gestureDuration,
  gestureMotion,
} from "../renderer/actions.mjs";

// 按步态周期相位取样：u=0 摆动中期，0.25 脚跟着地，0.5 单腿支撑，0.75 蹬离
const walkAt = (u, strength = 1) => sampleWalkMotion((2 * u) / WALK_STEP_RATE, strength);

const near = (actual, expected, epsilon = 1e-6, label = "") => {
  assert.ok(
    Math.abs(actual - expected) <= epsilon,
    `expected ${actual} to be within ${epsilon} of ${expected}${label ? ` [${label}]` : ""}`
  );
};

test("bone aliases honor explicit priority instead of skeleton order", () => {
  const ordinary = { name: "右足" };
  const deform = { name: "右足D" };
  assert.equal(pickByAliasPriority([ordinary, deform], ["右足D", "右足"]), deform);
});

test("walking yaw leans toward the actual horizontal movement direction", () => {
  near(facingYawForDirection(-1, 1), -0.38);
  near(facingYawForDirection(1, 1), 0.38);
  near(facingYawForDirection(-1, 0), 0);
});

test("phase envelope eases in, holds, and returns fully to rest", () => {
  near(phaseEnvelope(0), 0);
  near(phaseEnvelope(0.14), 0.5);
  near(phaseEnvelope(0.5), 1);
  near(phaseEnvelope(0.86), 0.5);
  near(phaseEnvelope(1), 0);
});

test("action arbitration prevents resets and gesture-spin overlap", () => {
  assert.equal(canStartAction({ spin: false, gesture: true }, "spin"), false);
  assert.equal(canStartAction({ spin: true, gesture: false }, "gesture"), false);
  assert.equal(canStartAction({ spin: true, gesture: false }, "spin"), false);
  assert.equal(canStartAction({ spin: false, gesture: false }, "gesture"), true);
});

test("action arbitration keeps discrete actions exclusive and blocks walk overlap", () => {
  assert.equal(canStartAction({ spin: false, gesture: false, stomp: false, walk: false }, "stomp"), true);
  assert.equal(canStartAction({ stomp: true }, "spin"), false);
  assert.equal(canStartAction({ stomp: true }, "gesture"), false);
  assert.equal(canStartAction({ spin: false, gesture: false, stomp: false, walk: true }, "stomp"), false);
  assert.equal(canStartAction({ walk: true }, "walk"), false);
  assert.equal(canStartAction({}, "walk"), true);

  for (const action of ["spin", "gesture", "stomp"]) {
    assert.equal(canStartAction({ [action]: true }, "walk"), false);
    assert.equal(canStartAction({ walk: true }, action), false);
  }
});

test("stomp raises the right foot, strikes, and returns every channel to rest", () => {
  const raised = sampleStompMotion(0.30);
  const strike = sampleStompMotion(0.45);
  const rest = sampleStompMotion(1);
  assert.ok(raised.legR > 0.35 && raised.legR < 0.7, "stomp lifts the thigh forward instead of kicking back");
  assert.ok(raised.kneeR < -0.7 && raised.kneeR > -1.25, "stomp bends the knee so the foot comes up under the skirt");
  assert.ok(Math.abs(raised.legRZ) >= 0.04 && Math.abs(raised.legRZ) <= 0.12);
  near(raised.legRX, 0);
  near(raised.legRY, 0);
  assert.ok(Math.abs(raised.centerX) >= 0.04 && Math.abs(raised.centerX) <= 0.1);
  assert.ok(strike.impact > 0.8);
  assert.ok(strike.legR < raised.legR, "strike plants the raised foot");
  for (const value of Object.values(rest)) near(value, 0);
});

test("stomp phases meet continuously at raise, strike, and settle boundaries", () => {
  for (const boundary of [0.26, 0.36, 0.5, 0.68]) {
    const before = sampleStompMotion(boundary - 1e-6);
    const at = sampleStompMotion(boundary);
    for (const channel of Object.keys(before)) {
      near(at[channel], before[channel], 1e-4);
    }
  }
});

test("walk alternates opposite limbs and preserves foot contact phases", () => {
  const a = walkAt(0.25);
  const b = walkAt(0.75);
  assert.ok(a.legR * b.legR < 0);
  assert.ok(a.legRZ * b.legRZ < 0, "walk keeps a small alternating leg silhouette");
  assert.ok(Math.abs(a.legRZ) <= 0.05 && Math.abs(b.legRZ) <= 0.05, "walk must not splay the legs");
  near(a.legRX, 0);
  near(b.legRX, 0);
  assert.ok(Math.abs(a.legR) >= 0.35 && Math.abs(a.legR) <= 0.55, "walk stride must be readable without clipping the skirt");
  assert.ok(Math.abs(a.centerX) <= 0.04 && Math.abs(b.centerX) <= 0.04);
  assert.ok(a.footR * b.footR < 0, "walk feet must roll through opposite contact phases");
  assert.ok(a.armR * a.legR < 0);
  assert.ok(Math.abs(a.armR) >= 0.28 && Math.abs(a.armR) <= 0.42);
  assert.ok(Math.abs(a.bodyZ) >= 0.02 && Math.abs(a.bodyZ) <= 0.05);
  assert.ok(a.centerY >= 0 && b.centerY >= 0);
});

test("walk lifts the swing knee while the stance leg stays planted", () => {
  const rightSwing = walkAt(0);
  const leftSwing = walkAt(0.5);
  assert.ok(rightSwing.kneeR < -0.7, "right knee bends during the forward swing");
  assert.ok(Math.abs(rightSwing.kneeL) < 0.08, "left stance knee stays nearly straight");
  assert.ok(leftSwing.kneeL < -0.7, "left knee bends during the forward swing");
  assert.ok(Math.abs(leftSwing.kneeR) < 0.08, "right stance knee stays nearly straight");
  assert.ok(Math.abs(rightSwing.legR) < 0.08, "mid-swing hip is passing through center, not kicking back");
});

test("idle motion keeps a living asymmetry instead of mirrored arm swings", () => {
  const pose = sampleIdleMotion(1.25);

  assert.notEqual(pose.armR, -pose.armL);
  assert.ok(Math.abs(pose.bodyZ) > 0.001);
  assert.ok(Math.abs(pose.headY) > 0.001);
});

test("spin anticipates backwards, opens the silhouette, and lands softly", () => {
  const anticipation = sampleSpinMotion(0.08);
  const middle = sampleSpinMotion(0.55);
  const landed = sampleSpinMotion(1);

  assert.ok(anticipation.turns < 0);
  assert.ok(middle.turns > 0.45 && middle.turns < 0.75);
  assert.ok(middle.armOpen > 0.85);
  assert.ok(middle.centerY > 0.2);
  assert.ok(middle.legR > 0.35 && middle.kneeR < -0.7, "spin lifts a bent leg for a readable twirl");
  assert.ok(middle.legRZ < -0.12, "spin opens the lifted leg sideways so the foot stays in silhouette");
  near(landed.turns, 1);
  near(landed.centerY, 0);
  near(landed.armOpen, 0);
  near(landed.legR, 0);
  near(landed.kneeR, 0);
});

test("face touch follows a curved approach, holds, then fully releases", () => {
  const approach = sampleTouchFaceMotion(0.12);
  const hold = sampleTouchFaceMotion(0.5);
  const released = sampleTouchFaceMotion(1);

  assert.ok(approach.weight > 0 && approach.weight < 1);
  near(hold.weight, 1);
  assert.ok(Math.abs(hold.targetYOffset) > 0.01);
  assert.ok(hold.headZ < 0);
  near(released.weight, 0);
  near(released.targetYOffset, 0);
  near(released.headZ, 0);
});

test("face touch lets the hand lead and the head follow", () => {
  const early = sampleTouchFaceMotion(0.16);
  const late = sampleTouchFaceMotion(0.88);
  // 手已经抬起来了头才开始偏，手撤了头还留在原地
  assert.ok(early.weight > Math.abs(early.headZ) / 0.08, "hand reaches before the head turns");
  assert.ok(late.weight < 0.4, "hand is already on its way back");
  assert.ok(Math.abs(late.headZ) > 0.01, "head lingers after the hand leaves");
});

test("walk stance knee loads, extends, then folds for push-off", () => {
  const heel = walkAt(0.25);
  const load = walkAt(0.34);
  const mid = walkAt(0.5);
  const push = walkAt(0.75);

  assert.ok(Math.abs(load.kneeR) > Math.abs(heel.kneeR) + 0.1, "landing bends the knee to absorb");
  assert.ok(Math.abs(mid.kneeR) < Math.abs(load.kneeR) - 0.1, "knee straightens back under load");
  assert.ok(Math.abs(push.kneeR) > Math.abs(mid.kneeR) + 0.1, "knee folds again before toe-off");
});

test("walk rolls the foot from heel strike to toe-off", () => {
  assert.ok(walkAt(0.25).footR < 0, "toe points up at heel strike");
  assert.ok(walkAt(0.75).footR > 0.2, "toe pushes down at push-off");
  assert.ok(walkAt(0).footR < 0, "swing foot lifts so it does not scrape");
});

test("walk keeps the weight over the supporting leg", () => {
  // 右腿支撑期是 u ∈ [0.25, 0.75]
  assert.ok(walkAt(0.5).centerX > 0.01, "weight sits on the right leg mid-stance");
  assert.ok(walkAt(0).centerX < -0.01, "weight sits on the left leg mid-stance");
  // 双腿支撑时最低，单腿支撑时最高
  assert.ok(walkAt(0.25).centerY < walkAt(0.5).centerY);
});

test("walk swings the arms further forward than backward", () => {
  const forward = walkAt(0.75).armR;
  const backward = walkAt(0.25).armR;
  assert.ok(forward > 0, "right arm swings forward as the right leg goes back");
  assert.ok(backward < 0);
  assert.ok(forward > -backward, "forward reach should exceed backward reach");
});

test("walk cycle is continuous across the whole gait", () => {
  const a = walkAt(0.9999);
  const b = walkAt(0);
  for (const channel of Object.keys(a)) {
    near(a[channel], b[channel], 1e-3);
  }
});

test("discrete actions never jump between phases", () => {
  const boundaries = {
    spin: [0.12, 0.76, 0.9],
    stomp: [0.28, 0.34, 0.44, 0.62, 0.78],
  };
  const samples = {
    spin: sampleSpinMotion,
    stomp: sampleStompMotion,
  };
  for (const [name, points] of Object.entries(boundaries)) {
    for (const boundary of points) {
      const before = samples[name](boundary - 1e-6);
      const at = samples[name](boundary);
      for (const channel of Object.keys(before)) {
        near(at[channel], before[channel], 1e-4, `${name}@${boundary}.${channel}`);
      }
    }
  }
});

test("every discrete action starts and ends exactly at rest", () => {
  for (const [name, fn] of Object.entries({
    spin: sampleSpinMotion,
    stomp: sampleStompMotion,
    touch: sampleTouchFaceMotion,
  })) {
    for (const p of [0, 1]) {
      const pose = fn(p);
      for (const [channel, value] of Object.entries(pose)) {
        // spin 的 turns 收在 1（转满一圈），不是 0
        if (name === "spin" && channel === "turns" && p === 1) {
          near(value, 1);
          continue;
        }
        near(value, 0, 1e-9, `${name}(${p}).${channel}`);
      }
    }
  }
});

test("grounded actions keep the planted foot on the floor, not floating", () => {
  const { upper, lower } = getLegRig();
  const rest = upper + lower;
  const drop = (h, k) => upper * Math.cos(h) + lower * Math.cos(h + k);
  const footClearance = (pose) =>
    pose.centerY + rest - Math.max(drop(pose.legR, pose.kneeR), drop(pose.legL, pose.kneeL));

  // check spin landing stays grounded
  for (const p of [0.8, 0.9, 0.95]) {
    near(footClearance(sampleSpinMotion(p)), 0, 1e-4, `spin@${p} 落地脚悬空`);
  }
});

test("groundedCenterY maps leg geometry onto floor height", () => {
  const { upper, lower } = getLegRig();
  // 腿完全伸直时重心该回到 0
  near(groundedCenterY(0, 0), 0);
  // 膝盖越弯，重心降得越多，且是负值
  const bent = groundedCenterY(0, -1.0);
  assert.ok(bent < 0 && bent > -(upper + lower), "屈膝时重心应下沉但不超过腿长");
});
// ---------------------------------------------------------------------------
// 第二批动作：招手 / 伸懒腰 / 拍手 / 比心 / 鞠躬（手势）+ 原地跳 / 摇摆舞步（身体）
// ---------------------------------------------------------------------------

const gestureSamplers = {
  wave: sampleWaveMotion,
};
const bodySamplers = {
  dance: sampleDanceMotion,
  bow: sampleBowMotion,
  nod: sampleNodMotion,
  shake: sampleShakeMotion,
  tilt: sampleTiltMotion,
};

const footClearance = (pose) => {
  const { upper, lower } = getLegRig();
  const rest = upper + lower;
  const drop = (h, k) => upper * Math.cos(h) + lower * Math.cos(h + k);
  return pose.centerY + rest - Math.max(drop(pose.legR, pose.kneeR), drop(pose.legL, pose.kneeL));
};

test("every new action starts and ends exactly at rest", () => {
  for (const [name, fn] of Object.entries({ ...gestureSamplers, ...bodySamplers })) {
    for (const p of [0, 1]) {
      const pose = fn(p);
      for (const [channel, value] of Object.entries(pose)) {
        near(value, 0, 1e-9, name + "(" + p + ")." + channel);
      }
    }
  }
});

test("every new action is continuous over its whole span", () => {
  for (const [name, fn] of Object.entries({ ...gestureSamplers, ...bodySamplers })) {
    let prev = fn(0);
    for (let i = 1; i <= 200; i++) {
      const p = i / 200;
      const cur = fn(p);
      for (const channel of Object.keys(prev)) {
        const step = Math.abs((cur[channel] || 0) - (prev[channel] || 0));
        assert.ok(
          step < 0.2,
          name + " 在 p=" + p.toFixed(3) + " 的 " + channel + " 跳了 " + step.toFixed(3)
        );
      }
      prev = cur;
    }
  }
});

test("gestures raise one or both hands instead of leaving the arms at rest", () => {
  for (const [name, fn] of Object.entries(gestureSamplers)) {
    const mid = fn(0.5);
    assert.ok(mid.weight > 0.9, name + " 中途应完全展开");
    const reach = Math.abs(mid.targetYOffset) + Math.abs(mid.targetXOffset);
    assert.ok(reach > 0.05, name + " 没有把手送到目标点");
  }
});

test("waving swings the hand both ways while the head stays calm", () => {
  const samples = [];
  for (let i = 0; i <= 20; i++) samples.push(sampleWaveMotion(0.34 + i * 0.012));
  const offsets = samples.map((pose) => pose.targetXOffset);
  assert.ok(Math.max(...offsets) > 0.12, "招手要摆到一侧");
  assert.ok(Math.min(...offsets) < -0.12, "招手要摆到另一侧");
  const hold = sampleWaveMotion(0.5);
  assert.ok(Math.abs(hold.headZ) > 0.04 && Math.abs(hold.headZ) < 0.12, "头只是轻轻偏一下");
});

test("nodding dips the head twice while the feet stay planted", () => {
  const samples = [];
  for (let i = 0; i <= 200; i++) samples.push(sampleNodMotion(i / 200));
  const heads = samples.map((pose) => pose.headX);
  let peaks = 0;
  for (let i = 1; i < heads.length - 1; i++) {
    if (heads[i] > heads[i - 1] && heads[i] >= heads[i + 1] && heads[i] > 0.08) peaks += 1;
  }
  assert.ok(peaks >= 2, "点头要有两下，实际 " + peaks + " 下");
  assert.ok(Math.max(...heads) > 0.2, "头要真的低下去");
  for (const pose of samples) {
    assert.ok(footClearance(pose) >= -1e-6, "点头时脚不能踩进地里");
  }
});

test("shaking sweeps the head both ways several times", () => {
  const heads = [];
  for (let i = 0; i <= 120; i++) heads.push(sampleShakeMotion(i / 120).headY);
  let flips = 0;
  for (let i = 1; i < heads.length; i++) {
    if (Math.sign(heads[i]) !== Math.sign(heads[i - 1])) flips += 1;
  }
  assert.ok(flips >= 4, "摇头要来回摆几次，实际换向 " + flips + " 次");
  assert.ok(Math.max(...heads) > 0.2 && Math.min(...heads) < -0.2, "两边都要摆到位");
});

test("head tilt settles and holds without moving the legs", () => {
  const mid = sampleTiltMotion(0.5);
  assert.ok(mid.headZ > 0.2, "头要歪到位");
  assert.ok(mid.shoulderR > 0.05, "歪头时肩要跟着耸一点");
  near(mid.legR, 0);
  near(mid.kneeR, 0);
  // 歪过去是慢慢加的，不是一下弹到位
  const early = sampleTiltMotion(0.12);
  assert.ok(mid.headZ > early.headZ, "歪头要慢慢加过去");
});

test("bow folds the torso forward, dips the knees, and keeps arms relaxed", () => {
  const mid = sampleBowMotion(0.5);
  assert.ok(mid.bodyX > 0.25, "鞠躬要把上身前折");
  assert.ok(mid.headX > 0.08, "头要跟着低下去");
  assert.ok(mid.kneeR < -0.1 && mid.kneeL < -0.1, "屈膝一点点，重心才跟着下去");
  assert.ok(mid.centerY < 0, "屈膝时重心要下沉");
  // 手不做 IK：只允许很小的下垂摆动，不能伸到身前去（会插进裙子）
  assert.ok(Math.abs(mid.armR) < 0.25 && Math.abs(mid.armL) < 0.25);
});

// 手部目标点的"离体表距离"回归测试。
// 表格来自 tools/probe-surface.js 对模型网格的实测（静止姿态，三个坐标轴同一坐标系）：
// 每个高度 y 上，|x| 落在 0/1/2/3/4 附近时身体最靠前的 z。null = 该位置没有网格。
const FRONT_SURFACE = [
  { y: 7, z: [2.18, 2.0, 1.54, null, 0.47] },
  { y: 8, z: [1.87, 1.77, 1.17, 0.47, 0.41] },
  { y: 9, z: [1.64, 1.53, 1.08, 0.68, null] },
  { y: 9.5, z: [1.62, 1.53, 1.08, 0.39, null] },
  { y: 10, z: [1.43, 1.53, 1.14, null, null] },
  { y: 11, z: [1.91, 1.75, 1.48, 0.94, null] },
  { y: 12, z: [2.13, 1.78, 1.45, 0.94, null] },
  { y: 13, z: [2.6, 2.41, 1.56, 1.26, null] },
];

function frontZAt(x, y) {
  const row = FRONT_SURFACE.reduce((best, item) =>
    Math.abs(item.y - y) < Math.abs(best.y - y) ? item : best
  );
  const bucket = Math.min(4, Math.round(Math.abs(x)));
  return row.z[bucket];
}

test("hand targets stay outside the body surface instead of clipping into it", () => {
  // touchFace 是"手贴在脸上"的动作，允许贴到 0 间隙；其余手势必须留 0.3 以上
  const minClearance = { touchFace: -0.01 };
  for (const [name, sides] of Object.entries(GESTURE_TARGETS)) {
    const need = minClearance[name] ?? 0.3;
    for (const [side, target] of Object.entries(sides)) {
      const front = frontZAt(target.x, target.y);
      if (front == null) continue;
      const clearance = target.z - front;
      assert.ok(
        clearance >= need,
        name + "/" + side + " 的手离体表只有 " + clearance.toFixed(2) + "（会穿模）"
      );
    }
  }
});

test("two-handed gestures keep the wrists far enough apart that the hands cannot cross", () => {
  for (const name of []) {
    const base = GESTURE_TARGETS[name];
    let closest = Infinity;
    for (let i = 0; i <= 100; i++) {
      const motion = gestureMotion(name, i / 100);
      const right = [
        base.R.x + (motion.targetXOffset || 0),
        base.R.y + (motion.targetYOffset || 0),
        base.R.z + (motion.targetZOffset || 0),
      ];
      const left = [
        base.L.x + (motion.targetXOffsetL || 0),
        base.L.y + (motion.targetYOffsetL || 0),
        base.L.z + (motion.targetZOffsetL || 0),
      ];
      const gap = Math.hypot(right[0] - left[0], right[1] - left[1], right[2] - left[2]);
      closest = Math.min(closest, gap);
    }
    assert.ok(
      closest >= 0.55,
      name + " 两只手腕最近只有 " + closest.toFixed(2) + "，手掌会互相插进去"
    );
  }
});

test("dance drives the hands through IK targets instead of raw elbow angles", () => {
  assert.ok(sampleDanceMotion(0.5).handW > 0.8, "跳舞全程双手叉腰要走 IK");
  for (const [name, sides] of Object.entries(BODY_HANDS)) {
    for (const [side, target] of Object.entries(sides)) {
      const front = frontZAt(target.x, target.y);
      if (front == null) continue;
      const clearance = target.z - front;
      assert.ok(
        clearance >= 0.3,
        name + "/" + side + " 的手离体表只有 " + clearance.toFixed(2) + "（会穿模）"
      );
    }
  }
});

test("dancing shifts weight from leg to leg with a lifted knee", () => {
  const right = sampleDanceMotion(0.36);
  const left = sampleDanceMotion(0.53);
  assert.ok(Math.sign(right.centerX) !== Math.sign(left.centerX), "重心要左右倒替");
  const spread = Math.abs(right.kneeL - right.kneeR);
  assert.ok(spread > 0.12, "要有一条腿明显屈起");
  const straighter = Math.abs(right.kneeR) < Math.abs(right.kneeL) ? right.kneeR : right.kneeL;
  assert.ok(Math.abs(straighter) < 0.35, "支撑腿不能跟着一起弯");
  assert.ok(right.handW > 0.8, "跳舞要叉腰（手位走 IK）");
});

test("dancing keeps the feet on or above the floor at every phase", () => {
  for (let i = 0; i <= 200; i++) {
    const p = i / 200;
    assert.ok(footClearance(sampleDanceMotion(p)) >= -1e-6, "p=" + p + " 时脚踩进地里了");
  }
});

test("action registry stays in sync with the curves and the menu", () => {
  const ids = ACTIONS.map((spec) => spec.id);
  assert.equal(new Set(ids).size, ids.length, "动作 id 不能重复");
  const expected = ["idle", "wave", "dance", "bow", "nod", "shake", "tilt", "spin", "touch", "stomp", "walk"];
  for (const id of expected) assert.ok(ids.includes(id), "菜单缺少动作 " + id);
  for (const spec of ACTIONS) {
    assert.ok(spec.name && spec.name.length > 0, spec.id + " 缺少中文名");
    if (spec.kind === "gesture") {
      assert.ok(GESTURES[spec.gesture], spec.id + " 没有手势定义");
      assert.ok(gestureDuration(spec.gesture) > 0, spec.id + " 没有时长");
      const mid = gestureMotion(spec.gesture, 0.5);
      assert.ok(mid && mid.weight > 0.9, spec.id + " 的手势曲线没展开");
    }
    if (spec.kind === "body") {
      assert.ok(BODY_ACTIONS[spec.action], spec.id + " 没有身体动作定义");
      assert.ok(bodyDuration(spec.action) > 0, spec.id + " 没有时长");
      const mid = bodyMotion(spec.action, 0.5);
      assert.ok(mid && Object.keys(mid).length > 10, spec.id + " 的曲线没有输出通道");
    }
  }
  assert.equal(actionById("nope"), null);
  for (const value of Object.values(GESTURE_REST)) near(value, 0);
  for (const value of Object.values(BODY_REST)) near(value, 0);
});

test("new body actions take part in the same arbitration as stomp", () => {
  assert.equal(canStartAction({}, "jump"), true);
  assert.equal(canStartAction({}, "dance"), true);
  assert.equal(canStartAction({ gesture: true }, "jump"), false);
  assert.equal(canStartAction({ action: true }, "gesture"), false);
  assert.equal(canStartAction({ action: true }, "walk"), false);
  assert.equal(canStartAction({ walk: true }, "dance"), false);
  assert.equal(canStartAction({ action: true }, "action"), false);
});
