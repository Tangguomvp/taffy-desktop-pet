// 动作预览（studio 窗口 / 批量截图）共用的姿态计算与骨骼应用。
// 桌宠本体在 pet.js 里还有视线、平滑、情绪叠加等额外处理，所以不复用这一段；
// 但通道名字和叠加规则完全一致，预览看到的就是桌宠会做的动作。
import * as THREE from "three";
import {
  BODY_REST,
  GESTURE_REST,
  bodyDuration,
  bodyHands,
  bodyMotion,
  gestureDuration,
  gestureMotion,
} from "./actions.mjs";
import { resolveGesture, resolveHands } from "./arm-ik.mjs";
import {
  facingYawForDirection,
  pickByAliasPriority,
  sampleIdleMotion,
  sampleSpinMotion,
  sampleStompMotion,
  sampleWalkMotion,
} from "./motion.mjs";

// 某个动作在 elapsed 秒时的所有通道
export function sampleActionPose(spec, elapsedSeconds, idleTime) {
  const idle = sampleIdleMotion(idleTime);
  const seconds = Math.max(0, Number(elapsedSeconds) || 0);
  let spin = sampleSpinMotion(0);
  let stomp = sampleStompMotion(1);
  let gesture = GESTURE_REST;
  let gestureName = "";
  let body = BODY_REST;
  let walk = sampleWalkMotion(0, 0);
  let facing = 0;
  let finished = false;

  if (spec && spec.kind === "spin") {
    const p = Math.min(1, seconds / 1.4);
    spin = sampleSpinMotion(p);
    facing = spin.turns * Math.PI * 2;
    finished = p >= 1;
  } else if (spec && spec.kind === "gesture") {
    const duration = gestureDuration(spec.gesture) / 1000;
    const p = duration > 0 ? Math.min(1, seconds / duration) : 1;
    gesture = gestureMotion(spec.gesture, p) || GESTURE_REST;
    gestureName = gesture.weight > 0.001 ? spec.gesture : "";
    finished = p >= 1;
  } else if (spec && spec.kind === "stomp") {
    const p = Math.min(1, seconds);
    stomp = sampleStompMotion(p);
    finished = p >= 1;
  } else if (spec && spec.kind === "body") {
    const duration = bodyDuration(spec.action) / 1000;
    const p = duration > 0 ? Math.min(1, seconds / duration) : 1;
    body = bodyMotion(spec.action, p) || BODY_REST;
    finished = p >= 1;
  } else if (spec && spec.kind === "walk") {
    walk = sampleWalkMotion(seconds, 1);
    facing = facingYawForDirection(-1, 1);
  }

  return { spec, idle, spin, stomp, gesture, gestureName, body, walk, facing, finished };
}

function boneAny(mesh, ...names) {
  return pickByAliasPriority(mesh.skeleton.bones, names);
}

// 腿骨位移必须基于静息位置，否则每帧累加会让腿越走越远
const restPositions = new WeakMap();
function setOffset(bone, x, y) {
  if (!restPositions.has(bone)) restPositions.set(bone, bone.position.clone());
  const rest = restPositions.get(bone);
  bone.position.set(rest.x + (x || 0), rest.y + (y || 0), rest.z);
}

export function applyMotionPose(mesh, pose) {
  const { idle, spin, stomp, gesture, gestureName, body, walk } = pose;
  const head = boneAny(mesh, "頭", "头", "Head");
  const neck = boneAny(mesh, "首");
  const upper = boneAny(mesh, "上半身");
  const lower = boneAny(mesh, "下半身");
  const center = boneAny(mesh, "センター", "センター2");
  const armR = boneAny(mesh, "右腕D");
  const armL = boneAny(mesh, "左腕D");
  const elbowR = boneAny(mesh, "右ひじD");
  const elbowL = boneAny(mesh, "左ひじD");
  const shoulderR = boneAny(mesh, "右肩D");
  const shoulderL = boneAny(mesh, "左肩D");
  const legR = boneAny(mesh, "右足D", "右足", "右腿", "RightLeg");
  const legL = boneAny(mesh, "左足D", "左足", "左腿", "LeftLeg");
  const kneeR = boneAny(mesh, "右ひざD", "右ひざ", "右膝", "RightKnee");
  const kneeL = boneAny(mesh, "左ひざD", "左ひざ", "左膝", "LeftKnee");
  const ankleR = boneAny(mesh, "右足首D", "右足首", "右脚踝", "RightAnkle");
  const ankleL = boneAny(mesh, "左足首D", "左足首", "左脚踝", "LeftAnkle");

  mesh.rotation.y = pose.facing;

  if (upper) {
    upper.rotation.z = idle.bodyZ + spin.bodyX + gesture.bodyZ + walk.bodyZ + stomp.bodyZ + (body.bodyZ || 0);
    upper.rotation.x = idle.breath + idle.bodyX + spin.bodyZ + walk.bodyX + stomp.bodyX + (gesture.bodyX || 0) + (body.bodyX || 0) + stomp.impact * 0.025 + (body.impact || 0) * 0.025;
    upper.rotation.y = (walk.upperY || 0) + (stomp.upperY || 0) + (body.upperY || 0);
  }
  if (lower) lower.rotation.y = (walk.lowerY || 0) + (stomp.lowerY || 0) + (body.lowerY || 0);
  if (head) {
    head.rotation.x = idle.headX + gesture.headX + stomp.headX + (walk.headX || 0) + (body.headX || 0);
    head.rotation.y = idle.headY + (gesture.headY || 0) + (walk.headY || 0) + (body.headY || 0);
    head.rotation.z = idle.headZ + spin.bodyX * 0.45 + gesture.headZ + stomp.headZ + (body.headZ || 0);
  }
  if (neck) neck.rotation.x = idle.breath * 0.6 + gesture.headX * 0.3;

  if (center) {
    center.position.x = walk.centerX + stomp.centerX + (body.centerX || 0);
    center.position.y = idle.centerY + spin.centerY + walk.centerY + stomp.centerY + (body.centerY || 0);
  }

  // 手臂：基础姿态（下垂 + 转圈/跳跃张臂 + 身体动作摆动）再叠加 IK 手势
  const armOpen = Math.max(spin.armOpen || 0, body.armOpen || 0);
  const armDrop = 0.62 * (1 - armOpen);
  const raiseR = armOpen * 0.82;
  const raiseL = armOpen * 0.82;
  const baseArmR = {
    x: idle.armR + walk.armR + stomp.armR + (body.armR || 0),
    y: 0,
    z: -raiseR * 1.15 + armDrop + (body.armZR || 0),
  };
  const baseArmL = {
    x: idle.armL + walk.armL + stomp.armL + (body.armL || 0),
    y: 0,
    z: raiseL * 1.15 - armDrop + (body.armZL || 0),
  };
  const baseElbowR = { x: -armOpen * 0.25 - (walk.elbowR || 0) - (body.elbowR || 0), y: 0, z: 0 };
  const baseElbowL = { x: -armOpen * 0.25 - (walk.elbowL || 0) - (body.elbowL || 0), y: 0, z: 0 };

  const weight = gestureName ? gesture.weight : 0;
  const solved = gestureName ? resolveGesture(gestureName, gesture) : { R: null, L: null };

  // 身体动作 / 候选动作 的手位 IK，和手势走同一条混合链
  const bodyHandSpec =
    pose.spec && pose.spec.hands
      ? pose.spec.hands
      : pose.spec && pose.spec.kind === "body"
        ? bodyHands(pose.spec.action)
        : null;
  const bodyHandW = bodyHandSpec ? Math.max(0, Math.min(1, body.handW || 0)) : 0;
  // 对称偏移：R 用 handDX，L 默认取反，这样"两只手一起抬/一起摊"才对称
  const handDX = body.handDX || 0;
  const handDXL = body.handDXL != null ? body.handDXL : -handDX;
  const bodySolved =
    bodyHandSpec && bodyHandW > 0.001
      ? resolveHands(bodyHandSpec, {
          targetXOffset: handDX,
          targetXOffsetL: handDXL,
          targetYOffset: body.handDY || 0,
          targetYOffsetL: body.handDY || 0,
          targetZOffset: body.handDZ || 0,
          targetZOffsetL: body.handDZ || 0,
        })
      : { R: null, L: null };

  const blendInto = (base, target, w) => {
    if (!target || w <= 0) return base;
    return {
      x: base.x * (1 - w) + target.x * w,
      y: base.y * (1 - w) + target.y * w,
      z: base.z * (1 - w) + target.z * w,
    };
  };
  const blend = (base, bodyTarget, gestureTarget) => {
    const withBody = blendInto(base, bodyTarget, bodyHandW);
    return blendInto(withBody, gestureTarget, weight);
  };

  if (armR) {
    const r = blend(baseArmR, bodySolved.R ? bodySolved.R.upper : null, solved.R ? solved.R.upper : null);
    armR.rotation.set(r.x, r.y, r.z);
  }
  if (armL) {
    const r = blend(baseArmL, bodySolved.L ? bodySolved.L.upper : null, solved.L ? solved.L.upper : null);
    armL.rotation.set(r.x, r.y, r.z);
  }
  if (elbowR) {
    const r = blend(baseElbowR, bodySolved.R ? bodySolved.R.elbow : null, solved.R ? solved.R.elbow : null);
    elbowR.rotation.set(r.x, r.y, r.z);
  }
  if (elbowL) {
    const r = blend(baseElbowL, bodySolved.L ? bodySolved.L.elbow : null, solved.L ? solved.L.elbow : null);
    elbowL.rotation.set(r.x, r.y, r.z);
  }
  if (shoulderR) {
    shoulderR.rotation.z = -armOpen * 0.1 - (gesture.shoulderR || 0) - (body.shoulderR || 0);
  }
  if (shoulderL) {
    shoulderL.rotation.z = armOpen * 0.1 + (gesture.shoulderL || 0) + (body.shoulderL || 0);
  }

  if (legR) {
    legR.rotation.x = walk.legR + stomp.legR + (spin.legR || 0) + (body.legR || 0);
    legR.rotation.z = walk.legRZ + stomp.legRZ + (spin.legRZ || 0) + (body.legRZ || 0);
    setOffset(legR, (walk.legRX || 0) + (stomp.legRX || 0), (walk.legRY || 0) + (stomp.legRY || 0));
  }
  if (legL) {
    legL.rotation.x = walk.legL + stomp.legL + (spin.legL || 0) + (body.legL || 0);
    legL.rotation.z = walk.legLZ + stomp.legLZ + (body.legLZ || 0);
    setOffset(legL, (walk.legLX || 0) + (stomp.legLX || 0), (walk.legLY || 0) + (stomp.legLY || 0));
  }
  if (kneeR) kneeR.rotation.x = walk.kneeR + stomp.kneeR + (spin.kneeR || 0) + (body.kneeR || 0);
  if (kneeL) kneeL.rotation.x = walk.kneeL + stomp.kneeL + (spin.kneeL || 0) + (body.kneeL || 0);
  if (ankleR) ankleR.rotation.x = (walk.footR || 0) + (stomp.footR || 0) + (spin.footR || 0) + (body.footR || 0);
  if (ankleL) ankleL.rotation.x = (walk.footL || 0) + (stomp.footL || 0) + (spin.footL || 0) + (body.footL || 0);

  mesh.updateMatrixWorld(true);
  mesh.skeleton.update();
}

// 静帧预览用的采样相位：选每个动作最有辨识度的一瞬间
export const PREVIEW_PHASES = {
  idle: 0,
  wave: 0.5,
  dance: 0.42,
  bow: 0.45,
  nod: 0.32,
  shake: 0.31,
  tilt: 0.5,
  spin: 0.55,
  touch: 0.5,
  stomp: 0.3,
  walk: 0.25,
};

// 把预览相位换算成 sampleActionPose 需要的秒数
export function previewElapsed(spec, phase) {
  const p = Math.max(0, Math.min(1, Number(phase) || 0));
  if (!spec) return 0;
  if (spec.kind === "spin") return p * 1.4;
  if (spec.kind === "stomp") return p;
  if (spec.kind === "gesture") return (p * gestureDuration(spec.gesture)) / 1000;
  if (spec.kind === "body") return (p * bodyDuration(spec.action)) / 1000;
  if (spec.kind === "walk") return 1 / 7.2;
  return 0;
}
