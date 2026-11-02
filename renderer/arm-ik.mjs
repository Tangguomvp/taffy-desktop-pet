// 手臂 2 段 IK。三处渲染（桌宠、动作预览 studio、批量预览页）共用，
// 这样手势目标点和解算结果只有一份实现。
import * as THREE from "three";
import { GESTURE_TARGETS, GESTURES } from "./actions.mjs";

// 手臂骨骼数据（模型空间，取自 PMX 骨骼坐标）
export const ARM_IK = {
  R: {
    shoulder: new THREE.Vector3(-1.46, 9.608, -0.121),
    upperDir: new THREE.Vector3(-1.5, -1.175, 0.08).normalize(),
    foreDir: new THREE.Vector3(-1.368, -1.068, -0.012).normalize(),
    upperLen: 1.907,
    foreLen: 1.736,
    elbowDir: new THREE.Vector3(-1, -1, 0.3),
  },
  L: {
    shoulder: new THREE.Vector3(1.46, 9.608, -0.121),
    upperDir: new THREE.Vector3(1.5, -1.175, 0.08).normalize(),
    foreDir: new THREE.Vector3(1.368, -1.068, -0.026).normalize(),
    upperLen: 1.907,
    foreLen: 1.736,
    elbowDir: new THREE.Vector3(1, -1, 0.3),
  },
};

// 2 段骨骼 IK：把手腕送到目标点，返回上臂/手肘欧拉角
export function solveArmIK(side, targetVec) {
  const arm = ARM_IK[side];
  const dvec = targetVec.clone().sub(arm.shoulder);
  let d = dvec.length();
  d = Math.max(Math.min(d, arm.upperLen + arm.foreLen - 0.001), Math.abs(arm.upperLen - arm.foreLen) + 0.001);
  const a = (arm.upperLen * arm.upperLen - arm.foreLen * arm.foreLen + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, arm.upperLen * arm.upperLen - a * a));
  const mid = arm.shoulder.clone().add(dvec.clone().normalize().multiplyScalar(a));
  let perp = new THREE.Vector3().crossVectors(dvec, arm.elbowDir).normalize();
  perp = new THREE.Vector3().crossVectors(perp, dvec).normalize();
  if (perp.dot(arm.elbowDir) < 0) perp.multiplyScalar(-1);
  const elbowPos = mid.clone().add(perp.multiplyScalar(h));

  const qu = new THREE.Quaternion().setFromUnitVectors(
    arm.upperDir,
    elbowPos.clone().sub(arm.shoulder).normalize()
  );
  const upperEuler = new THREE.Euler().setFromQuaternion(qu, "XYZ");

  const foreTargetLocal = targetVec.clone().sub(elbowPos).normalize().applyQuaternion(qu.clone().invert());
  const qe = new THREE.Quaternion().setFromUnitVectors(arm.foreDir, foreTargetLocal);
  const elbowEuler = new THREE.Euler().setFromQuaternion(qe, "XYZ");

  return { upperEuler, elbowEuler };
}

// 基准手位 + 曲线偏移 → 左右手目标点（模型空间）；没给的一侧返回 null
export function handTargets(base, offsets) {
  const pose = offsets || {};
  const sides = base || {};
  const out = { R: null, L: null };
  if (sides.R) {
    out.R = new THREE.Vector3(
      sides.R.x + (pose.targetXOffset || 0),
      sides.R.y + (pose.targetYOffset || 0),
      sides.R.z + (pose.targetZOffset || 0)
    );
  }
  if (sides.L) {
    out.L = new THREE.Vector3(
      sides.L.x + (pose.targetXOffsetL || 0),
      sides.L.y + (pose.targetYOffsetL || 0),
      sides.L.z + (pose.targetZOffsetL || 0)
    );
  }
  return out;
}

function solveTargets(targets) {
  const solved = { R: null, L: null };
  for (const side of ["R", "L"]) {
    if (!targets[side]) continue;
    const result = solveArmIK(side, targets[side]);
    solved[side] = { upper: result.upperEuler, elbow: result.elbowEuler };
  }
  return solved;
}

export function gestureTargets(name, motion) {
  return handTargets(GESTURE_TARGETS[name], motion);
}

// 解算整个手势：{ R: {upper, elbow} | null, L: ... }
export function resolveGesture(name, motion) {
  if (!GESTURES[name]) return { R: null, L: null };
  return solveTargets(gestureTargets(name, motion));
}

// 身体类动作（跳/舞）用的手位解算
export function resolveHands(baseSides, offsets) {
  return solveTargets(handTargets(baseSides, offsets));
}
