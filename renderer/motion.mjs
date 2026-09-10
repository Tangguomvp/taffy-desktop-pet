// 动作曲线。所有离散动作都遵循同一套人体运动学：
//   预备(anticipation) → 主动作 → 跟随(follow-through) → 缓冲吸收(landing) → 回正
// 每个通道在 p=0 与 p=1 必须精确归零，否则动作之间会出现跳变。
const clamp01 = (value) => Math.max(0, Math.min(1, Number(value) || 0));

const smootherstep = (value) => {
  const x = clamp01(value);
  return x * x * x * (x * (x * 6 - 15) + 10);
};

// 加速：重力 / 爆发起跳用，位移集中在末段
const easeInCubic = (value) => {
  const x = clamp01(value);
  return x * x * x;
};

// 减速：冲击吸收 / 到位停顿用，位移集中在前段
const easeOutCubic = (value) => {
  const x = clamp01(value);
  return 1 - (1 - x) ** 3;
};

const easeInOutCubic = (value) => {
  const x = clamp01(value);
  return x < 0.5 ? 4 * x * x * x : 1 - ((-2 * x + 2) ** 3) / 2;
};

// 转动用正弦缓动：两端速度归零，中段比 cubic 平缓，读起来是"转"而不是"甩"
const easeInOutSine = (value) => {
  const x = clamp01(value);
  return 0.5 - Math.cos(Math.PI * x) / 2;
};

// 高斯冲击：触地瞬间最强，之后快速衰减，并带一次反向余震
const gauss = (x, mu, sigma) => Math.exp(-(((x - mu) / sigma) ** 2));

// 周期性关键帧曲线（Catmull-Rom，切线按区间宽度缩放）
function makeCurve(keys) {
  const pts = keys.slice().sort((a, b) => a[0] - b[0]);
  const n = pts.length;
  const spanAt = (i) => {
    const a = pts[i][0];
    const b = pts[(i + 1) % n][0];
    return b > a ? b - a : b + 1 - a;
  };
  return (u) => {
    const x = ((u % 1) + 1) % 1;
    let seg = -1;
    for (let k = 0; k < n; k++) {
      let d = x - pts[k][0];
      if (d < 0) d += 1;
      if (d <= spanAt(k)) {
        seg = k;
        break;
      }
    }
    if (seg < 0) seg = n - 1;
    const width = spanAt(seg);
    let d = x - pts[seg][0];
    if (d < 0) d += 1;
    const t = width > 1e-6 ? Math.min(1, d / width) : 0;
    const v0 = pts[(seg - 1 + n) % n][1];
    const v1 = pts[seg][1];
    const v2 = pts[(seg + 1) % n][1];
    const v3 = pts[(seg + 2) % n][1];
    const m1 = ((v2 - v0) / 2) * width;
    const m2 = ((v3 - v1) / 2) * width;
    const t2 = t * t;
    const t3 = t2 * t;
    return (
      (2 * t3 - 3 * t2 + 1) * v1 +
      (t3 - 2 * t2 + t) * m1 +
      (-2 * t3 + 3 * t2) * v2 +
      (t3 - t2) * m2
    );
  };
}

// 腿长（模型单位）。真实值在绑定骨骼时由 pet.js 写入；缺省按常见 PMX 比例估。
const legRig = { upper: 3.5, lower: 3.5 };

export function setLegRig(upper, lower) {
  if (Number.isFinite(Number(upper)) && Number(upper) > 0.2) legRig.upper = Number(upper);
  if (Number.isFinite(Number(lower)) && Number(lower) > 0.2) legRig.lower = Number(lower);
}

export function getLegRig() {
  return { upper: legRig.upper, lower: legRig.lower };
}

// 让某条腿的脚底留在地面上、重心必须落到的高度（相对站直时，恒为负或 0）。
// center 骨骼与脚同高，所以 bodyY = drop - rest 时脚底正好贴地。
export function groundedCenterY(hip, knee) {
  const rest = legRig.upper + legRig.lower;
  return (
    legRig.upper * Math.cos(hip) + legRig.lower * Math.cos(hip + knee) - rest
  );
}

// 两条腿里更伸直的那条会把身体撑住，另一条自然离地——取 max 才对。
// 想让脚离地（腾空 / 抬腿），在结果上再加一个 air 高度。
export function plantedCenterY(hipR, kneeR, hipL, kneeL) {
  return Math.max(groundedCenterY(hipR, kneeR), groundedCenterY(hipL, kneeL));
}

export function pickByAliasPriority(items, names) {
  for (const name of names || []) {
    const match = (items || []).find((item) => item?.name === name);
    if (match) return match;
  }
  return null;
}

export function facingYawForDirection(direction, blend = 1) {
  if ((Number(blend) || 0) <= 0.001) return 0;
  return direction < 0 ? -0.38 : 0.38;
}

export function canStartAction(active, requested) {
  const state = active || {};
  const spin = Boolean(state.spin);
  const gesture = Boolean(state.gesture);
  const stomp = Boolean(state.stomp);
  const walk = Boolean(state.walk);
  if (requested === "spin") return !spin && !gesture && !stomp && !walk;
  if (requested === "gesture") return !spin && !gesture && !stomp && !walk;
  if (requested === "stomp") return !spin && !gesture && !stomp && !walk;
  if (requested === "walk") return !walk && !spin && !gesture && !stomp;
  return false;
}

export function phaseEnvelope(progress, attackEnd = 0.28, releaseStart = 0.72) {
  const p = clamp01(progress);
  const attack = Math.max(0.001, Math.min(attackEnd, 0.999));
  const release = Math.max(attack, Math.min(releaseStart, 0.999));
  if (p <= 0 || p >= 1) return 0;
  if (p < attack) return smootherstep(p / attack);
  if (p <= release) return 1;
  return smootherstep((1 - p) / (1 - release));
}

function mixPose(a, b, t) {
  const u = clamp01(t);
  const out = {};
  for (const key of new Set([...Object.keys(a || {}), ...Object.keys(b || {})])) {
    out[key] = (a[key] || 0) * (1 - u) + (b[key] || 0) * u;
  }
  return out;
}

export function sampleIdleMotion(seconds) {
  const t = Number(seconds) || 0;
  const breath = Math.sin(t * 1.72) * 0.012;
  const weightShift = Math.sin(t * 0.61 + 0.45);
  return {
    breath,
    centerY: Math.sin(t * 1.72 - 0.35) * 0.026,
    bodyX: weightShift * 0.018,
    bodyZ: weightShift * 0.028 + Math.sin(t * 1.13) * 0.009,
    headX: Math.sin(t * 0.49 + 0.35) * 0.018,
    headY: Math.sin(t * 0.43 + 0.8) * 0.055 + Math.sin(t * 0.91) * 0.012,
    headZ: -weightShift * 0.024 + Math.sin(t * 0.31 + 1.1) * 0.009,
    armR: Math.sin(t * 0.82 + 0.3) * 0.075 + Math.sin(t * 0.37) * 0.018,
    armL: -Math.sin(t * 0.82 + 0.3) * 0.062 + Math.sin(t * 0.53 + 1.2) * 0.023,
  };
}

// ---------------------------------------------------------------------------
// 张臂转圈：反向扭身蓄势 → 张臂起转 → 空中旋转（收一条腿）→ 落地下蹲卸力 → 收臂回正
// 旋转靠手臂张开起势、靠落地屈膝收势，中间是匀速偏减速的转动。
// ---------------------------------------------------------------------------

export function sampleSpinMotion(progress) {
  const p = clamp01(progress);
  const prepEnd = 0.12;
  const airEnd = 0.76;
  const settleEnd = 0.9;

  if (p <= prepEnd) {
    // 预备：身体先朝反方向拧一点，重心下沉，手臂收在身侧
    const prep = smootherstep(p / prepEnd);
    return {
      turns: -0.055 * prep,
      centerY: plantedCenterY(0.07 * prep, -0.12 * prep, 0, 0),
      bodyX: 0.05 * prep,
      bodyZ: -0.04 * prep,
      armOpen: 0.12 * prep,
      legR: 0.07 * prep,
      legRZ: -0.03 * prep,
      kneeR: -0.12 * prep,
      footR: 0.03 * prep,
      legL: 0,
      kneeL: 0,
      footL: 0,
    };
  }

  if (p < airEnd) {
    const travel = (p - prepEnd) / (airEnd - prepEnd);
    const arc = Math.sin(travel * Math.PI);
    // 起转靠躯干回弹带一点初速度，之后按正弦收速，停的时候不会硬刹
    const turnEase = 0.15 * travel + 0.85 * easeInOutSine(travel);
    const liftR = 0.52 * arc;
    const liftL = -0.07 * arc;
    return {
      turns: -0.055 + 1.055 * turnEase,
      // 支撑腿（左腿几乎伸直）决定身体高度，抬起的右腿自然离地
      centerY: plantedCenterY(liftR, -0.95 * arc, liftL, -0.12 * arc) + 1.05 * arc,
      bodyX: 0.08 * arc * Math.cos(travel * Math.PI * 2),
      bodyZ: -0.085 * arc,
      // 手臂在起转阶段就完全张开（产生角动量），落地前才开始收
      armOpen: Math.min(1, smootherstep(travel / 0.3)),
      legR: 0.52 * arc,
      legRZ: -0.26 * arc,
      kneeR: -0.95 * arc,
      footR: 0.18 * arc,
      legL: -0.07 * arc,
      kneeL: -0.12 * arc,
      footL: 0.05 * arc,
    };
  }

  if (p < settleEnd) {
    // 接地：重心继续下沉到最低点，抬起的腿放下并屈膝吸收冲击
    const u = (p - airEnd) / (settleEnd - airEnd);
    const drop = easeOutCubic(u);
    // 双腿对称屈膝，脚才会一起踩到地上；一腿弯一腿直会变成单腿站立
    const bend = -0.52 * drop;
    const swing = 0.06 * Math.sin(Math.PI * u);
    return {
      turns: 1,
      centerY: groundedCenterY(swing, bend),
      bodyX: 0.05 * Math.sin(Math.PI * u),
      bodyZ: 0.03 * drop,
      // 接地的瞬间手臂还在张开，落地过程中自然垂下收拢
      armOpen: 1 - smootherstep(u),
      // 接地的腿先向前探一点再收回站直，避免"腿凭空消失"
      legR: swing,
      legRZ: -0.05 * Math.sin(Math.PI * u),
      kneeR: bend,
      footR: 0.05 * Math.sin(Math.PI * u),
      legL: swing,
      kneeL: bend,
      footL: 0,
    };
  }

  // 站直回正
  const u = (p - settleEnd) / (1 - settleEnd);
  const rise = smootherstep(u);
  const bend = -0.52 * (1 - rise);
  return {
    turns: 1,
    centerY: groundedCenterY(0, bend),
    bodyX: 0,
    bodyZ: 0.03 * (1 - rise),
    armOpen: 0,
    legR: 0,
    legRZ: 0,
    kneeR: bend,
    footR: 0,
    legL: 0,
    kneeL: bend,
    footL: 0,
  };
}

// ---------------------------------------------------------------------------
// 害羞摸脸：抬手走弧线 → 迟疑一下 → 轻抚（手在动、头保持）→ 手先撤 → 头再回
// 手和头不同步是"活"的关键：手走完一半头才开始偏，手已经撤了头还停在原地。
// ---------------------------------------------------------------------------

export function sampleTouchFaceMotion(progress) {
  const p = clamp01(progress);
  const weight = phaseEnvelope(p, 0.26, 0.7);
  // 手的权重（领先）：起落都比头早
  const handLead = phaseEnvelope(p, 0.24, 0.72);
  // 头的权重（滞后）：起得晚、收得晚
  const headLag = phaseEnvelope(Math.max(0, (p - 0.06) / 0.94), 0.3, 0.62);

  if (weight === 0 && handLead === 0 && headLag === 0) {
    return { weight: 0, targetXOffset: 0, targetYOffset: 0, headX: 0, headY: 0, headZ: 0, bodyX: 0, bodyZ: 0 };
  }

  const approach = Math.sin(Math.min(1, p / 0.26) * Math.PI);
  // 轻抚：主频 + 呼吸频叠加，避免机械的单频正弦
  const caressT = Math.max(0, Math.min(1, (p - 0.3) / 0.42));
  const caress = caressT > 0 && caressT < 1 ? Math.sin(caressT * Math.PI * 2) * 0.045 : 0;
  const breath = Math.sin(p * Math.PI * 5) * 0.012;
  // 抬手中段一次极轻的迟疑（害羞会先缩一下再贴上）
  const hesitate = Math.sin(Math.min(1, Math.max(0, (p - 0.2) / 0.1)) * Math.PI) * -0.05;

  return {
    weight: handLead,
    targetXOffset: -0.12 * approach * handLead + hesitate * handLead,
    targetYOffset: (0.07 + caress + breath) * handLead,
    headX: 0.03 * headLag,
    headY: 0.05 * headLag,
    headZ: -0.08 * headLag,
    bodyX: 0.012 * headLag,
    bodyZ: -0.028 * headLag,
  };
}

// ---------------------------------------------------------------------------
// 跺脚：重心移到支撑腿 → 抬腿蓄势 → 重力加速下踩 → 触地冲击 + 余震 → 回正
// ---------------------------------------------------------------------------

const stompRestPose = () => ({
  centerX: 0,
  centerY: 0,
  bodyX: 0,
  bodyZ: 0,
  headX: 0,
  headZ: 0,
  upperY: 0,
  lowerY: 0,
  legR: 0,
  legL: 0,
  legRZ: 0,
  legLZ: 0,
  legRX: 0,
  legRY: 0,
  legLX: 0,
  legLY: 0,
  kneeR: 0,
  kneeL: 0,
  ankleR: 0,
  ankleL: 0,
  footR: 0,
  footL: 0,
  armR: 0,
  armL: 0,
  impact: 0,
});

export function sampleStompMotion(progress) {
  const p = clamp01(progress);
  if (p <= 0 || p >= 1) return stompRestPose();

  const rest = stompRestPose();
  // A 抬腿：重心先挪到支撑腿上，抬起的膝盖收在身前
  const raised = {
    centerX: -0.075,

    bodyX: 0.045,
    bodyZ: -0.055,
    headX: -0.02,
    headZ: 0.025,
    upperY: 0.045,
    lowerY: -0.05,
    // Positive hip X lifts the thigh forward; bent knee keeps the foot under
    // the skirt. Do not translate D-bones — that detaches the visible foot.
    legR: 0.55,
    legL: 0.05,
    legRZ: -0.07,
    legLZ: 0.03,
    legRX: 0,
    legRY: 0,
    legLX: 0,
    legLY: 0,
    kneeR: -1.1,
    kneeL: 0.05,
    ankleR: 0.2,
    ankleL: 0,
    footR: 0.24,
    footL: 0.02,
    armR: 0.34,
    armL: -0.28,
    impact: 0,
  };
  // C 下踩到底：腿已经伸出去，脚掌朝下准备拍地
  const strike = {
    centerX: -0.02,

    bodyX: 0.02,
    bodyZ: -0.02,
    headX: 0.01,
    headZ: 0.01,
    upperY: 0.02,
    lowerY: -0.02,
    legR: 0.05,
    legL: 0.02,
    legRZ: -0.02,
    legLZ: 0.01,
    legRX: 0,
    legRY: 0,
    legLX: 0,
    legLY: 0,
    kneeR: -0.12,
    kneeL: 0.03,
    ankleR: 0.06,
    ankleL: 0,
    footR: -0.12,
    footL: 0.01,
    armR: 0.16,
    armL: -0.2,
    impact: 0,
  };
  // D 触地：身体被压下去，支撑腿弯曲，冲击沿着躯干传到头上
  const planted = {
    centerX: 0.045,

    bodyX: -0.05,
    bodyZ: 0.045,
    headX: 0.05,
    headZ: -0.03,
    upperY: -0.035,
    lowerY: 0.035,
    legR: 0.04,
    legL: -0.02,
    legRZ: 0.02,
    legLZ: -0.01,
    legRX: 0,
    legRY: 0,
    legLX: 0,
    legLY: 0,
    // 双腿对称屈膝吸收冲击——靠膝盖弯而不是把中心往地里压
    kneeR: -0.38,
    kneeL: -0.38,
    ankleR: 0.05,
    ankleL: 0,
    footR: 0.08,
    footL: -0.02,
    armR: -0.15,
    armL: 0.13,
    impact: 0,
  };
  // E 余震回弹：身体弹起来一点再落回站姿
  const recoil = {
    centerX: -0.015,

    bodyX: -0.02,
    bodyZ: 0.018,
    headX: 0.015,
    headZ: -0.012,
    upperY: -0.012,
    lowerY: 0.012,
    legR: 0.02,
    legL: 0,
    legRZ: 0.01,
    legLZ: 0,
    legRX: 0,
    legRY: 0,
    legLX: 0,
    legLY: 0,
    kneeR: -0.03,
    kneeL: -0.05,
    ankleR: 0.02,
    ankleL: 0,
    footR: 0.03,
    footL: 0,
    armR: -0.06,
    armL: 0.05,
    impact: 0,
  };

  let pose;
  if (p < 0.28) pose = mixPose(rest, raised, smootherstep(p / 0.28));
  else if (p < 0.34) pose = { ...raised };
  else if (p < 0.44) pose = mixPose(raised, strike, easeInCubic((p - 0.34) / 0.1));
  else if (p < 0.62) pose = mixPose(strike, planted, easeOutCubic((p - 0.44) / 0.18));
  else if (p < 0.78) pose = mixPose(planted, recoil, smootherstep((p - 0.62) / 0.16));
  else pose = mixPose(recoil, rest, smootherstep((p - 0.78) / 0.22));

  // 重心由支撑腿的几何决定，抬起的右腿自然离地
  pose.centerY = plantedCenterY(pose.legR, pose.kneeR, pose.legL, pose.kneeL);
  // 冲击：触地那一瞬最强，随后一次反向余震。只用于头和上半身的抖动，
  // 下蹲吸收已经由膝盖弯曲承担，不再额外把重心往地里压（否则脚会穿地）
  pose.impact = gauss(p, 0.44, 0.045) - 0.28 * gauss(p, 0.54, 0.05);
  pose.headX += 0.05 * pose.impact;
  pose.upperY -= 0.03 * pose.impact;
  return pose;
}

// ---------------------------------------------------------------------------
// 走动：标准步态周期
//   支撑期 = 脚跟着地 → 承重 → 蹬离（腿从最前走到最后）
//   摆动期 = 折叠前摆 → 伸直到脚跟着地（腿从最后走到最前）
// 关键是被忽略的三件事：支撑腿落地会弯一下再蹬直、摆动腿脚尖要上翘、
// 重心在双腿支撑时最低、单腿支撑时最高，并且始终偏向支撑腿那一侧。
// ---------------------------------------------------------------------------

export const WALK_STEP_RATE = 2.2; // 步/秒

// 右膝：u = 0 摆动中期（最大屈曲）→ 0.25 脚跟着地 → 0.5 单腿支撑中期 → 0.75 蹬离 → 回到 0
// 摆动期屈曲收到 0.78/0.75，避免脚后跟抬得过高从裙摆下方穿出。
const KNEE_CURVE = makeCurve([
  [0.0, 0.78],
  [0.25, 0.09],
  [0.35, 0.3],
  [0.5, 0.07],
  [0.65, 0.05],
  [0.75, 0.35],
  [0.9, 0.75],
]);

// 右踝：负 = 脚尖上翘（背屈），正 = 脚掌下踩（跖屈）
const ANKLE_CURVE = makeCurve([
  [0.0, -0.18],
  [0.18, -0.06],
  [0.25, -0.1],
  [0.33, 0.06],
  [0.5, 0.0],
  [0.65, 0.16],
  [0.75, 0.34],
  [0.84, -0.04],
  [0.92, -0.16],
]);

export function sampleWalkMotion(seconds, strength = 1) {
  const amount = clamp01(strength);
  const phase = (Number(seconds) || 0) * Math.PI * WALK_STEP_RATE;
  const step = Math.sin(phase);
  const u = (((phase / (Math.PI * 2)) % 1) + 1) % 1;
  const kneeR = -KNEE_CURVE(u) * amount;
  const kneeL = -KNEE_CURVE((u + 0.5) % 1) * amount;
  const footR = ANKLE_CURVE(u) * amount;
  const footL = ANKLE_CURVE((u + 0.5) % 1) * amount;
  // 髋：前摆幅度略大于后摆，所以叠加一个二次项。
  // 幅度收到 ±0.44/±0.36（约 25°/21°）——过大时大腿会从裙摆正面穿出来。
  const hipR = (0.4 * step + 0.04 * step * step) * amount;
  const hipL = (-0.4 * step + 0.04 * step * step) * amount;
  return {
    // 重心始终偏向支撑腿：右腿支撑在 phase=π，所以取 -cos
    centerX: -Math.cos(phase) * 0.03 * amount,
    // 双腿支撑时最低，单腿支撑（phase=0/π）时最高
    centerY: Math.abs(Math.cos(phase)) * 0.032 * amount,
    bodyX: (-0.048 + Math.cos(phase) * 0.02) * amount,
    bodyZ: step * 0.035 * amount,
    // 肩带与骨盆反向旋转，且肩带慢半拍
    upperY: -Math.sin(phase - 0.3) * 0.12 * amount,
    lowerY: Math.sin(phase) * 0.09 * amount,
    // 头部反向补偿，走路时视线不该跟着身体一起晃
    headX: -Math.sin(phase + 0.5) * 0.02 * amount,
    headY: -Math.sin(phase - 0.4) * 0.022 * amount,
    legR: hipR,
    legL: hipL,
    legRZ: -step * 0.03 * amount,
    legLZ: step * 0.03 * amount,
    legRX: 0,
    legRY: 0,
    legLX: 0,
    legLY: 0,
    kneeR,
    kneeL,
    ankleR: 0,
    ankleL: 0,
    footR,
    footL,
    // 手臂与腿反相，且前摆幅度大于后摆（真人前屈比后伸大）；前摆时肘部收得更紧
    armR: (-0.34 * step + 0.05 * step * step) * amount,
    armL: (0.34 * step + 0.05 * step * step) * amount,
    elbowR: (0.2 - 0.16 * step) * amount,
    elbowL: (0.2 + 0.16 * step) * amount,
  };
}
