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

// 离散动作互斥，走路与任何离散动作互斥。
// requested 用仲裁键（spin / gesture / stomp / action / walk），
// jump、dance 这类身体动作统一归到 action。
const DISCRETE_ACTIONS = ["spin", "gesture", "stomp", "action"];

export function canStartAction(active, requested) {
  const state = active || {};
  const key = requested === "jump" || requested === "dance" ? "action" : requested;
  if (key !== "walk" && !DISCRETE_ACTIONS.includes(key)) return false;
  if (state.walk) return false;
  return !DISCRETE_ACTIONS.some((name) => Boolean(state[name]));
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

// ===========================================================================
// 第二批动作：手势类（IK 目标偏移）+ 身体类（沿用跺脚通道词汇）
// 所有曲线在 p=0 与 p=1 必须精确归零，动作之间才不会跳变。
// ===========================================================================

const gestureRestPose = () => ({
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

// ---------------------------------------------------------------------------
// 招手：抬手走弧线 → 手举稳后左右摆 → 手先收回、头再回正
// 挥手时肩膀几乎不动、只有手在摆，读起来才像"打招呼"而不是"抡胳膊"。
// ---------------------------------------------------------------------------

export function sampleWaveMotion(progress) {
  const p = clamp01(progress);
  if (p <= 0 || p >= 1) return gestureRestPose();

  // 抬手/放手各占四分之一，中间是挥手停留段
  const raise = smootherstep(clamp01(p / 0.26));
  const lower = smootherstep(clamp01((1 - p) / 0.3));
  const lift = Math.min(raise, lower);
  // 抬手先往外下方走一段弧线，手不会沿着直线"弹"到目标点
  const arc = Math.sin(clamp01(lift) * Math.PI);
  const hold = phaseEnvelope(p, 0.34, 0.64);
  const swingPhase = ((p - 0.26) / 0.48) * Math.PI * 2 * 2.2;
  const swing = Math.sin(swingPhase);
  const tilt = Math.sin(swingPhase * 0.5);

  return {
    weight: lift,
    // 抬手的肩膀会跟着耸起来，大臂才不是一条僵住的直线
    shoulderR: 0.16 * lift + 0.03 * Math.abs(swing) * hold,
    shoulderL: 0,
    targetXOffset: -0.12 * arc + swing * 0.26 * hold,
    targetYOffset: -0.3 * arc + 0.05 * Math.abs(swing) * hold,
    targetZOffset: -0.12 * arc + 0.04 * lift,
    targetXOffsetL: 0,
    targetYOffsetL: 0,
    targetZOffsetL: 0,
    // 头比手慢半拍：手摆到中段头才跟着偏
    headX: 0.02 * lift,
    headY: 0.05 * lift + 0.02 * tilt * hold,
    headZ: -0.07 * lift - 0.02 * swing * hold,
    bodyX: -0.012 * lift,
    bodyZ: 0.03 * tilt * lift,
    upperY: 0.04 * tilt * lift,
  };
}

// ---------------------------------------------------------------------------
// 伸懒腰：双手举过头顶 → 后仰含胸、肩胛打开 → 停留 → 收回
// 拉伸的主导是"上身后仰 + 手往上够"，不是把手举高而已。
// ---------------------------------------------------------------------------

// 已下线（2026-11：主人觉得不自然，未在 actions.mjs 注册，菜单里不出现）。
// 想恢复：把 GESTURES / GESTURE_TARGETS / ACTIONS 里对应的条目加回去即可。
export function sampleStretchMotion(progress) {
  const p = clamp01(progress);
  if (p <= 0 || p >= 1) return gestureRestPose();

  const raise = smootherstep(clamp01(p / 0.3));
  const lower = smootherstep(clamp01((1 - p) / 0.32));
  const lift = Math.min(raise, lower);
  // 拉伸脉冲：手张开到位后再往前上方"够"一下，然后慢慢收回
  const reach =
    smootherstep(clamp01((p - 0.28) / 0.24)) * smootherstep(clamp01((0.86 - p) / 0.26));
  const breath = Math.sin((p - 0.2) * Math.PI * 2 * 1.1);

  return {
    weight: lift,
    shoulderR: 0.15 * lift,
    shoulderL: 0.15 * lift,
    targetXOffset: -0.14 * reach + 0.04 * breath * reach,
    targetYOffset: 0.34 * reach + 0.04 * breath * reach,
    targetZOffset: 0.12 * reach,
    targetXOffsetL: 0.14 * reach - 0.04 * breath * reach,
    targetYOffsetL: 0.34 * reach + 0.04 * breath * reach,
    targetZOffsetL: 0.12 * reach,
    headX: -0.16 * lift,
    headY: 0.015 * breath * reach,
    headZ: 0.02 * breath * reach,
    bodyX: -0.14 * lift,
    bodyZ: 0.015 * breath * reach,
    upperY: 0.05 * breath * reach,
  };
}

// ---------------------------------------------------------------------------
// 拍手鼓掌：双手收到胸前中线，按节拍开合三次
// ---------------------------------------------------------------------------

// 已下线（2026-11：主人觉得不自然，未在 actions.mjs 注册，菜单里不出现）。
// 想恢复：把 GESTURES / GESTURE_TARGETS / ACTIONS 里的条目加回去即可。
export function sampleClapMotion(progress) {
  const p = clamp01(progress);
  if (p <= 0 || p >= 1) return gestureRestPose();

  const raise = smootherstep(clamp01(p / 0.2));
  const lower = smootherstep(clamp01((1 - p) / 0.22));
  const lift = Math.min(raise, lower);
  // 三次清楚的拍手：0 分开、1 合掌
  const beat = Math.sin(clamp01((p - 0.2) / 0.58) * Math.PI * 2 * 3);
  const close = Math.max(0, beat);
  // 合掌收到 ±0.35（两只手腕相隔 0.7），指尖不会插到一起
  const meet = 0.5 * lift * (0.1 + 0.9 * close);

  return {
    weight: lift,
    shoulderR: 0.05 * lift,
    shoulderL: 0.05 * lift,
    targetXOffset: meet,
    targetYOffset: 0.06 * lift + 0.04 * close * lift,
    targetZOffset: 0.04 * lift,
    targetXOffsetL: -meet,
    targetYOffsetL: 0.06 * lift + 0.04 * close * lift,
    targetZOffsetL: 0.04 * lift,
    headX: 0.035 * close * lift,
    headY: 0.012 * close * lift,
    headZ: -0.02 * lift,
    bodyX: 0.015 * lift,
    bodyZ: 0,
    upperY: 0,
  };
}

// ---------------------------------------------------------------------------
// 比心：双手抬到下巴前合拢成心形，轻轻往前送一下
// ---------------------------------------------------------------------------

// 已下线：手指在 IK 下无法控制腕部朝向，两只手做不出"指尖相碰"的心形。恢复方式同上。
export function sampleHeartMotion(progress) {
  const p = clamp01(progress);
  if (p <= 0 || p >= 1) return gestureRestPose();

  const raise = smootherstep(clamp01(p / 0.28));
  const lower = smootherstep(clamp01((1 - p) / 0.3));
  const lift = Math.min(raise, lower);
  // 先合拢，再整体往前送一下（心形的"递出去"）
  const gather = smootherstep(clamp01((p - 0.18) / 0.3));
  const pulse = Math.sin(clamp01((p - 0.34) / 0.36) * Math.PI);

  return {
    weight: lift,
    shoulderR: 0.06 * lift,
    shoulderL: 0.06 * lift,
    targetXOffset: 0.1 * lift * gather + 0.03 * pulse,
    targetYOffset: 0.05 * lift + 0.03 * pulse,
    targetZOffset: 0.06 * lift + 0.06 * pulse,
    targetXOffsetL: -0.1 * lift * gather - 0.03 * pulse,
    targetYOffsetL: 0.05 * lift + 0.03 * pulse,
    targetZOffsetL: 0.06 * lift + 0.06 * pulse,
    headX: 0.015 * lift,
    headY: 0.04 * lift,
    headZ: -0.09 * lift,
    bodyX: 0.008 * lift,
    bodyZ: 0.025 * Math.sin(p * Math.PI * 2) * lift,
    upperY: 0,
  };
}

// ---------------------------------------------------------------------------
// 鞠躬（身体类）：上身折下去、头跟着低、膝盖轻点一下再起身。
// 手不做 IK——手臂本来就挂在躯干下面，弯腰时会自然跟下去，不会插进裙子。
// ---------------------------------------------------------------------------

export function sampleBowMotion(progress) {
  const p = clamp01(progress);
  const rest = bodyRestPose();
  if (p <= 0 || p >= 1) return rest;

  // 0.26 折下去，中间停住，最后 0.34 起身（起身比弯腰慢一点，像在致意）
  const down = smootherstep(clamp01(p / 0.26));
  const up = smootherstep(clamp01((1 - p) / 0.34));
  const bend = Math.min(down, up);
  // 停住的时候不是死帧，留一点呼吸
  const settle = Math.sin(clamp01((p - 0.26) / 0.4) * Math.PI) * 0.012;

  const pose = {
    ...rest,
    bodyX: 0.34 * bend + settle,
    headX: 0.13 * bend,
    upperY: -0.02 * bend,
    legR: 0.05 * bend,
    legL: 0.05 * bend,
    kneeR: -0.16 * bend,
    kneeL: -0.16 * bend,
    footR: 0.05 * bend,
    footL: 0.05 * bend,
    armR: -0.14 * bend,
    armL: -0.14 * bend,
    elbowR: 0.2 * bend,
    elbowL: 0.2 * bend,
  };
  pose.centerY = plantedCenterY(pose.legR, pose.kneeR, pose.legL, pose.kneeL);
  return pose;
}

// ---------------------------------------------------------------------------
// 点头答应：两下点头，身体跟着轻轻一沉（屈膝而不是把重心往地里压）
// ---------------------------------------------------------------------------

export function sampleNodMotion(progress) {
  const p = clamp01(progress);
  const rest = bodyRestPose();
  if (p <= 0 || p >= 1) return rest;

  const env = phaseEnvelope(p, 0.14, 0.86);
  const beat = Math.max(0, Math.sin(clamp01((p - 0.14) / 0.72) * Math.PI * 2 * 2));
  const pose = { ...rest };
  pose.headX = 0.3 * beat * env;
  pose.headZ = -0.015 * env;
  pose.bodyX = 0.04 * beat * env;
  pose.upperY = 0.02 * beat * env;
  pose.legR = 0.04 * beat * env;
  pose.legL = 0.04 * beat * env;
  pose.kneeR = -0.07 * beat * env;
  pose.kneeL = -0.07 * beat * env;
  pose.footR = 0.025 * beat * env;
  pose.footL = 0.025 * beat * env;
  pose.centerY = plantedCenterY(pose.legR, pose.kneeR, pose.legL, pose.kneeL);
  return pose;
}

// ---------------------------------------------------------------------------
// 摇头拒绝：左右摆头，肩带反向带一点
// ---------------------------------------------------------------------------

export function sampleShakeMotion(progress) {
  const p = clamp01(progress);
  const rest = bodyRestPose();
  if (p <= 0 || p >= 1) return rest;

  const env = phaseEnvelope(p, 0.12, 0.88);
  const beat = Math.sin(clamp01((p - 0.12) / 0.76) * Math.PI * 2 * 2.6);
  const pose = { ...rest };
  pose.headY = 0.34 * beat * env;
  pose.headZ = -0.05 * beat * env;
  pose.upperY = -0.09 * beat * env;
  pose.bodyZ = -0.04 * beat * env;
  pose.armZR = -0.1 * env;
  pose.armZL = 0.1 * env;
  return pose;
}

// ---------------------------------------------------------------------------
// 歪头卖萌：头慢慢歪到位，肩一耸、重心偏一点，停一会儿再回正
// ---------------------------------------------------------------------------

export function sampleTiltMotion(progress) {
  const p = clamp01(progress);
  const rest = bodyRestPose();
  if (p <= 0 || p >= 1) return rest;

  const env = phaseEnvelope(p, 0.22, 0.78);
  const drift = Math.sin(p * Math.PI * 2 * 0.8);
  const pose = { ...rest };
  pose.headZ = 0.24 * env;
  pose.headY = 0.07 * env + 0.02 * drift * env;
  pose.headX = 0.02 * env;
  pose.shoulderR = 0.07 * env;
  pose.shoulderL = 0.03 * env;
  pose.bodyZ = 0.05 * env;
  pose.centerX = 0.03 * env;
  pose.upperY = 0.03 * env;
  return pose;
}

// ---------------------------------------------------------------------------
// 身体类动作通道表：与 stompRestPose() 同名词汇，多出 air / armZR / armZL /
// armOpen（air 只参与 centerY 计算，不直接驱动骨骼）。
// ---------------------------------------------------------------------------

export const bodyRestPose = () => ({
  centerX: 0,
  centerY: 0,
  air: 0,
  bodyX: 0,
  bodyZ: 0,
  headX: 0,
  headY: 0,
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
  armZR: 0,
  armZL: 0,
  elbowR: 0,
  elbowL: 0,
  armOpen: 0,
  shoulderR: 0,
  shoulderL: 0,
  // 双手 IK 接管权重（0 = 纯手臂欧拉角，1 = 完全按手部目标点解算）
  handW: 0,
  handDX: 0,
  handDXL: 0,
  handDY: 0,
  handDZ: 0,
  impact: 0,
});

// ---------------------------------------------------------------------------
// 原地跳：下蹲蓄力 → 蹬地起跳 → 空中收腿 → 落地屈膝卸力 → 起身回正
// 起跳前手臂先往后摆、腾空时张开，落地时手臂往前压，重心才像被抛起来。
// ---------------------------------------------------------------------------

// 已下线：主人觉得大臂僵硬。恢复方式同上（记得同时恢复 BODY_HANDS.jump）。
export function sampleJumpMotion(progress) {
  const p = clamp01(progress);
  const rest = bodyRestPose();
  if (p <= 0 || p >= 1) return rest;

  const crouch = {
    ...rest,
    bodyX: 0.2,
    headX: -0.05,
    legR: 0.32,
    legL: 0.32,
    kneeR: -0.92,
    kneeL: -0.92,
    footR: 0.3,
    footL: 0.3,
    armR: -0.34,
    armL: -0.34,
    armZR: 0.12,
    armZL: -0.12,
    elbowR: 0.3,
    elbowL: 0.3,
  };
  const launch = {
    ...rest,
    bodyX: -0.08,
    headX: -0.03,
    legR: 0.04,
    legL: 0.04,
    kneeR: -0.06,
    kneeL: -0.06,
    footR: 0.3,
    footL: 0.3,
    elbowR: 0.5,
    elbowL: 0.5,
    handW: 0.4,
    handDY: 0.05,
    shoulderR: 0.08,
    shoulderL: 0.08,
    air: 0.08,
  };
  const apex = {
    ...rest,
    bodyX: -0.05,
    headX: 0.03,
    legR: 0.45,
    legL: 0.45,
    kneeR: -1.05,
    kneeL: -1.05,
    footR: 0.32,
    footL: 0.32,
    handW: 1,
    handDY: 0.45,
    handDZ: -0.08,
    shoulderR: 0.18,
    shoulderL: 0.18,
    air: 1.25,
  };
  const fall = {
    ...rest,
    bodyX: 0.02,
    headX: 0.05,
    legR: 0.16,
    legL: 0.16,
    kneeR: -0.26,
    kneeL: -0.26,
    footR: -0.04,
    footL: -0.04,
    elbowR: 0.35,
    elbowL: 0.35,
    handW: 0.5,
    handDY: 0.2,
    air: 0.1,
  };
  const land = {
    ...rest,
    bodyX: 0.18,
    headX: 0.1,
    legR: 0.3,
    legL: 0.3,
    kneeR: -0.78,
    kneeL: -0.78,
    footR: 0.2,
    footL: 0.2,
    armR: -0.22,
    armL: -0.22,
    elbowR: 0.5,
    elbowL: 0.5,
    armOpen: 0.12,
  };

  let pose;
  if (p < 0.16) pose = mixPose(rest, crouch, smootherstep(p / 0.16));
  else if (p < 0.2) pose = { ...crouch };
  else if (p < 0.28) pose = mixPose(crouch, launch, easeInCubic((p - 0.2) / 0.08));
  else if (p < 0.4) pose = mixPose(launch, apex, easeOutCubic((p - 0.28) / 0.12));
  else if (p < 0.6) pose = mixPose(apex, fall, easeInCubic((p - 0.4) / 0.2));
  else if (p < 0.72) pose = mixPose(fall, land, easeOutCubic((p - 0.6) / 0.12));
  else pose = mixPose(land, rest, smootherstep((p - 0.72) / 0.28));

  // 重心 = 腿部几何决定的高度 + 腾空高度；落地屈膝时自然沉下去
  pose.centerY = plantedCenterY(pose.legR, pose.kneeR, pose.legL, pose.kneeL) + pose.air;
  pose.impact = gauss(p, 0.665, 0.03);
  pose.headX += 0.07 * pose.impact;
  pose.upperY -= 0.045 * pose.impact;
  return pose;
}

// ---------------------------------------------------------------------------
// 摇摆舞步：重心左右倒替，抬起的膝盖跟着节拍屈伸，手臂一上一下
// 用相位包络把周期动作收在 0/1 两端，所以它和离散动作之间不会跳变。
// ---------------------------------------------------------------------------

export function sampleDanceMotion(progress) {
  const p = clamp01(progress);
  const rest = bodyRestPose();
  if (p <= 0 || p >= 1) return rest;

  const w = phaseEnvelope(p, 0.12, 0.86);
  const beat = p * Math.PI * 2 * 3.4;
  const sway = Math.sin(beat);
  const supportR = Math.max(0, sway);
  const supportL = Math.max(0, -sway);

  const legR = (0.05 + 0.14 * supportL) * w;
  const legL = (0.05 + 0.14 * supportR) * w;
  const kneeR = -(0.12 + 0.34 * supportL) * w;
  const kneeL = -(0.12 + 0.34 * supportR) * w;

  const pose = {
    ...rest,
    centerX: sway * 0.12 * w,
    bodyX: Math.sin(beat * 2) * 0.03 * w,
    bodyZ: -sway * 0.1 * w,
    headX: Math.sin(beat * 2 + 0.6) * 0.035 * w,
    headY: sway * 0.1 * w,
    headZ: -sway * 0.05 * w,
    upperY: -sway * 0.12 * w,
    lowerY: sway * 0.08 * w,
    legR,
    legL,
    kneeR,
    kneeL,
    legRZ: -sway * 0.04 * w,
    legLZ: -sway * 0.04 * w,
    footR: (0.1 + 0.14 * supportL) * w,
    footL: (0.1 + 0.14 * supportR) * w,
    // 双手叉腰（手位交给 IK），胯部跟着节拍左右顶
    handW: w,
    handDY: 0.03 * Math.sin(beat * 2) * w,
    handDZ: 0.02 * Math.sin(beat * 2 + 1) * w,
  };
  pose.centerY = plantedCenterY(legR, kneeR, legL, kneeL) + Math.abs(sway) * 0.05 * w;
  return pose;
}

