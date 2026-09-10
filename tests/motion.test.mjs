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
  sampleIdleMotion,
  sampleSpinMotion,
  sampleStompMotion,
  sampleTouchFaceMotion,
  sampleWalkMotion,
} from "../renderer/motion.mjs";

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
