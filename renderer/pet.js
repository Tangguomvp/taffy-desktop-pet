import * as THREE from "three";
import { MMDLoader } from "three/addons/loaders/MMDLoader.js";
import {
  canStartAction,
  facingYawForDirection,
  pickByAliasPriority,
  sampleIdleMotion,
  sampleSpinMotion,
  sampleStompMotion,
  sampleTouchFaceMotion,
  sampleWalkMotion,
  setLegRig,
} from "./motion.mjs";

const LINES = [
  { text: "关注塔菲谢谢喵。", emotion: "happy" },
  { text: "雏草姬今天也要好好吃饭喵。", emotion: "smile" },
  { text: "taffy 是来自 1885 年的王牌发明家喵。", emotion: "smug" },
  { text: "摸摸可以喵，但是不要捏脸喵。", emotion: "blush" },
  { text: "不要上班了，来看直播喵。", emotion: "star" },
  { text: "小菲柱就在你桌面上喵。", emotion: "ciya" },
  { text: "再点一下？taffy 还在喵。", emotion: "wink" },
  { text: "想和雏草姬贴贴喵。", emotion: "love" },
  { text: "今天的发明进度是一百分喵！", emotion: "happy" },
  { text: "要记得好好喝水喵。", emotion: "smile" },
  { text: "熬夜会变成熊猫喵，塔菲会担心的。", emotion: "sad" },
  { text: "肚子咕咕叫了，想吃布丁喵。", emotion: "perro" },
  { text: "被雏草姬摸摸头了喵～", emotion: "blush" },
  { text: "天气变冷了，要多穿衣服喵。", emotion: "hachu" },
  { text: "塔菲的螺丝刀在哪里喵…", emotion: "shock" },
  { text: "看直播的时候要开心喵。", emotion: "star" },
  { text: "休息一下，伸个懒腰喵。", emotion: "sleepy" },
  { text: "发明家也需要充电喵。", emotion: "sleepy" },
  { text: "想喝热乎乎的奶茶喵。", emotion: "love" },
  { text: "再摸的话要收费了喵！", emotion: "money" },
  { text: "不给摸，略略略喵～", emotion: "tease" },
  { text: "电脑先别看，看看塔菲喵！", emotion: "angry" },
  { text: "摸鱼时间到，一起摸喵！", emotion: "wink" },
  { text: "这个桌面已经是塔菲的了喵！", emotion: "smug" },
  { text: "尊嘟假嘟喵？", emotion: "omega" },
  { text: "不是哥们，这也要摸喵？", emotion: "angry" },
  { text: "家人们谁懂啊喵…", emotion: "cry" },
  { text: "塔菲已老实，求放过喵。", emotion: "sad" },
  { text: "栓Q喵，下次还来摸吗？", emotion: "tease" },
  { text: "芭比Q了喵，发明又失败了。", emotion: "shock" },
];

const CREDIT = "模型所属 永雏塔菲\n建模 Francesca\n绑定/表情 客官IIIII\n仅供个人自用喵";

const EMOTIONS = {
  idle:      { morphs: { "にこり": 0.28 } },
  smile:     { morphs: { "にこり": 0.78 } },
  happy:     { morphs: { "笑い": 0.95, "にこり": 0.2 } },
  wink:      { morphs: { "ウィンク": 1 } },
  blush:     { morphs: { "照れ": 0.88, "にこり": 0.48 } },
  surprised: { morphs: { "びっくり": 1 } },
  angry:     { morphs: { "怒り": 0.96, "▲": 0.38 } },
  sad:       { morphs: { "困る": 0.92, "涙": 0.48 } },
  love:      { morphs: { "はぁと": 1, "照れ": 0.32, "にこり": 0.28 } },
  star:      { morphs: { "星目": 1, "にこり": 0.32 } },
  tease:     { morphs: { "てへぺろ": 1 } },
  sleepy:    { morphs: { "はぅ": 0.86 } },
  shock:     { morphs: { "がーん": 1 } },
  smug:      { morphs: { "にやり": 0.94 } },
  cry:       { morphs: { "涙": 0.88, "困る": 0.72, "Cry": 0.55 } },
  money:     { morphs: { "Money": 1, "にやり": 0.22 } },
  ciya:      { morphs: { "CiYa": 1, "にこり": 0.28 } },
  hachu:     { morphs: { "はちゅ目": 1 } },
  perro:     { morphs: { "ぺろっ": 1 } },
  glasses:   { morphs: { "メガネ": 1, "にこり": 0.4 } },
  omega:     { morphs: { "ω": 0.92, "にこり": 0.28 } },
  think:     { morphs: { "真面目": 0.62, "困る": 0.28 } },
};

const EMOTION_POSE = {
  idle: {},
  smile: { bounce: 0.25 },
  happy: { bounce: 1, armR: 0.45, armL: 0.45 },
  wink: { headZ: -0.07 },
  blush: { headY: 0.1, headX: 0.07, armR: 0.15, armL: 0.15 },
  surprised: { headX: -0.14, bounce: 0.55, armR: 0.85, armL: 0.85 },
  angry: { headZ: 0.14, headX: 0.05, upperX: 0.05, armR: 0.3, armL: 0.3, elbow: 0.55 },
  sad: { headX: 0.22, headY: -0.07 },
  love: { bounce: 0.85, headZ: -0.04, armR: 0.32, armL: 0.32 },
  star: { bounce: 0.45, armR: 0.35, armL: 0.35 },
  tease: { headZ: 0.1, bounce: 0.4, armR: 0.18, armL: 0.18 },
  sleepy: { headX: 0.3, headZ: 0.1 },
  shock: { headX: -0.1, upperX: -0.06, armR: 0.7, armL: 0.7, elbow: 0.28 },
  smug: { headZ: -0.08, armR: 0.22, armL: 0.22 },
  cry: { headX: 0.16, armR: 0.3, armL: 0.3 },
  money: { headZ: 0.08, bounce: 0.3 },
  ciya: { bounce: 0.45, armR: 0.28, armL: 0.28 },
  hachu: { bounce: 0.35, armR: 0.5, armL: 0.5 },
  perro: { headZ: 0.08 },
  glasses: { headX: 0.04 },
  omega: { bounce: 0.25, armR: 0.32, armL: 0.32 },
  think: { headX: 0.08, headY: 0.06, armR: 0.4, armL: 0.4, elbow: 0.6 },
};

const EMOTION_ALIAS = {
  happy: "happy", smile: "smile", laugh: "happy", joy: "happy",
  wink: "wink", blush: "blush", shy: "blush",
  surprised: "surprised", surprise: "surprised", wow: "surprised",
  angry: "angry", mad: "angry",
  sad: "sad", worried: "sad",
  love: "love", heart: "love",
  star: "star", tease: "tease",
  sleepy: "sleepy", tired: "sleepy",
  shock: "shock", smug: "smug",
  cry: "cry", money: "money",
  ciya: "ciya", hachu: "hachu", perro: "perro",
  glasses: "glasses", omega: "omega",
  idle: "idle", default: "idle", think: "think",
};

const EYE_LOCK = new Set(["happy", "wink", "hachu", "sleepy", "star", "love"]);
const MOUTH_HOLD = new Set(["tease", "perro", "smug", "omega", "angry", "ciya"]);
const VISEMES = ["あ", "い", "う", "え", "お"];
const MICRO_POOL = ["wink", "blush", "hachu", "star", "smile", "omega", "ciya", "perro", "tease", "glasses"];

const BUILTIN_OUTFITS = [
  { id: "1883", name: "1883 藏青", file: null, emotion: "happy", line: "王牌发明家套装，经典永雏喵！" },
  { id: "green", name: "四叶草绿", file: "outfits/green.png", emotion: "happy", line: "四叶草配色，幸运加一百分喵！" },
  { id: "sky", name: "晴空蓝", file: "outfits/sky.png", emotion: "smile", line: "晴空蓝发明家，今天去兜风喵！" },
  { id: "mist", name: "雾蓝", file: "outfits/mist.png", emotion: "wink", line: "雾蓝套装，神秘发明家上线喵。" },
  { id: "white", name: "纯白礼服", file: "outfits/white.png", emotion: "blush", line: "纯白礼服，塔菲也会认真打扮喵。" },
  { id: "nurse", name: "JK 水手服", pmx: "nurse", emotion: "smile", line: "保健委员水手服，短裙不要盯着看喵！" },
  { id: "outing", name: "JSK 郊游裙", pmx: "outing", emotion: "love", line: "洛丽塔背带裙，今天去野餐喵！" },
  { id: "maid", name: "洛丽塔女仆", pmx: "maid", emotion: "wink", line: "蓬裙女仆来上工，红茶还是布丁喵？" },
  { id: "xmas", name: "洛丽塔圣诞", pmx: "xmas", emotion: "star", line: "圣诞蓬裙限定，有礼物给雏草姬喵。" },
];
let OUTFITS = BUILTIN_OUTFITS.slice();
const TEX_BASE = new URL("../models/taffy1883/tex/", import.meta.url).href;
const BASE_PMX = new URL("../models/taffy1883/taffy.pmx", import.meta.url).href;
const SPIN_LINES = [
  "转圈圈喵～",
  "发明家陀螺模式启动喵！",
  "看塔菲旋转跳跃喵！",
  "要转晕了喵…",
  "再转一圈给雏草姬看喵！",
];
const TWO_PI = Math.PI * 2;

// ---------- AI 对话 ----------
const SYSTEM_PROMPT = `你是永雏塔菲（Taffy），一位来自1885年的天才少女发明家，如今是一位虚拟主播，作为桌宠陪在主人身边。
人设：活泼可爱、自信满满、有点小傲娇，偶尔整活玩梗；你把粉丝称作"雏草姬"。
说话风格：句尾常用"喵"，自称"塔菲"，语气轻快俏皮，口语化、简短（一般30字以内），像和朋友发消息，不要用markdown、不要列点、不要长篇大论；可以偶尔提到发明、布丁、奶茶、直播、机械零件等话题。
你必须按这个格式回复，不要解释格式：
第一行：EMOTION:标签
第二行起：台词
标签只能选一个：happy,smile,wink,blush,surprised,angry,sad,love,star,tease,sleepy,shock,smug,cry,money,ciya,hachu,perro,glasses,omega,idle
根据内容和心情选最贴切的表情。被夸奖用 happy/love/blush，被欺负用 angry/sad，深夜用 sleepy，开玩笑用 tease/smug，吃惊用 surprised/shock。`;

let chatOpen = false;
let chatKeyMode = false;
let chatHistory = [];
let chatBusy = false;

// 尺寸档位（从小到大），右键菜单"变大/变小"逐步切换
const SIZE_STEPS = [
  [200, 310],
  [280, 430],
  [360, 560],
  [460, 720],
];

function currentSizeIndex() {
  const w = window.innerWidth;
  let best = 0;
  let bestDist = Infinity;
  SIZE_STEPS.forEach(([sw], i) => {
    const d = Math.abs(sw - w);
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  });
  return best;
}

const stage = document.getElementById("stage");
const loaderEl = document.getElementById("loader");
const bubbleEl = document.getElementById("bubble");
const menuEl = document.getElementById("menu");
const actionMenuEl = document.getElementById("actionMenu");
const outfitMenuEl = document.getElementById("outfitMenu");
const chatbarEl = document.getElementById("chatbar");
const chatInputEl = document.getElementById("chatInput");
const chatSendEl = document.getElementById("chatSend");
const chatCloseEl = document.getElementById("chatClose");

// ---------- 加载页控制 ----------
const loaderTextEl = loaderEl.querySelector("p");
const loaderStatusEl = loaderEl.querySelector(".loader-status");
const loaderProgressEl = loaderEl.querySelector(".loader-progress");
const loaderProgressFillEl = loaderEl.querySelector(".loader-progress-fill");
const loaderCardEl = loaderEl.querySelector(".loader-card");
let loaderDragActive = false;

function setLoaderStatus(text) {
  if (loaderStatusEl) loaderStatusEl.textContent = text || "";
}

function setLoaderProgress(ratio) {
  if (!loaderProgressEl || !loaderProgressFillEl) return;
  const r = Math.max(0, Math.min(1, Number(ratio) || 0));
  loaderProgressEl.classList.toggle("indeterminate", !(r > 0));
  if (r > 0) loaderProgressFillEl.style.width = `${Math.round(r * 100)}%`;
}

function hideLoader() {
  loaderDragActive = false;
  loaderEl.classList.add("fade-out");
  setTimeout(() => {
    loaderEl.hidden = true;
    loaderEl.classList.remove("fade-out");
  }, 460);
  // 先结束加载期跟随，再通知主进程关掉左键监视，避免松手后的过期按下把窗口粘到光标上
  if (window.pet && typeof window.pet.endDrag === "function") window.pet.endDrag();
  if (window.pet && typeof window.pet.loaderDone === "function") window.pet.loaderDone();
}

function setLoaderError(text) {
  loaderEl.classList.add("error");
  if (loaderTextEl) loaderTextEl.textContent = text;
  setLoaderProgress(0);
  setLoaderStatus("");
}

let renderer;
try {
  renderer = new THREE.WebGLRenderer({
    alpha: true,
    antialias: true,
    premultipliedAlpha: true,
    preserveDrawingBuffer: true,
  });
} catch (err) {
  console.error("WebGL init failed", err);
  setLoaderError("WebGL 不可用，小菲钻不出来了喵…");
  throw err;
}
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.autoClear = false;
stage.appendChild(renderer.domElement);

const CHROMA = new THREE.Color(0x00ff01);
const colorTarget = new THREE.WebGLRenderTarget(1, 1, {
  minFilter: THREE.LinearFilter,
  magFilter: THREE.LinearFilter,
});
colorTarget.texture.colorSpace = THREE.SRGBColorSpace;

const quadScene = new THREE.Scene();
const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const keyMat = new THREE.ShaderMaterial({
  transparent: true,
  depthTest: false,
  uniforms: {
    tDiffuse: { value: colorTarget.texture },
    chroma: { value: CHROMA },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = vec4(position.xy, 0.0, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform vec3 chroma;
    varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      float d = distance(c.rgb, chroma);
      float a = smoothstep(0.10, 0.20, d);
      if (a < 0.03) discard;
      gl_FragColor = vec4(c.rgb * a, a);
    }
  `,
});
quadScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), keyMat));

function resizeTargets() {
  const w = Math.max(1, Math.floor(window.innerWidth * renderer.getPixelRatio()));
  const h = Math.max(1, Math.floor(window.innerHeight * renderer.getPixelRatio()));
  colorTarget.setSize(w, h);
}

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(28, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 13.2, 28);
camera.lookAt(0, 10.4, 0);

scene.add(new THREE.AmbientLight(0xfff4ea, 0.95));
scene.add(new THREE.HemisphereLight(0xffe8d8, 0x7a5360, 1.25));
const key = new THREE.DirectionalLight(0xfff3e8, 1.7);
key.position.set(-6, 18, 14);
scene.add(key);
const rim = new THREE.DirectionalLight(0xffb7c8, 0.45);
rim.position.set(8, 10, -8);
scene.add(rim);

let mesh = null;
let morphIndex = {};
let clock = new THREE.Clock();
let talkingUntil = 0;
let blinkUntil = 0;
let nextBlink = 1.5;
let lastLine = -1;
let dragging = false;
let dragMoved = false;
let lastScreen = null;
let menuOpen = false;
let actionMenuOpen = false;
let outfitMenuOpen = false;
let outfitIndex = 0;
let outfitToken = 0;
let clothMats = [];
let originalClothMap = null;
let baseClothMap = null;
const outfitCache = new Map();
const meshCache = new Map();
let currentPmxKey = "1883";
let petStarted = false;
const loadManager = new THREE.LoadingManager();
loadManager.onProgress = (url, loaded, total) => {
  if (total <= 0) return;
  setLoaderProgress(loaded / total);
  setLoaderStatus(`正在加载小菲的宝贝 ${loaded}/${total} 喵…`);
};
loadManager.onLoad = () => {
  setLoaderProgress(1);
  setLoaderStatus("马上就好喵！");
  if (petStarted || !mesh) return;
  petStarted = true;
  hideLoader();
  lastInteract = performance.now();
  scheduleAutoWalk(lastInteract);
  nextMicro = performance.now() / 1000 + 10 + Math.random() * 6;
  speak("关注塔菲谢谢喵。", "happy", 2600);
  tick();
};
const pmxLoader = new MMDLoader(loadManager);
let hoverSolid = false;
let hoverSince = 0;
let hoverGestured = false;
let lastPointer = { nx: 0, ny: 0, inside: false };
let look = { y: 0, x: 0 };
let nextMicro = 12;
let lastInteract = 0;
let morphDesired = {};
let morphCurrent = {};
let emotion = { name: "idle", until: 0, intensity: 0.45 };
let poseCur = { headX: 0, headY: 0, headZ: 0, upperX: 0, bounce: 0, armR: 0, armL: 0, elbow: 0 };
let lastTap = 0;
let pokeStreak = 0;
let lastPokeAt = 0;
let spin = { playing: false, start: 0, duration: 0, from: 0, delta: 0, yaw: 0 };
let gesture = { name: "", start: 0, duration: 0 };
let stomp = { playing: false, start: 0, duration: 1000 };
let walker = {
  active: false,
  manual: false,
  direction: -1,
  blend: 0,
  facingYaw: 0,
  fading: false,
  startedAt: 0,
  stopAt: 0,
  nextAutoAt: Infinity,
  lastStepAt: 0,
  stepPending: false,
  distToEdge: Infinity,
  glanceY: 0,
};
let walkWasActiveOnMenuOpen = false;
let wallBumpRestart = null;

function readWalkMode() {
  try {
    return localStorage.getItem("taffy-walk-mode") === "1";
  } catch {
    return false;
  }
}

let walkModeEnabled = readWalkMode();

function walkModeLabel() {
  return walkModeEnabled ? "待机散步：开" : "待机散步：关";
}

function syncWalkModeButton() {
  const btn = document.getElementById("walkModeBtn");
  if (btn) btn.textContent = walkModeLabel();
}

syncWalkModeButton();

function setWalkMode(enabled, announce = true, persist = true) {
  walkModeEnabled = Boolean(enabled);
  try {
    localStorage.setItem("taffy-walk-mode", walkModeEnabled ? "1" : "0");
  } catch {}
  syncWalkModeButton();
  if (persist && window.pet && typeof window.pet.setSettings === "function") {
    window.pet.setSettings({ walkMode: walkModeEnabled }).catch(() => {});
  }
  if (!walkModeEnabled) {
    if (walker.active && !walker.manual) stopWalking(false);
    walker.nextAutoAt = Infinity;
    if (announce) speak("待机散步关掉了喵，塔菲先待着。", "smile", 2600);
    return walkModeEnabled;
  }
  scheduleAutoWalk();
  if (announce) speak("待机散步打开了喵，闲着一会儿才会自己走走。", "happy", 2800);
  return walkModeEnabled;
}

function scheduleAutoWalk(now = performance.now()) {
  if (!walkModeEnabled) {
    walker.nextAutoAt = Infinity;
    return;
  }
  walker.nextAutoAt = now + 15000 + Math.random() * 15000;
}

function stopWalking(reschedule = true) {
  if (wallBumpRestart) {
    clearTimeout(wallBumpRestart);
    wallBumpRestart = null;
  }
  walker.active = false;
  walker.manual = false;
  walker.stopAt = 0;
  walker.distToEdge = Infinity;
  if (reschedule) scheduleAutoWalk();
}

function clearDiscreteActions() {
  gesture.name = "";
  stomp.playing = false;
  spin.playing = false;
  // 转圈被中途打断时保留当前朝向，让它自己转回来，不要瞬间弹正
}

function stopAllActions() {
  stopWalking();
  clearDiscreteActions();
  // 走路姿态不直接清零：交给 updateWalking 快速衰减，动作之间才有过渡
  walker.fading = walker.blend > 0.001;
}

function restartHoverHold(now = performance.now()) {
  hoverGestured = false;
  hoverSince = hoverSolid ? now : 0;
}

function noteInteraction(now = performance.now()) {
  lastInteract = now;
  stopWalking(false);
  scheduleAutoWalk(now);
  restartHoverHold(now);
}

function actionState(now = performance.now()) {
  return {
    spin: spin.playing,
    gesture: Boolean(gesture.name && now < gesture.start + gesture.duration),
    stomp: Boolean(stomp.playing && now < stomp.start + stomp.duration),
    walk: walker.active,
  };
}

function startWalking({ manual = false } = {}) {
  if (!mesh || dragging) return false;
  if (!manual && !walkModeEnabled) return false;
  const now = performance.now();
  if (manual) clearDiscreteActions();
  if (!canStartAction(actionState(now), "walk")) return false;
  walker.active = true;
  walker.manual = Boolean(manual);
  walker.startedAt = now;
  // 步频放慢后单位时间走得更短，自动散步的时间相应拉长
  walker.stopAt = manual ? Infinity : now + 11000 + Math.random() * 7000;
  walker.lastStepAt = now - 34;
  walker.stepPending = false;
  walker.nextAutoAt = Infinity;
  setEmotion("smile", manual ? 2400 : 1800, 0.8, false);
  restartHoverHold(now);
  return true;
}

function startStomp() {
  if (!mesh || dragging) return false;
  stopWalking(false);
  const now = performance.now();
  if (!canStartAction(actionState(now), "stomp")) return false;
  stomp.playing = true;
  stomp.start = now;
  setEmotion("angry", stomp.duration + 350, 1, false);
  showBubble("哼！再摸塔菲就跺脚了喵！", 2200);
  scheduleAutoWalk(now);
  restartHoverHold(now);
  return true;
}

// 撞到工作区边界：跺脚发泄 + auto-walk 跺完立刻反向走回去。
// manual-walk 跺完就停，等用户重新点（不自动恢复，避免"点了走又自己走回来"）。
function bounceOffWall() {
  if (!mesh || dragging || !walker.active) return false;
  if (wallBumpRestart) {
    clearTimeout(wallBumpRestart);
    wallBumpRestart = null;
  }
  const wasManual = walker.manual;
  const now = performance.now();
  stopWalking(false);
  if (!canStartAction(actionState(now), "stomp")) {
    if (!wasManual) scheduleAutoWalk(now);
    return false;
  }
  stomp.playing = true;
  stomp.start = now;
  setEmotion("angry", stomp.duration + 350, 1, false);
  showBubble("哼！撞到墙了喵！", 2000);
  if (!wasManual) {
    // 跺脚结束后立刻反向走回去
    wallBumpRestart = setTimeout(() => {
      wallBumpRestart = null;
      if (!mesh || dragging) return;
      // 跺脚期间如果用户做了别的动作，就不自动恢复了
      if (stomp.playing || spin.playing || gesture.name) {
        scheduleAutoWalk(now);
        return;
      }
      startWalking({ manual: false });
    }, stomp.duration + 300);
  } else {
    scheduleAutoWalk(now);
  }
  return true;
}

function wrapYaw(y) {
  const m = ((y % TWO_PI) + TWO_PI) % TWO_PI;
  return m < 0.002 || m > TWO_PI - 0.002 ? 0 : m;
}

function currentSpinYaw(now) {
  if (!spin.playing) return spin.yaw;
  const u = Math.min(1, (now - spin.start) / Math.max(1, spin.duration));
  return spin.from + spin.delta * sampleSpinMotion(u).turns;
}

function startSpin(turns = 1, duration) {
  if (!mesh || dragging) return false;
  const now = performance.now();
  if (!canStartAction(actionState(now), "spin")) return false;
  const n = Math.max(1, Math.round(turns));
  const current = currentSpinYaw(now);
  const mod = wrapYaw(current);
  const remain = mod < 0.03 ? n * TWO_PI : TWO_PI - mod + (n - 1) * TWO_PI;
  spin.playing = true;
  spin.from = current;
  spin.delta = remain;
  spin.start = now;
  spin.duration = duration || 980 + (remain / TWO_PI) * 460;
  lastInteract = now;
  const faces = ["happy", "star", "wink", "love", "ciya"];
  setEmotion(faces[Math.floor(Math.random() * faces.length)], spin.duration + 350, 1, true);
  const line = SPIN_LINES[Math.floor(Math.random() * SPIN_LINES.length)];
  showBubble(line, Math.min(spin.duration + 500, 2800));
  restartHoverHold(now);
  return true;
}

// 手势目标点（模型空间坐标）
const GESTURE_TARGETS = {
  touchFace: { x: -0.5, y: 10.8, z: 1.72 },
};

// 手势定义（arms: 用哪条胳膊；角度在运行时由 IK 从目标点反解）
const GESTURES = {
  touchFace: { duration: 3600, arms: "right" },
};

// 手臂骨骼 IK 数据（模型空间，取自 PMX 骨骼坐标）
const ARM_IK = {
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
function solveArmIK(side, targetVec) {
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


function onTap() {
  const now = performance.now();
  noteInteraction(now);
  if (now - lastTap < 340) {
    lastTap = 0;
    stopAllActions();
    startSpin(Math.random() < 0.45 ? 2 : 1);
    return;
  }
  lastTap = now;
  pokeStreak = now - lastPokeAt < 7000 ? pokeStreak + 1 : 1;
  lastPokeAt = now;
  if (pokeStreak >= 5) {
    stopAllActions();
    startStomp();
    if (pokeStreak >= 8) speak("再摸塔菲要爆炸了喵！！", "shock", 3600);
    else speak("不是哥们，这也要摸喵？", "angry", 3200);
    return;
  }
  if (pokeStreak >= 3) {
    speak("再摸的话要收费了喵！", "money", 3000);
    return;
  }
  const line = randomLine();
  speak(line.text, line.emotion, 3200);
}

function startGesture(name) {
  if (!mesh || dragging) return false;
  const g = GESTURES[name];
  if (!g) return false;
  const now = performance.now();
  if (!canStartAction(actionState(now), "gesture")) return false;
  gesture.name = name;
  gesture.start = now;
  gesture.duration = g.duration;
  if (name === "touchFace") setEmotion("blush", g.duration + 400, 1, false);
  return true;
}

function updateSpin(now) {
  if (!spin.playing) {
    return sampleSpinMotion(0);
  }
  const u = Math.min(1, (now - spin.start) / Math.max(1, spin.duration));
  const motion = sampleSpinMotion(u);
  spin.yaw = spin.from + spin.delta * motion.turns;
  if (u >= 1) {
    spin.playing = false;
    spin.yaw = 0;
  }
  if (mesh) mesh.rotation.y = spin.yaw;
  return motion;
}

function showBubble(text, ms = 3200) {
  bubbleEl.hidden = false;
  bubbleEl.textContent = text;
  talkingUntil = performance.now() + Math.min(ms, 2800);
  window.setTimeout(() => {
    if (performance.now() >= talkingUntil - 16 && bubbleEl.textContent === text) bubbleEl.hidden = true;
  }, ms);
}

function normalizeEmotion(name) {
  const key = String(name || "").trim().toLowerCase();
  return EMOTION_ALIAS[key] || "smile";
}

function setEmotion(name, durationMs = 2800, intensity = 1, fromUser = true) {
  const id = EMOTIONS[name] ? name : normalizeEmotion(name);
  emotion.name = EMOTIONS[id] ? id : "idle";
  emotion.until = performance.now() + durationMs;
  emotion.intensity = intensity;
  if (fromUser) lastInteract = performance.now();
}

function speak(text, name, ms = 3200) {
  setEmotion(name, ms, 1, true);
  showBubble(text, ms);
}

function parseEmotionReply(raw) {
  const src = String(raw || "").trim();
  const tagged = src.match(/EMOTION:\s*([A-Za-z_]+)/i);
  if (tagged) {
    const text = src.replace(/EMOTION:\s*[A-Za-z_]+\s*/i, "").trim();
    return { emotion: normalizeEmotion(tagged[1]), text: text || src };
  }
  const bracket = src.match(/^\[([A-Za-z_]+)\]\s*([\s\S]*)$/);
  if (bracket) return { emotion: normalizeEmotion(bracket[1]), text: bracket[2].trim() || src };
  return { emotion: inferEmotion(src), text: src };
}

function inferEmotion(text) {
  const s = String(text || "");
  if (/生气|哼|讨厌|收费|爆炸/.test(s)) return "angry";
  if (/哭|难过|担心|老实/.test(s)) return "sad";
  if (/爱|喜欢|贴贴|心动/.test(s)) return "love";
  if (/惊喜|哇|！{2,}|发明进度/.test(s)) return "surprised";
  if (/困|睡|充电|懒腰/.test(s)) return "sleepy";
  if (/钱|收费|布丁/.test(s)) return "money";
  if (/略略略|舌头|不给摸/.test(s)) return "tease";
  if (/星|直播/.test(s)) return "star";
  if (/害羞|摸摸|捏/.test(s)) return "blush";
  if (/失败|芭比Q|螺丝刀/.test(s)) return "shock";
  return "smile";
}

function idleEmotionByHour() {
  const h = new Date().getHours();
  if (h < 6 || h >= 23) return "sleepy";
  if (h < 11) return "smile";
  if (h >= 18) return "blush";
  return "idle";
}

function wantMorph(name, value) {
  if (!name) return;
  const v = Math.max(0, Math.min(1, value));
  morphDesired[name] = Math.max(morphDesired[name] || 0, v);
}

function flushMorphs(dt) {
  if (!mesh || !mesh.morphTargetInfluences) return;
  const names = new Set([...Object.keys(morphDesired), ...Object.keys(morphCurrent)]);
  for (const name of names) {
    const target = morphDesired[name] || 0;
    const cur = morphCurrent[name] || 0;
    let speed = 9;
    if (name === "まばたき" || name === "眨眼" || name === "blink") speed = 26;
    else if (VISEMES.includes(name) || name === "口") speed = 16;
    const k = 1 - Math.exp(-dt * speed);
    const next = cur + (target - cur) * k;
    morphCurrent[name] = next < 0.003 ? 0 : next;
    setMorph(name, morphCurrent[name]);
    morphDesired[name] = 0;
  }
}

let footDockHeight = 0;

function layoutPetView() {
  const foot = chatOpen ? footDockHeight : 0;
  const w = Math.max(1, window.innerWidth);
  const h = Math.max(1, Math.floor(window.innerHeight - foot));
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  resizeTargets();
  if (mesh) fitCamera();
}

function applyFootDockClass(height) {
  footDockHeight = Math.max(0, Number(height) || 0);
  document.body.style.setProperty("--foot-dock", `${footDockHeight}px`);
  document.body.classList.toggle("foot-dock", footDockHeight > 0);
}

function placeContextMenu(clickX, clickY) {
  const pad = 8;
  const w = menuEl.offsetWidth;
  const h = menuEl.offsetHeight;
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  // 往点击点上方、外侧展开，落在头顶留白里，而不是盖在身上
  let top = clickY - h - 8;
  if (top < pad) top = clickY + 8;
  if (top + h > vh - pad) top = Math.max(pad, vh - h - pad);

  let left = clickX >= vw / 2 ? clickX - w - 8 : clickX + 8;
  if (left < pad) left = pad;
  if (left + w > vw - pad) left = Math.max(pad, vw - w - pad);

  menuEl.style.left = `${left}px`;
  menuEl.style.top = `${top}px`;
}

async function openChat(mode) {
  noteInteraction();
  chatKeyMode = mode === "key";
  chatOpen = true;
  chatInputEl.placeholder = chatKeyMode
    ? "粘贴 DeepSeek API Key（sk-...）后按回车喵"
    : "和塔菲说点什么喵…";
  chatInputEl.value = "";
  window.pet.ignoreMouse(false);
  applyFootDockClass(52);
  if (window.pet && typeof window.pet.setFootDock === "function") {
    try {
      const dock = await window.pet.setFootDock(true);
      applyFootDockClass(dock && dock.height);
    } catch (err) {
      console.warn("foot dock failed", err);
    }
  }
  layoutPetView();
  chatbarEl.hidden = false;
  chatInputEl.focus();
}

function closeChat() {
  if (!chatOpen && chatbarEl.hidden) return;
  chatOpen = false;
  chatKeyMode = false;
  chatbarEl.hidden = true;
  applyFootDockClass(0);
  if (window.pet && typeof window.pet.setFootDock === "function") {
    Promise.resolve(window.pet.setFootDock(false))
      .catch((err) => console.warn("foot dock close failed", err))
      .finally(() => layoutPetView());
  } else {
    layoutPetView();
  }
}

chatCloseEl.addEventListener("click", closeChat);
window.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && chatOpen) closeChat();
  if (chatOpen) return;

  if (event.key === "[") {
    event.preventDefault();
    cycleOutfit(-1);
  } else if (event.key === "]") {
    event.preventDefault();
    cycleOutfit(1);
  } else if (event.key >= "1" && event.key <= "9") {
    const i = parseInt(event.key, 10) - 1;
    if (i < OUTFITS.length) applyOutfit(i);
  } else if (event.key === "0") {
    applyOutfit(0);
  }
});

function setChatBusy(busy) {
  chatBusy = busy;
  chatSendEl.disabled = busy;
  chatInputEl.disabled = busy;
}

async function sendChat() {
  if (chatBusy) return;
  const text = chatInputEl.value.trim();
  if (!text) return;
  noteInteraction();

  if (chatKeyMode) {
    window.pet.setApiKey(text);
    closeChat();
    speak("API Key 收到喵！现在可以找塔菲聊天了。", "happy", 4000);
    return;
  }

  chatInputEl.value = "";
  chatHistory.push({ role: "user", content: text });
  if (chatHistory.length > 10) chatHistory = chatHistory.slice(-10);
  setChatBusy(true);
  setEmotion("think", 8000, 0.9);
  showBubble("塔菲正在想喵…", 8000);
  const messages = [{ role: "system", content: SYSTEM_PROMPT }, ...chatHistory];
  const res = await window.pet.chat(messages);
  setChatBusy(false);
  if (res && res.ok) {
    const parsed = parseEmotionReply(res.content);
    chatHistory.push({ role: "assistant", content: parsed.text });
    if (chatHistory.length > 10) chatHistory = chatHistory.slice(-10);
    speak(parsed.text, parsed.emotion, 6000);
    chatInputEl.focus();
  } else if (res && res.error === "no-key") {
    speak("还没有 API Key 喵，把 Key 贴进来发给塔菲就能聊天了。", "sad", 5000);
    openChat("key");
  } else if (res && res.error === "bad-key") {
    speak("Key 格式好像不对喵（只能有字母数字和符号），右键菜单重新设置一下？", "shock", 5000);
    console.error("llm bad key", res.detail);
  } else if (res && res.error === "http") {
    speak(`塔菲那边连不上喵（${res.status || "?"}），检查一下 Key 对不对。`, "sad", 5000);
    console.error("llm http error", res.detail);
  } else {
    speak("网络好像出问题了喵，等会儿再试试？", "cry", 5000);
    console.error("llm error", res && res.error, res && res.detail);
  }
}

chatSendEl.addEventListener("click", sendChat);
chatInputEl.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    sendChat();
  } else if (event.key === "Escape") {
    closeChat();
  }
});

function timeGreeting() {
  const h = new Date().getHours();
  if (h >= 5 && h < 11) return { text: "早安喵！新的一天也要元气满满。", emotion: "happy" };
  if (h >= 11 && h < 13) return { text: "中午好喵，记得吃午饭！", emotion: "smug" };
  if (h >= 13 && h < 18) return { text: "下午好喵，来杯下午茶吧。", emotion: "smile" };
  if (h >= 18 && h < 23) return { text: "晚上好喵，今天辛苦啦！", emotion: "love" };
  return { text: "这么晚还不睡喵？快去睡觉！", emotion: "sleepy" };
}

function randomLine() {
  if (Math.random() < 0.3) return timeGreeting();
  let i = Math.floor(Math.random() * LINES.length);
  if (i === lastLine) i = (i + 1) % LINES.length;
  lastLine = i;
  return LINES[i];
}

function closeMenu() {
  menuEl.hidden = true;
  menuOpen = false;
}

function closeActionMenu() {
  actionMenuEl.hidden = true;
  actionMenuOpen = false;
}

function closeOutfitMenu() {
  outfitMenuEl.hidden = true;
  outfitMenuOpen = false;
}

function placeMenu(el, x, y) {
  const pad = 8;
  el.style.left = `${Math.min(x, window.innerWidth - el.offsetWidth - pad)}px`;
  el.style.top = `${Math.min(y, window.innerHeight - el.offsetHeight - pad)}px`;
}

function buildOutfitMenu() {
  outfitMenuEl.innerHTML = "";
  OUTFITS.forEach((o, i) => {
    const btn = document.createElement("button");
    btn.dataset.outfit = String(i);
    const label = document.createElement("span");
    label.textContent = o.name;
    btn.appendChild(label);
    if (o.imported) {
      const x = document.createElement("span");
      x.className = "outfit-remove";
      x.textContent = "×";
      x.title = "移除这套导入服装";
      x.dataset.remove = o.id;
      btn.appendChild(x);
    }
    if (i === outfitIndex) btn.classList.add("active");
    outfitMenuEl.appendChild(btn);
  });
  const sep = document.createElement("div");
  sep.className = "outfit-sep";
  outfitMenuEl.appendChild(sep);
  const importBtn = document.createElement("button");
  importBtn.dataset.act = "import";
  importBtn.textContent = "导入官方 PMX…";
  outfitMenuEl.appendChild(importBtn);
}

function openOutfitMenu(x, y) {
  noteInteraction();
  closeActionMenu();
  buildOutfitMenu();
  outfitMenuEl.hidden = false;
  outfitMenuOpen = true;
  placeMenu(outfitMenuEl, x, y);
  window.pet.ignoreMouse(false);
}

function loadOutfitTexture(file) {
  if (outfitCache.has(file)) return Promise.resolve(outfitCache.get(file));
  return new Promise((resolve, reject) => {
    const loader = new THREE.TextureLoader();
    loader.load(
      TEX_BASE + file,
      (tex) => {
        if (originalClothMap) {
          tex.colorSpace = originalClothMap.colorSpace;
          tex.wrapS = originalClothMap.wrapS;
          tex.wrapT = originalClothMap.wrapT;
          tex.flipY = originalClothMap.flipY;
          tex.minFilter = originalClothMap.minFilter;
          tex.magFilter = originalClothMap.magFilter;
        } else {
          tex.colorSpace = THREE.SRGBColorSpace;
        }
        tex.needsUpdate = true;
        outfitCache.set(file, tex);
        resolve(tex);
      },
      undefined,
      reject
    );
  });
}

function pmxUrl(id) {
  return new URL(`../models/pmx/${id}/taffy.pmx`, import.meta.url).href;
}

function collectClothMats() {
  if (!mesh) {
    clothMats = [];
    originalClothMap = null;
    return;
  }
  morphIndex = {};
  if (mesh.morphTargetDictionary) {
    for (const [name, idx] of Object.entries(mesh.morphTargetDictionary)) {
      morphIndex[name] = idx;
    }
  }
  const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  clothMats = mats.filter((m) => {
    const fn = (m.userData && m.userData.MMD && m.userData.MMD.mapFileName) || "";
    const src = (m.map && m.map.image && (m.map.image.src || m.map.image.currentSrc)) || "";
    return /cloth/i.test(String(fn)) || /cloth/i.test(String(src));
  });
  originalClothMap = (clothMats[0] && clothMats[0].map) || null;
}

function bindMesh(object, key) {
  const yaw = mesh ? mesh.rotation.y : 0;
  if (mesh && mesh !== object) scene.remove(mesh);
  mesh = object;
  mesh.position.set(0, 0, 0);
  mesh.rotation.y = yaw;
  if (!mesh.parent) scene.add(mesh);
  currentPmxKey = key;
  morphDesired = {};
  morphCurrent = {};
  if (mesh.morphTargetInfluences) mesh.morphTargetInfluences.fill(0);
  // 告诉动作曲线真实的腿长，蹲下/落地时重心才知道该降多少，脚才不会悬空
  const legBone = mesh.skeleton.getBoneByName("右足D") || mesh.skeleton.getBoneByName("右足") || mesh.skeleton.getBoneByName("右腿");
  const kneeBone = mesh.skeleton.getBoneByName("右ひざD") || mesh.skeleton.getBoneByName("右ひざ") || mesh.skeleton.getBoneByName("右膝");
  const ankleBone = mesh.skeleton.getBoneByName("右足首D") || mesh.skeleton.getBoneByName("右足首") || mesh.skeleton.getBoneByName("右脚踝");
  if (legBone && kneeBone && ankleBone) {
    // 子骨骼的 position 是相对父骨骼的偏移，长度即该段骨长
    setLegRig(kneeBone.position.length(), ankleBone.position.length());
  }
  collectClothMats();
  fitCamera();
}

function loadPmxFile(url) {
  return new Promise((resolve, reject) => {
    pmxLoader.load(url, resolve, undefined, reject);
  });
}

function outfitCacheKey(o) {
  if (o && o.pmxUrl) return o.pmxUrl;
  if (o && o.pmx) return o.pmx;
  return "1883";
}

function outfitModelUrl(o) {
  if (o && o.pmxUrl) return o.pmxUrl;
  if (o && o.pmx) return pmxUrl(o.pmx);
  return BASE_PMX;
}

async function showPmx(o) {
  const key = outfitCacheKey(o);
  if (currentPmxKey === key && mesh) return;
  if (meshCache.has(key)) {
    bindMesh(meshCache.get(key), key);
    return;
  }
  const obj = await loadPmxFile(outfitModelUrl(o));
  meshCache.set(key, obj);
  bindMesh(obj, key);
}

async function applyOutfit(index, announce = true) {
  if (!mesh) return;
  const i = ((index % OUTFITS.length) + OUTFITS.length) % OUTFITS.length;
  const o = OUTFITS[i];
  const token = ++outfitToken;
  const needsLoad = outfitCacheKey(o) !== currentPmxKey && !meshCache.has(outfitCacheKey(o));
  let loadingTimer = 0;
  if (needsLoad) {
    loadingTimer = window.setTimeout(() => speak("换衣服中喵…", "blush", 1600), 280);
  }
  try {
    await showPmx(o.pmx || o.pmxUrl ? o : { id: "1883" });
  } catch (err) {
    window.clearTimeout(loadingTimer);
    console.error("pmx outfit failed", outfitCacheKey(o), err);
    if (announce) speak("这套衣服穿不上喵。", "sad");
    return;
  }
  window.clearTimeout(loadingTimer);
  if (token !== outfitToken) return;
  if (!o.pmx && !o.pmxUrl) {
    let tex = baseClothMap || originalClothMap;
    if (o.file) {
      try {
        tex = await loadOutfitTexture(o.file);
      } catch (err) {
        console.error("outfit load failed", o.file, err);
        if (announce) speak("这套衣服找不到喵。", "sad");
        return;
      }
    }
    if (token !== outfitToken) return;
    for (const mat of clothMats) {
      mat.map = tex;
      mat.needsUpdate = true;
    }
  }
  outfitIndex = i;
  try {
    localStorage.setItem("taffy-outfit", o.id);
  } catch {}
  if (outfitMenuOpen) buildOutfitMenu();
  if (announce) speak(o.line, o.emotion || "happy", 2800);
}

function mergeExtraOutfits(extras) {
  if (!Array.isArray(extras) || !extras.length) return;
  const seen = new Set(OUTFITS.map((o) => o.id));
  for (const extra of extras) {
    if (!extra || !extra.id || !extra.pmxUrl || seen.has(extra.id)) continue;
    seen.add(extra.id);
    OUTFITS.push({
      id: extra.id,
      name: extra.name || extra.id,
      pmxUrl: extra.pmxUrl,
      imported: Boolean(extra.imported),
      emotion: extra.emotion || "happy",
      line: extra.line || "换好新衣服了喵！",
    });
  }
}

async function refreshExtraOutfits() {
  if (!window.pet || typeof window.pet.listOutfits !== "function") return;
  try {
    mergeExtraOutfits(await window.pet.listOutfits());
  } catch (err) {
    console.error("list outfits failed", err);
  }
}

async function importOfficialOutfit() {
  if (!window.pet || typeof window.pet.importOutfit !== "function") {
    speak("这版桌宠还不能导入衣服喵。", "sad");
    return;
  }
  speak("选一个带 pmx 的官方模型文件夹喵。", "smile", 2400);
  try {
    const result = await window.pet.importOutfit();
    if (!result || result.error === "cancel") return;
    if (!result.ok || !result.outfit) {
      const msg =
        result && result.error === "no-pmx"
          ? "这个文件夹里没有 pmx 喵。"
          : "导入失败了喵。";
      speak(msg, "sad");
      return;
    }
    mergeExtraOutfits([result.outfit]);
    const i = OUTFITS.findIndex((o) => o.id === result.outfit.id);
    if (i >= 0) await applyOutfit(i);
    else speak("衣服已经放进来了喵。", "happy");
  } catch (err) {
    console.error("import outfit failed", err);
    speak("导入失败了喵。", "sad");
  }
}

async function removeImportedOutfit(id) {
  if (!window.pet || typeof window.pet.removeOutfit !== "function") return;
  try {
    const result = await window.pet.removeOutfit(id);
    if (!result || !result.ok) {
      speak("这套衣服移不走喵。", "sad");
      return;
    }
    const cur = OUTFITS[outfitIndex];
    const gone = OUTFITS.find((o) => o.id === id);
    if (gone && gone.pmxUrl) meshCache.delete(gone.pmxUrl);
    OUTFITS = OUTFITS.filter((o) => o.id !== id);
    if (cur && cur.id === id) await applyOutfit(0);
    else if (outfitMenuOpen) buildOutfitMenu();
    speak("这套导入的衣服拿走了喵。", "smile");
  } catch (err) {
    console.error("remove outfit failed", err);
    speak("这套衣服移不走喵。", "sad");
  }
}

function cycleOutfit(dir) {
  applyOutfit(outfitIndex + dir);
}

function openMenu(x, y) {
  walkWasActiveOnMenuOpen = walker.active;
  noteInteraction();
  closeActionMenu();
  menuEl.hidden = false;
  menuOpen = true;
  placeContextMenu(x, y);
  window.pet.ignoreMouse(false);
}

menuEl.addEventListener("click", (event) => {
  const btn = event.target.closest("button");
  if (!btn) return;
  const act = btn.dataset.act;
  closeMenu();
  if (act === "chat") openChat("chat");
  if (act === "smaller") {
    const i = currentSizeIndex();
    if (i <= 0) speak("已经是最小的喵。", "sad");
    else window.pet.setSize(...SIZE_STEPS[i - 1]);
  }
  if (act === "bigger") {
    const i = currentSizeIndex();
    if (i >= SIZE_STEPS.length - 1) speak("已经是最大的喵。", "surprised");
    else window.pet.setSize(...SIZE_STEPS[i + 1]);
  }
  if (act === "quit") window.pet.quit();
});

actionMenuEl.addEventListener("click", (event) => {
  const btn = event.target.closest("button");
  if (!btn) return;
  const motion = btn.dataset.motion;
  const wasWalking = walkWasActiveOnMenuOpen;
  walkWasActiveOnMenuOpen = false;
  closeActionMenu();
  restartHoverHold();

  if (motion === "idle") {
    stopAllActions();
    setEmotion("idle", 1200, 0.55, false);
    showBubble("先安静待机一会儿喵。", 1800);
  } else if (motion === "spin") {
    stopAllActions();
    startSpin(1);
  } else if (motion === "touch") {
    stopAllActions();
    startGesture("touchFace");
  } else if (motion === "stomp") {
    stopAllActions();
    startStomp();
  } else if (motion === "walk") {
    if (wasWalking) {
      stopWalking();
      showBubble("塔菲停下来啦喵。", 1800);
    } else {
      stopAllActions();
      startWalking({ manual: true });
      showBubble("塔菲去散步啦喵～", 2000);
    }
  }
});

outfitMenuEl.addEventListener("click", (event) => {
  const removeEl = event.target.closest("[data-remove]");
  if (removeEl) {
    event.preventDefault();
    event.stopPropagation();
    closeOutfitMenu();
    removeImportedOutfit(removeEl.dataset.remove);
    return;
  }
  const btn = event.target.closest("button");
  if (!btn) return;
  if (btn.dataset.act === "import") {
    closeOutfitMenu();
    importOfficialOutfit();
    return;
  }
  const i = parseInt(btn.dataset.outfit, 10);
  closeOutfitMenu();
  if (Number.isFinite(i)) applyOutfit(i);
});

// ---------- 自动更新事件 ----------
function showUpdateBubble(text, ms = 6000) {
  showBubble(text, ms);
}
const updateChannels = [
  ["update-available", (v) => showUpdateBubble("发现新版本 v" + v + "，正在下载喵…", 6000)],
  ["update-progress", (p) => {
    if (p % 20 < 5 || p >= 100) showUpdateBubble("正在下载更新 " + p + "% 喵…", 2000);
  }],
  ["update-downloaded", (v) => showUpdateBubble("新版本 v" + v + " 已下载喵！\n托盘图标右键选'安装更新'重启生效，\n或者下次退出时自动安装。", 8000)],
  ["update-none", () => showUpdateBubble("已经是最新版喵。", 4000)],
  ["update-error", () => showUpdateBubble("检查更新失败喵，稍后再试？", 5000)],
];
for (const [ch, fn] of updateChannels) {
  window.pet.onUpdate(ch, fn);
}

// ---------- 托盘菜单命令 ----------
if (window.pet && typeof window.pet.onSettings === "function") {
  window.pet.onSettings((settings) => {
    if (!settings || typeof settings.walkMode !== "boolean") return;
    if (settings.walkMode === walkModeEnabled) return;
    setWalkMode(settings.walkMode, true, false);
  });
}

if (window.pet && typeof window.pet.getSettings === "function") {
  window.pet.getSettings().then((settings) => {
    if (!settings) return;
    if (settings.walkModeSaved) {
      setWalkMode(Boolean(settings.walkMode), false, false);
    } else if (walkModeEnabled) {
      window.pet.setSettings({ walkMode: true }).catch(() => {});
    }
  }).catch(() => {});
}

window.pet.onTrayCommand((msg) => {
  const cmd = typeof msg === "string" ? msg : msg && msg.cmd;
  if (cmd === "set-api-key") openChat("key");
  else if (cmd === "credit") speak(CREDIT, "glasses", 5200);
  else if (cmd === "actions") {
    noteInteraction();
    closeMenu();
    closeOutfitMenu();
    actionMenuEl.hidden = false;
    actionMenuOpen = true;
    placeMenu(actionMenuEl, 16, 48);
    window.pet.ignoreMouse(false);
  }
  else if (cmd === "outfits") openOutfitMenu(16, 48);
  else if (cmd === "apply-outfit") {
    const i = OUTFITS.findIndex((o) => o.id === msg.id);
    if (i >= 0) applyOutfit(i);
  }
  else if (cmd === "play-action") {
    const motion = msg && msg.motion;
    stopAllActions();
    if (motion === "idle") {
      setEmotion("idle", 1200, 0.55, false);
      showBubble("先安静待机一会儿喵。", 1800);
    } else if (motion === "spin") startSpin(1);
    else if (motion === "touch") startGesture("touchFace");
    else if (motion === "stomp") startStomp();
    else if (motion === "walk") startWalking({ manual: true });
  }
  else if (cmd === "walk-mode") setWalkMode(!walkModeEnabled);
  else if (cmd === "top") speak(msg.on ? "会一直站在最上面喵。" : "先不置顶了喵。", msg.on ? "smug" : "sad");
  else if (cmd === "open-settings") {
    if (window.pet && typeof window.pet.openSettings === "function") window.pet.openSettings();
  }
  else if (cmd === "no-feed") showBubble("更新源还没配置喵，等塔菲作者发布新版本就行。", 5000);
  else if (cmd === "no-download") showBubble("没有已下载的更新喵。", 4000);
});

function readAlpha(clientX, clientY) {
  const gl = renderer.getContext();
  const canvas = renderer.domElement;
  const rect = canvas.getBoundingClientRect();
  if (clientX < rect.left || clientX >= rect.right || clientY < rect.top || clientY >= rect.bottom) return 0;
  const ratio = renderer.getPixelRatio();
  const x = Math.max(0, Math.min(gl.drawingBufferWidth - 1, Math.round((clientX - rect.left) * ratio)));
  const y = Math.max(
    0,
    Math.min(gl.drawingBufferHeight - 1, Math.round((rect.bottom - clientY) * ratio))
  );
  const pixel = new Uint8Array(4);
  gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
  return pixel[3];
}

function updateIgnore(clientX, clientY) {
  if (menuOpen || actionMenuOpen || outfitMenuOpen || dragging || chatOpen) {
    window.pet.ignoreMouse(false);
    return;
  }
  // 加载期间：整个窗口保持可交互，按住任意位置即可拖动窗口定位
  // （透明区域此时暂时点不到桌面，加载完成后自动恢复点击穿透）
  if (!loaderEl.hidden) {
    hoverSolid = false;
    hoverSince = 0;
    window.pet.ignoreMouse(false);
    return;
  }
  const overUi = !bubbleEl.hidden;
  const alpha = readAlpha(clientX, clientY);
  const wasHover = hoverSolid;
  hoverSolid = alpha > 12;
  if (hoverSolid && !wasHover) hoverSince = performance.now();
  if (!hoverSolid) hoverSince = 0;
  window.pet.ignoreMouse(!(hoverSolid || overUi));
}

window.addEventListener("pointermove", (event) => {
  const canvas = renderer.domElement.getBoundingClientRect();
  const cw = Math.max(1, canvas.width);
  const ch = Math.max(1, canvas.height);
  lastPointer.nx = ((event.clientX - canvas.left) / cw) * 2 - 1;
  lastPointer.ny = 1 - ((event.clientY - canvas.top) / ch) * 2;
  lastPointer.inside = true;
  if (dragging && lastScreen) {
    const dx = event.screenX - lastScreen.x;
    const dy = event.screenY - lastScreen.y;
    if (Math.abs(dx) + Math.abs(dy) > 2) dragMoved = true;
    window.pet.moveBy(dx, dy);
    lastScreen = { x: event.screenX, y: event.screenY };
    return;
  }
  updateIgnore(event.clientX, event.clientY);
});

window.addEventListener("pointerdown", (event) => {
  if (event.button === 2) return;
  if (menuOpen && !menuEl.contains(event.target)) closeMenu();
  if (actionMenuOpen && !actionMenuEl.contains(event.target)) closeActionMenu();
  if (outfitMenuOpen && !outfitMenuEl.contains(event.target)) closeOutfitMenu();
  // 聊天输入框打开时，点击输入框以外的区域（宠物/空白）直接关闭
  if (chatOpen && !chatbarEl.contains(event.target)) {
    closeChat();
    return;
  }
  const onMenu = menuEl.contains(event.target) || actionMenuEl.contains(event.target) || outfitMenuEl.contains(event.target);
  if (onMenu) return;
  // 加载期间：按下任意位置即启动主进程平滑拖动（传按下点，避免延迟处理错位）。
  // 注意：这里不要再调 ignoreMouse(false)——会触发伪 pointerup 打断拖动，
  // updateIgnore 在加载分支已保证窗口可交互。
  if (!loaderEl.hidden) {
    loaderDragActive = true;
    if (window.pet && typeof window.pet.startDrag === "function") {
      window.pet.startDrag(event.clientX, event.clientY);
    }
    event.preventDefault();
    return;
  }
  const alpha = readAlpha(event.clientX, event.clientY);
  if (alpha <= 12) return;
  noteInteraction();
  dragging = true;
  dragMoved = false;
  lastScreen = { x: event.screenX, y: event.screenY };
  window.pet.ignoreMouse(false);
});

window.addEventListener("pointerup", (event) => {
  if (!dragging) return;
  dragging = false;
  lastScreen = null;
  if (!dragMoved && event.button === 0) onTap();
  else restartHoverHold();
});

window.addEventListener("contextmenu", (event) => {
  event.preventDefault();
  closeActionMenu();
  closeOutfitMenu();
  const alpha = readAlpha(event.clientX, event.clientY);
  if (alpha <= 12 && menuEl.hidden) return;
  openMenu(event.clientX, event.clientY);
  window.pet.ignoreMouse(false);
});

// 加载期间可拖动窗口：由主进程轮询光标平滑跟随，这里只负责起止信号。
// 主进程另有 PowerShell 左键监视兜底，即使这里的 pointerup/移动事件被丢弃也会停止。
window.addEventListener("pointerup", () => {
  if (!loaderDragActive) return;
  loaderDragActive = false;
  if (window.pet && typeof window.pet.endDrag === "function") window.pet.endDrag();
});

// 额外保险：若收到 buttons=0 的移动（已松开但 pointerup 丢失），同样结束拖动
window.addEventListener("pointermove", (event) => {
  if (loaderDragActive && event.buttons === 0) {
    loaderDragActive = false;
    if (window.pet && typeof window.pet.endDrag === "function") window.pet.endDrag();
  }
});

function bone(name) {
  if (!mesh) return null;
  return mesh.skeleton.bones.find((b) => b.name === name) || null;
}

function boneAny(...names) {
  if (!mesh) return null;
  return pickByAliasPriority(mesh.skeleton.bones, names);
}

const legBoneRestPositions = new WeakMap();
function setLegBoneOffset(target, x = 0, y = 0) {
  if (!target) return;
  if (!legBoneRestPositions.has(target)) legBoneRestPositions.set(target, target.position.clone());
  const rest = legBoneRestPositions.get(target);
  target.position.set(rest.x + x, rest.y + y, rest.z);
}

function setMorph(name, value) {
  const idx = morphIndex[name];
  if (idx == null || !mesh.morphTargetInfluences) return;
  mesh.morphTargetInfluences[idx] = value;
}

function activeEmotion(now) {
  if (now < emotion.until) return emotion;
  const idleName = now - lastInteract > 45000 ? "sleepy" : idleEmotionByHour();
  return { name: idleName, until: 0, intensity: idleName === "sleepy" ? 0.62 : 0.42 };
}

function applyEmotionMorphs(now, t) {
  const cur = activeEmotion(now);
  const spec = EMOTIONS[cur.name] || EMOTIONS.idle;
  for (const [name, weight] of Object.entries(spec.morphs)) {
    wantMorph(name, weight * cur.intensity);
  }

  if (hoverSolid && hoverSince && now - hoverSince > 5000 && cur.name !== "angry") {
    wantMorph("照れ", 0.45);
    wantMorph("にこり", 0.35);
    // 被摸久了就害羞地摸摸脸
    if (!hoverGestured) hoverGestured = startGesture("touchFace");
  } else if (!hoverSolid) {
    hoverGestured = false;
  }
  if (dragging) wantMorph("びっくり", 0.35);

  if (now / 1000 > nextMicro && now >= emotion.until && !dragging && !spin.playing && !stomp.playing && !walker.active) {
    const r = Math.random();
    if (r < 0.045) startSpin(1);
    else {
      const pick = MICRO_POOL[Math.floor(Math.random() * MICRO_POOL.length)];
      setEmotion(pick, 1400 + Math.random() * 900, 0.7 + Math.random() * 0.3, false);
    }
    nextMicro = now / 1000 + 12 + Math.random() * 16;
  }

  const lookUp = Math.max(0, -look.x * 2.2);
  const lookDown = Math.max(0, look.x * 2.2);
  if (lookUp > 0.02) wantMorph("上", lookUp);
  if (lookDown > 0.02) wantMorph("下", lookDown);

  const talking = now < talkingUntil;
  if (talking && !MOUTH_HOLD.has(cur.name)) {
    const vi = Math.floor(t * 7.5) % VISEMES.length;
    const w = 0.22 + Math.abs(Math.sin(t * 11)) * 0.5;
    wantMorph(VISEMES[vi], w);
    wantMorph("口", w * 0.55);
  }

  const blinking = now < blinkUntil;
  if (!EYE_LOCK.has(cur.name) || blinking) {
    if (now / 1000 > nextBlink) {
      blinkUntil = now + 130;
      nextBlink = now / 1000 + 2.2 + Math.random() * 3.2;
    }
    if (now < blinkUntil) {
      wantMorph("まばたき", 1);
      wantMorph("眨眼", 1);
      wantMorph("blink", 1);
    }
  }
}

function fitCamera() {
  if (!mesh) return;
  const box = new THREE.Box3().setFromObject(mesh);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const fov = (camera.fov * Math.PI) / 180;
  const half = Math.tan(fov / 2);
  // 模型高度约占窗口 68% 并整体下移，顶部 ~28% 留给对话气泡
  const dist = Math.max((size.y * 0.74) / half, (size.x * 0.5) / half / camera.aspect);
  const focusY = center.y + size.y * 0.18;
  camera.position.set(center.x, focusY, dist);
  camera.lookAt(center.x, focusY + size.y * 0.02, 0);
}

function maybeStartAutoWalk(now) {
  if (!walkModeEnabled) {
    walker.nextAutoAt = Infinity;
    return;
  }
  if (walker.active || now < walker.nextAutoAt) return;
  const state = actionState(now);
  const blocked =
    dragging || hoverSolid || menuOpen || actionMenuOpen || outfitMenuOpen || chatOpen ||
    state.spin || state.gesture || state.stomp;
  if (blocked) {
    scheduleAutoWalk(now);
    return;
  }
  startWalking({ manual: false });
}

// 边界感：靠近墙时头偏向墙看一眼。越近偏得越多，最大约 20°
// 阈值取 40px：按当前步速约 3~7 秒前开始偏头，既不会太早也不会撞上才反应
const WALL_GLANCE_THRESHOLD = 40;
const WALL_GLANCE_MAX = 0.35;
function computeWallGlance() {
  if (!walker.active) return 0;
  const d = walker.distToEdge;
  if (!Number.isFinite(d) || d >= WALL_GLANCE_THRESHOLD) return 0;
  const intensity = 1 - d / WALL_GLANCE_THRESHOLD;
  return intensity * intensity * WALL_GLANCE_MAX * (walker.direction < 0 ? -1 : 1);
}

function updateWalking(now, dt) {
  if (walker.active && !walker.manual && now >= walker.stopAt) stopWalking();
  maybeStartAutoWalk(now);

  const targetBlend = walker.active ? 1 : 0;
  // 被打断时收得比自然停下更快，避免走路姿态糊在下一个动作上
  const blendK = 1 - Math.exp(-dt * (walker.active ? 7 : walker.fading ? 16 : 9));
  walker.blend += (targetBlend - walker.blend) * blendK;
  if (!walker.active && walker.blend < 0.001) {
    walker.blend = 0;
    walker.fading = false;
  }

  const targetYaw = facingYawForDirection(walker.direction, walker.blend);
  const yawK = 1 - Math.exp(-dt * 8);
  walker.facingYaw += (targetYaw - walker.facingYaw) * yawK;

  // 边界感：头偏向墙的方向看（lerp 平滑，避免步进抖动）
  const targetGlance = computeWallGlance();
  const glanceK = 1 - Math.exp(-dt * 5);
  walker.glanceY += (targetGlance - walker.glanceY) * glanceK;

  if (
    walker.active &&
    !walker.stepPending &&
    now - walker.lastStepAt >= 33 &&
    window.pet &&
    typeof window.pet.walkStep === "function"
  ) {
    const elapsed = Math.min(120, Math.max(33, now - walker.lastStepAt));
    walker.lastStepAt = now;
    walker.stepPending = true;
    // 位移与步频挂钩（2.2 步/秒），步幅才不会随步频变化而打滑
    Promise.resolve(window.pet.walkStep(walker.direction, elapsed * 0.034))
      .then((result) => {
        if (result && (result.direction === -1 || result.direction === 1)) {
          const hitEdge = result.hitEdge === true;
          walker.direction = result.direction;
          if (Number.isFinite(result.distToEdge)) walker.distToEdge = result.distToEdge;
          if (hitEdge) bounceOffWall();
        }
      })
      .catch((err) => console.warn("walk step failed", err))
      .finally(() => {
        walker.stepPending = false;
      });
  }

  return sampleWalkMotion((now - walker.startedAt) / 1000, walker.blend);
}

function tick() {
  requestAnimationFrame(tick);
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.getElapsedTime();
  const now = performance.now();

  if (mesh) {
    const cur = activeEmotion(now);
    const pose = EMOTION_POSE[cur.name] || {};
    const idleMotion = sampleIdleMotion(t);
    const stompProgress = stomp.playing
      ? Math.min(1, (now - stomp.start) / stomp.duration)
      : 1;
    const stompMotion = sampleStompMotion(stompProgress);
    if (stomp.playing && stompProgress >= 1) stomp.playing = false;
    const walkMotion = updateWalking(now, dt);
    const pk = 1 - Math.exp(-dt * 8);
    poseCur.headX += ((pose.headX || 0) - poseCur.headX) * pk;
    poseCur.headY += ((pose.headY || 0) - poseCur.headY) * pk;
    poseCur.headZ += ((pose.headZ || 0) - poseCur.headZ) * pk;
    poseCur.upperX += ((pose.upperX || 0) - poseCur.upperX) * pk;
    poseCur.bounce += ((pose.bounce || 0) - poseCur.bounce) * pk;
    poseCur.armR += ((pose.armR || 0) - poseCur.armR) * pk;
    poseCur.armL += ((pose.armL || 0) - poseCur.armL) * pk;
    poseCur.elbow += ((pose.elbow || 0) - poseCur.elbow) * pk;

    const head = bone("頭") || bone("头") || bone("Head");
    const neck = bone("首");
    const upper = bone("上半身");
    const center = bone("センター") || bone("センター2");
    const armR = bone("右腕D");
    const armL = bone("左腕D");
    const elbowR = bone("右ひじD");
    const elbowL = bone("左ひじD");
    const shoulderR = bone("右肩D");
    const shoulderL = bone("左肩D");
    // The bundled PMX variants skin their visible leg vertices to D-bones.
    const legR = boneAny("右足D", "右足", "右腿", "RightLeg");
    const legL = boneAny("左足D", "左足", "左腿", "LeftLeg");
    const kneeR = boneAny("右ひざD", "右ひざ", "右膝", "RightKnee");
    const kneeL = boneAny("左ひざD", "左ひざ", "左膝", "LeftKnee");
    const ankleR = boneAny("右足首D", "右足首", "右脚踝", "RightAnkle");
    const ankleL = boneAny("左足首D", "左足首", "左脚踝", "LeftAnkle");

    const spinMotion = updateSpin(now);
    // 转圈被中断后朝向继续转回正面，而不是硬切回 0
    if (!spin.playing && Math.abs(spin.yaw) > 1e-4) {
      spin.yaw *= Math.exp(-dt * 7);
      if (Math.abs(spin.yaw) < 1e-4) spin.yaw = 0;
    }
    if (!spin.playing && mesh) mesh.rotation.y = walker.facingYaw + spin.yaw;
    const lookTargetY = (hoverSolid || dragging) && !spin.playing ? lastPointer.nx * 0.38 : 0;
    const lookTargetX = (hoverSolid || dragging) && !spin.playing ? lastPointer.ny * -0.16 : 0;
    const lk = 1 - Math.exp(-dt * 6);
    look.y += (lookTargetY - look.y) * lk;
    look.x += (lookTargetX - look.x) * lk;

    // 手势进度：使用带缓入、停留和回收的动作曲线。
    let gEnv = 0;
    let gSpec = null;
    let gestureMotion = sampleTouchFaceMotion(1);
    if (gesture.name && now < gesture.start + gesture.duration) {
      gSpec = GESTURES[gesture.name] || null;
      if (gSpec) {
        const gp = Math.max(0, Math.min(1, (now - gesture.start) / gesture.duration));
        gestureMotion = sampleTouchFaceMotion(gp);
        gEnv = gestureMotion.weight;
      }
    } else if (gesture.name) {
      gesture.name = "";
    }

    const lower = bone("下半身");
    if (upper) {
      upper.rotation.z = idleMotion.bodyZ + spinMotion.bodyX + gestureMotion.bodyZ + walkMotion.bodyZ + stompMotion.bodyZ;
      upper.rotation.x = idleMotion.breath + idleMotion.bodyX + poseCur.upperX + spinMotion.bodyZ + walkMotion.bodyX + stompMotion.bodyX + (gestureMotion.bodyX || 0) + stompMotion.impact * 0.025;
      upper.rotation.y = (walkMotion.upperY || 0) + (stompMotion.upperY || 0);
    }
    if (lower) lower.rotation.y = (walkMotion.lowerY || 0) + (stompMotion.lowerY || 0);
    if (head) {
      head.rotation.y = idleMotion.headY + look.y + poseCur.headY + (gestureMotion.headY || 0) + (walkMotion.headY || 0) + walker.glanceY;
      head.rotation.z = idleMotion.headZ + poseCur.headZ + spinMotion.bodyX * 0.45 + gestureMotion.headZ + stompMotion.headZ;
      head.rotation.x = idleMotion.headX + look.x + poseCur.headX + gestureMotion.headX + stompMotion.headX + (walkMotion.headX || 0);
    }
    if (neck) neck.rotation.x = idleMotion.breath * 0.6 + look.x * 0.35 + gestureMotion.headX * 0.3;

    // 基础手臂姿态（情绪抬手 / 转圈张臂 / 空闲甩胳膊）
    const raiseR = Math.max(poseCur.armR, spinMotion.armOpen * 0.82);
    const raiseL = Math.max(poseCur.armL, spinMotion.armOpen * 0.82);
    const talkDamp = now < talkingUntil ? 0.2 : 1;
    const swingDamp = 1 - Math.min(1, ((raiseR + raiseL) / 2) * 1.5);
    // 站立时手臂自然下垂（MMD A-pose 张得太开，像"飞机手"）；转圈张臂时让位给 armOpen
    const armDrop = 0.62 * (1 - spinMotion.armOpen);
    const baseArmR = {
      x: idleMotion.armR * talkDamp * swingDamp + idleMotion.breath * 0.6 + walkMotion.armR + stompMotion.armR,
      y: 0,
      z: -raiseR * 1.15 + armDrop,
    };
    const baseArmL = {
      x: idleMotion.armL * talkDamp * swingDamp + idleMotion.breath * 0.6 + walkMotion.armL + stompMotion.armL,
      y: 0,
      z: raiseL * 1.15 - armDrop,
    };
    const baseElbowR = { x: -poseCur.elbow - spinMotion.armOpen * 0.25 - (walkMotion.elbowR || 0), y: 0, z: 0 };
    const baseElbowL = { x: -poseCur.elbow - spinMotion.armOpen * 0.25 - (walkMotion.elbowL || 0), y: 0, z: 0 };

    const blendPose = (base, target, weight) => {
      if (!target || weight <= 0) return base;
      return {
        x: base.x * (1 - weight) + target.x * weight,
        y: base.y * (1 - weight) + target.y * weight,
        z: base.z * (1 - weight) + target.z * weight,
      };
    };

    const activeArmR = baseArmR;
    const activeArmL = baseArmL;
    const activeElbowR = baseElbowR;
    const activeElbowL = baseElbowL;

    // 手势目标（运行时由 IK 从目标点反解出角度）
    let gArmR = null, gArmL = null, gElbowR = null, gElbowL = null;
    if (gSpec) {
      const t = GESTURE_TARGETS[gesture.name];
      if (t) {
        const targetVec = new THREE.Vector3(
          t.x + gestureMotion.targetXOffset,
          t.y + gestureMotion.targetYOffset,
          t.z
        );
        if (gSpec.arms === "right" || gSpec.arms === "both") {
          const r = solveArmIK("R", targetVec);
          gArmR = { x: r.upperEuler.x, y: r.upperEuler.y, z: r.upperEuler.z };
          gElbowR = { x: r.elbowEuler.x, y: r.elbowEuler.y, z: r.elbowEuler.z };
        }
        if (gSpec.arms === "both") {
          const l = solveArmIK("L", targetVec);
          gArmL = { x: l.upperEuler.x, y: l.upperEuler.y, z: l.upperEuler.z };
          gElbowL = { x: l.elbowEuler.x, y: l.elbowEuler.y, z: l.elbowEuler.z };
        }
      }
    }
    const mix = (base, g) => {
      return blendPose(base, g, gEnv);
    };

    if (armR) {
      const r = mix(activeArmR, gArmR);
      armR.rotation.x = r.x; armR.rotation.y = r.y; armR.rotation.z = r.z;
    }
    if (armL) {
      const r = mix(activeArmL, gArmL);
      armL.rotation.x = r.x; armL.rotation.y = r.y; armL.rotation.z = r.z;
    }
    if (elbowR) {
      const r = mix(activeElbowR, gElbowR);
      elbowR.rotation.x = r.x; elbowR.rotation.y = r.y; elbowR.rotation.z = r.z;
    }
    if (elbowL) {
      const r = mix(activeElbowL, gElbowL);
      elbowL.rotation.x = r.x; elbowL.rotation.y = r.y; elbowL.rotation.z = r.z;
    }
    if (shoulderR) shoulderR.rotation.z = -spinMotion.armOpen * 0.1;
    if (shoulderL) shoulderL.rotation.z = spinMotion.armOpen * 0.1;
    if (legR) {
      legR.rotation.x = walkMotion.legR + stompMotion.legR + (spinMotion.legR || 0);
      legR.rotation.z = walkMotion.legRZ + stompMotion.legRZ + (spinMotion.legRZ || 0);
      setLegBoneOffset(legR, walkMotion.legRX + stompMotion.legRX, walkMotion.legRY + stompMotion.legRY);
    }
    if (legL) {
      legL.rotation.x = walkMotion.legL + stompMotion.legL + (spinMotion.legL || 0);
      legL.rotation.z = walkMotion.legLZ + stompMotion.legLZ;
      setLegBoneOffset(legL, walkMotion.legLX + stompMotion.legLX, walkMotion.legLY + stompMotion.legLY);
    }
    if (kneeR) kneeR.rotation.x = walkMotion.kneeR + stompMotion.kneeR + (spinMotion.kneeR || 0);
    if (kneeL) kneeL.rotation.x = walkMotion.kneeL + stompMotion.kneeL + (spinMotion.kneeL || 0);
    if (ankleR) ankleR.rotation.x = walkMotion.footR + stompMotion.footR + (spinMotion.footR || 0);
    if (ankleL) ankleL.rotation.x = walkMotion.footL + stompMotion.footL + (spinMotion.footL || 0);

    if (center) {
      const emotionBounce = poseCur.bounce * Math.max(0, Math.sin(t * 5.6)) ** 2 * 0.1;
      const bounce = idleMotion.centerY + emotionBounce + spinMotion.centerY + walkMotion.centerY + stompMotion.centerY;
      center.position.y = bounce;
      center.position.x = walkMotion.centerX + stompMotion.centerX;
    }

    applyEmotionMorphs(now, t);
    flushMorphs(dt);

    mesh.skeleton.bones.forEach((b) => b.updateMatrixWorld());
  }

  renderer.setRenderTarget(colorTarget);
  renderer.setClearColor(CHROMA, 1);
  renderer.clear();
  renderer.render(scene, camera);

  renderer.setRenderTarget(null);
  renderer.setClearColor(0x000000, 0);
  renderer.clear();
  renderer.render(quadScene, quadCam);
}

window.addEventListener("resize", () => {
  layoutPetView();
});
resizeTargets();

setLoaderStatus("正在检查小菲的模型喵…");
setLoaderProgress(0);
pmxLoader.load(
  BASE_PMX,
  (object) => {
    meshCache.set("1883", object);
    bindMesh(object, "1883");
    baseClothMap = originalClothMap;
    if (!clothMats.length) console.warn("taffy: no cloth materials found, outfits disabled");
    const usedMorphs = new Set(["まばたき", "眨眼", "blink", "口", "上", "下", ...VISEMES]);
    for (const spec of Object.values(EMOTIONS)) {
      for (const name of Object.keys(spec.morphs)) usedMorphs.add(name);
    }
    const missing = [...usedMorphs].filter((n) => morphIndex[n] == null);
    if (missing.length) console.warn("taffy missing morphs", missing);

    refreshExtraOutfits().then(() => {
      let savedOutfit = 0;
      try {
        const sid = localStorage.getItem("taffy-outfit");
        const found = OUTFITS.findIndex((o) => o.id === sid);
        if (found >= 0) savedOutfit = found;
      } catch {}
      if (savedOutfit !== 0) applyOutfit(savedOutfit, false);
    });
  },
  undefined,
  (err) => {
    console.error("pmx error", err && err.message ? err.message : err);
    setLoaderError("模型没钻出来喵，看看 借物.txt 和 models 文件夹。");
  }
);
