import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const motion = readFileSync(join(root, "renderer", "motion.mjs"), "utf8");

const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<title>塔菲动作预览（侧视火柴人）</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0; background: #0e1117; color: #e6edf3;
    font: 14px/1.6 "Segoe UI", "Microsoft YaHei", sans-serif;
    display: flex; gap: 18px; padding: 18px; min-height: 100vh;
  }
  .stage { background: #131820; border: 1px solid #232c3b; border-radius: 12px; padding: 8px; }
  canvas { display: block; border-radius: 8px; }
  .panel { width: 320px; display: flex; flex-direction: column; gap: 14px; }
  h1 { font-size: 17px; margin: 0 0 2px; }
  .hint { color: #8b98a9; font-size: 12px; margin: 0 0 4px; }
  .group { background: #131820; border: 1px solid #232c3b; border-radius: 12px; padding: 12px; }
  .group h2 { font-size: 12px; letter-spacing: .08em; color: #8b98a9; margin: 0 0 8px; text-transform: uppercase; }
  .btns { display: flex; flex-wrap: wrap; gap: 6px; }
  button {
    background: #1d2735; color: #e6edf3; border: 1px solid #2b3646;
    border-radius: 7px; padding: 6px 11px; cursor: pointer; font: inherit; font-size: 13px;
  }
  button:hover { background: #263248; }
  button.on { background: #2f6feb; border-color: #2f6feb; }
  label { display: flex; align-items: center; gap: 8px; font-size: 13px; }
  input[type=range] { flex: 1; accent-color: #2f6feb; }
  .readout { font: 12px/1.7 ui-monospace, Consolas, monospace; color: #9fb0c6; white-space: pre; }
  .readout b { color: #e6edf3; font-weight: 600; }
  .legend { display: flex; gap: 14px; font-size: 12px; color: #8b98a9; margin-top: 6px; }
  .dot { display: inline-block; width: 9px; height: 9px; border-radius: 50%; margin-right: 5px; vertical-align: 1px; }
</style>
</head>
<body>
  <div class="stage"><canvas id="cv" width="440" height="430"></canvas>
    <div class="legend">
      <span><i class="dot" style="background:#5aa9ff"></i>新曲线</span>
      <span><i class="dot" style="background:#5d6b7f"></i>旧曲线（虚线）</span>
      <span><i class="dot" style="background:#f0a13c"></i>重心投影</span>
    </div>
  </div>
  <div class="panel">
    <div>
      <h1>塔菲动作预览</h1>
      <p class="hint">侧视图按真实骨骼角度驱动：髋 → 膝 → 踝，肩 → 肘。虚线是改之前的动作，用来对照。</p>
    </div>
    <div class="group">
      <h2>动作</h2>
      <div class="btns" id="actions"></div>
    </div>
    <div class="group">
      <h2>播放</h2>
      <label><input type="range" id="seek" min="0" max="1000" value="0" /><span id="seekVal">0%</span></label>
      <div class="btns" style="margin-top:8px">
        <button id="play">暂停</button>
        <button data-speed="0.25">0.25x</button>
        <button data-speed="0.5">0.5x</button>
        <button data-speed="1" class="on">1x</button>
      </div>
      <label style="margin-top:8px"><input type="checkbox" id="ghost" checked /> 显示旧动作对照</label>
      <label><input type="checkbox" id="floor" checked /> 显示地面与重心</label>
    </div>
    <div class="group">
      <h2>通道数值</h2>
      <div class="readout" id="readout"></div>
    </div>
  </div>

<script type="module">
${motion}

const ACTIONS = [
  { id: "spin",   label: "张臂转圈", ms: 1440, sample: (p) => sampleSpinMotion(p) },
  { id: "stomp",  label: "跺脚",     ms: 1000, sample: (p) => sampleStompMotion(p) },
  { id: "touch",  label: "害羞摸脸", ms: 3600, sample: (p) => sampleTouchFaceMotion(p) },
  { id: "walk",   label: "走动",     ms: 4000, cycle: true, sample: (p) => sampleWalkMotion(p * (4 / 2.2), 1) },
  { id: "idle",   label: "自然待机", ms: 6000, cycle: true, sample: (p) => sampleIdleMotion(p * 6) },
];

// 旧曲线（改动前的实现），只保留画火柴人需要的通道
const OLD = {
  spin: (p) => {
    const q = Math.max(0, Math.min(1, p));
    const ss = (x) => { x = Math.max(0, Math.min(1, x)); return x*x*x*(x*(x*6-15)+10); };
    const eio = (x) => { x = Math.max(0, Math.min(1, x)); return x < 0.5 ? 4*x*x*x : 1 - ((-2*x+2)**3)/2; };
    const env = (x, a, r) => { x = Math.max(0, Math.min(1, x)); if (x<=0||x>=1) return 0; if (x<a) return ss(x/a); if (x<=r) return 1; return ss((1-x)/(1-r)); };
    if (q <= 0.1) { const k = ss(q/0.1); return { centerY: -0.08*k, bodyX: 0.045*k, legR: 0.12*k, kneeR: -0.18*k, footR: 0.04*k, legL: 0, kneeL: 0, footL: 0, armR: 0, armL: 0 }; }
    const tv = (q-0.1)/0.9, arc = Math.sin(tv*Math.PI);
    return { centerY: 0.38*arc, bodyX: 0.075*arc*Math.cos(tv*Math.PI*2), legR: 0.5*arc, kneeR: -0.92*arc, footR: 0.16*arc, legL: -0.06*arc, kneeL: 0, footL: 0.04*arc, armR: env(q,0.16,0.86), armL: -env(q,0.16,0.86) };
  },
  stomp: (p) => {
    const q = Math.max(0, Math.min(1, p));
    const rest = { centerY: 0, bodyX: 0, armR: 0, armL: 0, legR: 0, legL: 0, kneeR: 0, kneeL: 0, footR: 0, footL: 0, centerX: 0 };
    if (q <= 0 || q >= 1) return rest;
    const ss = (x) => { x = Math.max(0, Math.min(1, x)); return x*x*x*(x*(x*6-15)+10); };
    const mix = (a, b, t) => { const o = {}; for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) o[k] = (a[k]||0)*(1-t)+(b[k]||0)*t; return o; };
    const raised = { centerY: 0.08, centerX: 0.07, bodyX: 0.05, armR: 0.32, armL: -0.26, legR: 0.52, legL: 0.04, kneeR: -1.05, kneeL: 0.04, footR: 0.22, footL: 0.02 };
    const planted = { centerY: -0.1, centerX: -0.03, bodyX: -0.04, armR: -0.14, armL: 0.12, legR: 0.04, legL: -0.02, kneeR: -0.06, kneeL: 0.02, footR: 0.08, footL: -0.02 };
    const recoil = { centerY: 0.03, centerX: -0.02, bodyX: -0.02, armR: -0.06, armL: 0.05, legR: 0.02, legL: 0, kneeR: -0.03, kneeL: 0, footR: 0.03, footL: 0 };
    let pose;
    if (q < 0.26) pose = mix(rest, raised, ss(q/0.26));
    else if (q < 0.36) pose = {...raised};
    else if (q < 0.5) pose = mix(raised, planted, ss((q-0.36)/0.14));
    else if (q < 0.68) pose = mix(planted, recoil, ss((q-0.5)/0.18));
    else pose = mix(recoil, rest, ss((q-0.68)/0.32));
    let impact = 0;
    if (q >= 0.36 && q < 0.54) { impact = Math.sin(Math.PI*((q-0.36)/0.18)); pose.centerY -= 0.07*impact; }
    pose.impact = impact;
    return pose;
  },
  walk: (p, rate) => {
    const phase = p * (4 / 2.2) * Math.PI * 3.6;
    const step = Math.sin(phase);
    const liftR = Math.max(0, Math.cos(phase));
    const liftL = Math.max(0, -Math.cos(phase));
    return {
      centerY: Math.abs(Math.cos(phase))*0.03, centerX: Math.cos(phase)*0.028, bodyX: -0.045 + Math.cos(phase)*0.018,
      legR: step*0.58, legL: -step*0.58, kneeR: liftR*-0.92, kneeL: liftL*-0.92,
      footR: -step*0.12 - liftR*0.16, footL: step*0.12 - liftL*0.16,
      armR: -step*0.36, armL: step*0.36,
    };
  },
};

const S = 20;           // 模型单位 → 像素
const GROUND = 372;     // 地面
const { upper: THIGH, lower: SHIN } = getLegRig();
const FOOT = 1.1;
const HIP_Y = GROUND - (THIGH + SHIN) * S;  // 静止时脚底正好踩在地面
const TORSO = 3.9, NECK = 0.7, HEAD_R = 0.95;
const UPPER_ARM = 2.5, FOREARM = 2.4;

const cv = document.getElementById("cv");
const ctx = cv.getContext("2d");
const W = cv.width, H = cv.height;

let action = ACTIONS[0];
let playing = true;
let speed = 1;
let t = 0;              // 毫秒
let showGhost = true;
let showFloor = true;

const actionsEl = document.getElementById("actions");
ACTIONS.forEach((a) => {
  const b = document.createElement("button");
  b.textContent = a.label;
  b.onclick = () => { action = a; t = 0; render(); paintButtons(); };
  a.el = b;
  actionsEl.appendChild(b);
});
function paintButtons() { ACTIONS.forEach((a) => a.el.classList.toggle("on", a === action)); }
paintButtons();

document.getElementById("play").onclick = (e) => {
  playing = !playing;
  e.target.textContent = playing ? "暂停" : "播放";
};
document.querySelectorAll("[data-speed]").forEach((b) => {
  b.onclick = () => {
    speed = Number(b.dataset.speed);
    document.querySelectorAll("[data-speed]").forEach((x) => x.classList.toggle("on", x === b));
  };
});
const seek = document.getElementById("seek");
seek.oninput = () => { t = (Number(seek.value) / 1000) * action.ms; playing = false; document.getElementById("play").textContent = "播放"; render(); };
document.getElementById("ghost").onchange = (e) => { showGhost = e.target.checked; render(); };
document.getElementById("floor").onchange = (e) => { showFloor = e.target.checked; render(); };

// 角度约定：向量 = (sin θ, -cos θ)，θ > 0 表示向前摆
function limb(x, y, theta, len) {
  return [x + Math.sin(theta) * len * S, y - Math.cos(theta) * len * S];
}
function leg(x, y, hip, knee, foot) {
  const [kx, ky] = limb(x, y, hip, THIGH);
  const [ax, ay] = limb(kx, ky, hip + knee, SHIN);
  const phi = -foot;
  const [tx, ty] = [ax + Math.cos(phi) * FOOT * S, ay + Math.sin(phi) * FOOT * S];
  return { knee: [kx, ky], ankle: [ax, ay], toe: [tx, ty] };
}
function arm(x, y, swing, elbow) {
  const tU = -swing;
  const [ex, ey] = limb(x, y, tU, UPPER_ARM);
  const [wx, wy] = limb(ex, ey, tU + elbow, FOREARM);
  return { elbow: [ex, ey], wrist: [wx, wy] };
}

function drawFigure(m, style) {
  const cx = W / 2 + (m.centerX || 0) * S;
  const hy = HIP_Y - (m.centerY || 0) * S;
  const lean = (m.bodyX || 0) + (m.breath || 0);
  const [sx, sy] = [cx + Math.sin(lean) * TORSO * S, hy - Math.cos(lean) * TORSO * S];
  const [nx, ny] = [sx + Math.sin(lean) * NECK * S, sy - Math.cos(lean) * NECK * S];

  ctx.save();
  ctx.globalAlpha = style.alpha;
  ctx.strokeStyle = style.color;
  ctx.fillStyle = style.color;
  ctx.lineWidth = style.width;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  if (style.dash) ctx.setLineDash(style.dash);

  const legR = leg(cx, hy, m.legR || 0, m.kneeR || 0, m.footR || 0);
  const legL = leg(cx, hy, m.legL || 0, m.kneeL || 0, m.footL || 0);
  const armR = arm(sx, sy, -(m.armR || 0), (m.elbowR || 0) + (m.handWeight ? m.handWeight * 1.2 : 0));
  const armL = arm(sx, sy, m.armL || 0, (m.elbowL || 0) + (m.handWeight ? m.handWeight * 1.2 : 0));

  ctx.beginPath();
  ctx.moveTo(cx, hy); ctx.lineTo(legR.knee[0], legR.knee[1]); ctx.lineTo(legR.ankle[0], legR.ankle[1]); ctx.lineTo(legR.toe[0], legR.toe[1]);
  ctx.moveTo(cx, hy); ctx.lineTo(legL.knee[0], legL.knee[1]); ctx.lineTo(legL.ankle[0], legL.ankle[1]); ctx.lineTo(legL.toe[0], legL.toe[1]);
  ctx.moveTo(cx, hy); ctx.lineTo(sx, sy); ctx.lineTo(nx, ny);
  ctx.moveTo(sx, sy); ctx.lineTo(armR.elbow[0], armR.elbow[1]); ctx.lineTo(armR.wrist[0], armR.wrist[1]);
  ctx.moveTo(sx, sy); ctx.lineTo(armL.elbow[0], armL.elbow[1]); ctx.lineTo(armL.wrist[0], armL.wrist[1]);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(nx + Math.sin(lean + (m.headX || 0)) * HEAD_R * S * 0.8, ny - Math.cos(lean + (m.headX || 0)) * HEAD_R * S * 0.8, HEAD_R * S, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  if (showFloor && !style.dash) {
    ctx.save();
    ctx.strokeStyle = "#f0a13c";
    ctx.globalAlpha = 0.65;
    ctx.setLineDash([2, 4]);
    ctx.beginPath(); ctx.moveTo(cx, GROUND + 6); ctx.lineTo(cx, H - 6); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "#f0a13c";
    ctx.beginPath(); ctx.arc(cx, GROUND + 6, 3, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
}

function render() {
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = "#0b0e14";
  ctx.fillRect(0, 0, W, H);

  if (showFloor) {
    ctx.strokeStyle = "#1e2836";
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(20, GROUND + 6); ctx.lineTo(W - 20, GROUND + 6); ctx.stroke();
  }

  const p = action.cycle ? ((t / action.ms) % 1) : Math.max(0, Math.min(1, t / action.ms));
  const m = action.sample(p);
  if (showGhost && OLD[action.id]) {
    drawFigure(OLD[action.id](p), { color: "#5d6b7f", width: 3, alpha: 0.55, dash: [5, 4] });
  }
  drawFigure(m, { color: "#5aa9ff", width: 4.5, alpha: 1 });

  // 冲击提示
  if (m.impact > 0.05) {
    ctx.save();
    ctx.globalAlpha = Math.min(1, m.impact);
    ctx.strokeStyle = "#ff6b6b";
    ctx.lineWidth = 2;
    const r = 12 + 26 * (1 - m.impact);
    ctx.beginPath(); ctx.arc(W / 2, GROUND + 6, r, Math.PI, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }

  if (playing) seek.value = String(Math.round(p * 1000));
  document.getElementById("seekVal").textContent = Math.round(p * 100) + "%";

  const keys = ["centerY", "centerX", "bodyX", "legR", "kneeR", "footR", "legL", "kneeL", "footL", "armR", "armL", "elbowR", "handWeight", "turns", "impact", "weight"];
  document.getElementById("readout").innerHTML = keys
    .filter((k) => m[k] !== undefined)
    .map((k) => k.padEnd(11, " ") + (m[k] >= 0 ? " " : "") + m[k].toFixed(3))
    .join("\\n");
}

let last = performance.now();
function loop(now) {
  const dt = Math.min(64, now - last);
  last = now;
  if (playing) {
    t += dt * speed;
    if (!action.cycle && t >= action.ms) t = 0;
    if (action.cycle) t %= action.ms;
  }
  render();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
</script>
</body>
</html>
`;

writeFileSync(join(root, "action-preview.html"), html, "utf8");
console.log("written action-preview.html");
