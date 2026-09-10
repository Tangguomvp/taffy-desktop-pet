import * as THREE from "three";
import { MMDLoader } from "three/addons/loaders/MMDLoader.js";
import {
  facingYawForDirection,
  pickByAliasPriority,
  sampleIdleMotion,
  sampleSpinMotion,
  sampleStompMotion,
  sampleTouchFaceMotion,
  sampleWalkMotion,
  setLegRig,
} from "./motion.mjs";

const mode = new URLSearchParams(location.search).get("mode") === "outfits" ? "outfits" : "actions";
const titleEl = document.getElementById("title");
const hintEl = document.getElementById("hint");
const listEl = document.getElementById("list");
const applyEl = document.getElementById("apply");
const importEl = document.getElementById("importOutfit");
const statusEl = document.getElementById("status");
const labelEl = document.getElementById("label");
const stageEl = document.getElementById("stage");

titleEl.textContent = mode === "outfits" ? "换装预览" : "动作预览";
hintEl.textContent = mode === "outfits"
  ? "点一套衣服先看效果，再点穿上才会换到桌宠。"
  : "点一个动作先看预览，再点用到桌宠上。";
applyEl.textContent = mode === "outfits" ? "穿上这套" : "让小菲做这个";
importEl.hidden = mode !== "outfits";

const ACTIONS = [
  { id: "idle", name: "自然待机" },
  { id: "spin", name: "张臂转圈软着陆" },
  { id: "touch", name: "害羞摸脸" },
  { id: "stomp", name: "跺脚" },
  { id: "walk", name: "走动" },
];

const BUILTIN_OUTFITS = [
  { id: "1883", name: "1883 藏青" },
  { id: "green", name: "四叶草绿", file: "outfits/green.png" },
  { id: "sky", name: "晴空蓝", file: "outfits/sky.png" },
  { id: "mist", name: "雾蓝", file: "outfits/mist.png" },
  { id: "white", name: "纯白礼服", file: "outfits/white.png" },
  { id: "nurse", name: "JK 水手服", pmx: "nurse" },
  { id: "outing", name: "JSK 郊游裙", pmx: "outing" },
  { id: "maid", name: "洛丽塔女仆", pmx: "maid" },
  { id: "xmas", name: "洛丽塔圣诞", pmx: "xmas" },
];

const TEX_BASE = new URL("../models/taffy1883/tex/", import.meta.url).href;
const BASE_PMX = new URL("../models/taffy1883/taffy.pmx", import.meta.url).href;
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

let outfits = BUILTIN_OUTFITS.slice();
let selected = mode === "outfits" ? "1883" : "idle";
let mesh = null;
let clothMats = [];
let originalClothMap = null;
let baseClothMap = null;
const meshCache = new Map();
const texCache = new Map();
let currentPmxKey = "1883";
let actionStart = 0;
const clock = new THREE.Clock();

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
stageEl.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.add(new THREE.AmbientLight(0xfff4ea, 0.95));
scene.add(new THREE.HemisphereLight(0xffe8d8, 0x7a5360, 1.25));
const key = new THREE.DirectionalLight(0xfff3e8, 1.7);
key.position.set(-6, 18, 14);
scene.add(key);
const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 1000);

const loader = new THREE.LoadingManager();
const pmxLoader = new MMDLoader(loader);

function setStatus(text) {
  statusEl.textContent = text || "";
}

function boneAny(...names) {
  if (!mesh) return null;
  return pickByAliasPriority(mesh.skeleton.bones, names);
}

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
  const qu = new THREE.Quaternion().setFromUnitVectors(arm.upperDir, elbowPos.clone().sub(arm.shoulder).normalize());
  const upperEuler = new THREE.Euler().setFromQuaternion(qu, "XYZ");
  const foreTargetLocal = targetVec.clone().sub(elbowPos).normalize().applyQuaternion(qu.clone().invert());
  const qe = new THREE.Quaternion().setFromUnitVectors(arm.foreDir, foreTargetLocal);
  return { upperEuler, elbowEuler: new THREE.Euler().setFromQuaternion(qe, "XYZ") };
}

function fitCamera() {
  if (!mesh) return;
  const box = new THREE.Box3().setFromObject(mesh);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const fov = (camera.fov * Math.PI) / 180;
  const half = Math.tan(fov / 2);
  const dist = Math.max((size.y * 0.72) / half, (size.x * 0.55) / half / camera.aspect);
  camera.position.set(center.x, center.y + size.y * 0.12, dist);
  camera.lookAt(center.x, center.y + size.y * 0.08, 0);
}

function resize() {
  const w = Math.max(1, stageEl.clientWidth);
  const h = Math.max(1, stageEl.clientHeight);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  fitCamera();
}

function collectClothMats() {
  if (!mesh) {
    clothMats = [];
    originalClothMap = null;
    return;
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
  if (mesh && mesh !== object) scene.remove(mesh);
  mesh = object;
  mesh.position.set(0, 0, 0);
  mesh.rotation.y = 0;
  if (!mesh.parent) scene.add(mesh);
  currentPmxKey = key;
  const legBone = boneAny("右足D", "右足", "右腿", "RightLeg");
  const kneeBone = boneAny("右ひざD", "右ひざ", "右膝", "RightKnee");
  const ankleBone = boneAny("右足首D", "右足首", "右脚踝", "RightAnkle");
  if (legBone && kneeBone && ankleBone) setLegRig(kneeBone.position.length(), ankleBone.position.length());
  collectClothMats();
  fitCamera();
}

function loadPmx(url) {
  return new Promise((resolve, reject) => pmxLoader.load(url, resolve, undefined, reject));
}

function loadTex(file) {
  if (texCache.has(file)) return Promise.resolve(texCache.get(file));
  return new Promise((resolve, reject) => {
    new THREE.TextureLoader().load(TEX_BASE + file, (tex) => {
      tex.colorSpace = originalClothMap ? originalClothMap.colorSpace : THREE.SRGBColorSpace;
      tex.needsUpdate = true;
      texCache.set(file, tex);
      resolve(tex);
    }, undefined, reject);
  });
}

function outfitKey(o) {
  if (o.pmxUrl) return o.pmxUrl;
  if (o.pmx) return o.pmx;
  return "1883";
}

function outfitUrl(o) {
  if (o.pmxUrl) return o.pmxUrl;
  if (o.pmx) return new URL(`../models/pmx/${o.pmx}/taffy.pmx`, import.meta.url).href;
  return BASE_PMX;
}

async function showOutfit(o) {
  const key = outfitKey(o);
  if (currentPmxKey !== key || !mesh) {
    if (!meshCache.has(key)) meshCache.set(key, await loadPmx(outfitUrl(o)));
    bindMesh(meshCache.get(key), key);
  }
  if (!o.pmx && !o.pmxUrl) {
    let tex = baseClothMap || originalClothMap;
    if (o.file) tex = await loadTex(o.file);
    for (const mat of clothMats) {
      mat.map = tex;
      mat.needsUpdate = true;
    }
  }
}

function selectedOutfit() {
  return outfits.find((o) => o.id === selected) || outfits[0];
}

function selectedAction() {
  return ACTIONS.find((a) => a.id === selected) || ACTIONS[0];
}

function paintList() {
  const items = mode === "outfits" ? outfits : ACTIONS;
  listEl.innerHTML = "";
  for (const item of items) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = item.name;
    if (item.id === selected) btn.classList.add("active");
    btn.addEventListener("click", () => pick(item.id));
    listEl.appendChild(btn);
  }
}

async function pick(id) {
  selected = id;
  paintList();
  actionStart = performance.now();
  if (mode === "outfits") {
    const o = selectedOutfit();
    labelEl.textContent = o.name;
    setStatus("正在换上预览…");
    try {
      await showOutfit(o);
      setStatus("");
    } catch (err) {
      console.error(err);
      setStatus("这套衣服预览失败喵。");
    }
  } else {
    labelEl.textContent = selectedAction().name;
  }
}

function applyToPet() {
  if (!window.pet) return;
  if (mode === "outfits") {
    window.pet.studioApplyOutfit(selectedOutfit().id);
    setStatus("已经让桌宠换上这套了喵。");
  } else {
    window.pet.studioPlayAction(selectedAction().id);
    setStatus("已经让桌宠做这个动作了喵。");
  }
}

function actionPose(now) {
  const idle = sampleIdleMotion(clock.getElapsedTime());
  const kind = selected;
  let spin = sampleSpinMotion(0);
  let touch = sampleTouchFaceMotion(1);
  let stomp = sampleStompMotion(1);
  let walk = sampleWalkMotion(0, 0);
  let facing = 0;
  if (kind === "spin") {
    const u = Math.min(1, (now - actionStart) / 1400);
    spin = sampleSpinMotion(u);
    facing = spin.turns * Math.PI * 2;
    if (u >= 1) {
      selected = "idle";
      labelEl.textContent = "自然待机";
    }
  } else if (kind === "touch") {
    const u = Math.min(1, (now - actionStart) / 3600);
    touch = sampleTouchFaceMotion(u);
    if (u >= 1) {
      selected = "idle";
      labelEl.textContent = "自然待机";
    }
  } else if (kind === "stomp") {
    const u = Math.min(1, (now - actionStart) / 1000);
    stomp = sampleStompMotion(u);
    if (u >= 1) {
      selected = "idle";
      labelEl.textContent = "自然待机";
    }
  } else if (kind === "walk") {
    walk = sampleWalkMotion((now - actionStart) / 1000, 1);
    facing = facingYawForDirection(-1, 1);
  }
  if (kind !== selected) paintList();
  return { idle, spin, touch, stomp, walk, facing, kind };
}

function tick() {
  requestAnimationFrame(tick);
  if (!mesh) return;
  const now = performance.now();
  const pose = mode === "actions" ? actionPose(now) : {
    idle: sampleIdleMotion(clock.getElapsedTime()),
    spin: sampleSpinMotion(0),
    touch: sampleTouchFaceMotion(1),
    stomp: sampleStompMotion(1),
    walk: sampleWalkMotion(0, 0),
    facing: 0,
    kind: "idle",
  };
  const { idle, spin, touch, stomp, walk, facing, kind } = pose;
  const head = boneAny("頭", "头", "Head");
  const neck = boneAny("首");
  const upper = boneAny("上半身");
  const lower = boneAny("下半身");
  const center = boneAny("センター", "センター2");
  const armR = boneAny("右腕D");
  const armL = boneAny("左腕D");
  const elbowR = boneAny("右ひじD");
  const elbowL = boneAny("左ひじD");
  const shoulderR = boneAny("右肩D");
  const shoulderL = boneAny("左肩D");
  const legR = boneAny("右足D", "右足", "右腿", "RightLeg");
  const legL = boneAny("左足D", "左足", "左腿", "LeftLeg");
  const kneeR = boneAny("右ひざD", "右ひざ", "右膝", "RightKnee");
  const kneeL = boneAny("左ひざD", "左ひざ", "左膝", "LeftKnee");
  const ankleR = boneAny("右足首D", "右足首", "右脚踝", "RightAnkle");
  const ankleL = boneAny("左足首D", "左足首", "左脚踝", "LeftAnkle");

  mesh.rotation.y = facing;
  if (upper) {
    upper.rotation.z = idle.bodyZ + spin.bodyX + touch.bodyZ + walk.bodyZ + stomp.bodyZ;
    upper.rotation.x = idle.breath + idle.bodyX + spin.bodyZ + walk.bodyX + stomp.bodyX + stomp.impact * 0.025;
    upper.rotation.y = (walk.upperY || 0) + (stomp.upperY || 0);
  }
  if (lower) lower.rotation.y = (walk.lowerY || 0) + (stomp.lowerY || 0);
  if (head) {
    head.rotation.x = idle.headX + touch.headX + stomp.headX + (walk.headX || 0);
    head.rotation.y = idle.headY + (touch.headY || 0) + (walk.headY || 0);
    head.rotation.z = idle.headZ + spin.bodyX * 0.45 + touch.headZ + stomp.headZ;
  }
  if (neck) neck.rotation.x = idle.breath * 0.6 + touch.headX * 0.3;
  if (center) {
    center.position.x = walk.centerX + stomp.centerX;
    center.position.y = idle.centerY + spin.centerY + walk.centerY + stomp.centerY;
  }

  const armDrop = 0.62 * (1 - spin.armOpen);
  if (kind === "touch" && armR) {
    const t = new THREE.Vector3(-0.5 + touch.targetXOffset, 10.8 + touch.targetYOffset, 1.72);
    const solved = solveArmIK("R", t);
    const w = touch.weight || 0;
    armR.rotation.set(
      armR.rotation.x * (1 - w) + solved.upperEuler.x * w,
      solved.upperEuler.y * w,
      -armDrop * (1 - w) + solved.upperEuler.z * w
    );
    if (elbowR) elbowR.rotation.set(solved.elbowEuler.x * w, solved.elbowEuler.y * w, solved.elbowEuler.z * w);
    if (armL) {
      armL.rotation.x = idle.armL;
      armL.rotation.z = -armDrop;
    }
  } else {
    if (armR) {
      armR.rotation.x = idle.armR + walk.armR + stomp.armR;
      armR.rotation.y = 0;
      armR.rotation.z = -spin.armOpen * 0.94 + armDrop;
    }
    if (armL) {
      armL.rotation.x = idle.armL + walk.armL + stomp.armL;
      armL.rotation.y = 0;
      armL.rotation.z = spin.armOpen * 0.94 - armDrop;
    }
    if (elbowR) elbowR.rotation.set(-spin.armOpen * 0.25 - (walk.elbowR || 0), 0, 0);
    if (elbowL) elbowL.rotation.set(-spin.armOpen * 0.25 - (walk.elbowL || 0), 0, 0);
  }
  if (shoulderR) shoulderR.rotation.z = -spin.armOpen * 0.1;
  if (shoulderL) shoulderL.rotation.z = spin.armOpen * 0.1;
  if (legR) {
    legR.rotation.x = walk.legR + stomp.legR + (spin.legR || 0);
    legR.rotation.z = walk.legRZ + stomp.legRZ + (spin.legRZ || 0);
  }
  if (legL) {
    legL.rotation.x = walk.legL + stomp.legL + (spin.legL || 0);
    legL.rotation.z = walk.legLZ + stomp.legLZ;
  }
  if (kneeR) kneeR.rotation.x = walk.kneeR + stomp.kneeR + (spin.kneeR || 0);
  if (kneeL) kneeL.rotation.x = walk.kneeL + stomp.kneeL + (spin.kneeL || 0);
  if (ankleR) ankleR.rotation.x = (walk.footR || 0) + (stomp.footR || 0) + (spin.footR || 0);
  if (ankleL) ankleL.rotation.x = (walk.footL || 0) + (stomp.footL || 0) + (spin.footL || 0);

  mesh.skeleton.bones.forEach((b) => b.updateMatrixWorld());
  renderer.setClearColor(0x000000, 0);
  renderer.render(scene, camera);
}

async function refreshOutfits() {
  outfits = BUILTIN_OUTFITS.slice();
  if (window.pet && typeof window.pet.listOutfits === "function") {
    try {
      const extras = await window.pet.listOutfits();
      const seen = new Set(outfits.map((o) => o.id));
      for (const extra of extras || []) {
        if (!extra || !extra.id || !extra.pmxUrl || seen.has(extra.id)) continue;
        outfits.push({
          id: extra.id,
          name: extra.name || extra.id,
          pmxUrl: extra.pmxUrl,
          imported: true,
        });
        seen.add(extra.id);
      }
    } catch (err) {
      console.warn(err);
    }
  }
  if (!outfits.some((o) => o.id === selected)) selected = outfits[0].id;
  paintList();
}

applyEl.addEventListener("click", applyToPet);
importEl.addEventListener("click", async () => {
  if (!window.pet || typeof window.pet.importOutfit !== "function") return;
  setStatus("选一个带 pmx 的官方模型文件夹喵。");
  try {
    const result = await window.pet.importOutfit();
    if (!result || result.error === "cancel") {
      setStatus("");
      return;
    }
    if (!result.ok) {
      setStatus(result.error === "no-pmx" ? "这个文件夹里没有 pmx 喵。" : "导入失败了喵。");
      return;
    }
    await refreshOutfits();
    if (result.outfit && result.outfit.id) await pick(result.outfit.id);
    setStatus("衣服已经放进来了喵。");
  } catch (err) {
    console.error(err);
    setStatus("导入失败了喵。");
  }
});

window.addEventListener("resize", resize);

setStatus("正在加载小菲喵…");
paintList();
loadPmx(BASE_PMX).then(async (object) => {
  meshCache.set("1883", object);
  bindMesh(object, "1883");
  baseClothMap = originalClothMap;
  resize();
  if (mode === "outfits") await refreshOutfits();
  const saved = (() => {
    try { return localStorage.getItem("taffy-outfit"); } catch { return null; }
  })();
  if (mode === "outfits" && saved && outfits.some((o) => o.id === saved)) await pick(saved);
  else await pick(selected);
  setStatus("");
  tick();
}).catch((err) => {
  console.error(err);
  setStatus("模型没钻出来喵。");
});
