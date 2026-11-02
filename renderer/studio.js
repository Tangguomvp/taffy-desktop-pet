import * as THREE from "three";
import { MMDLoader } from "three/addons/loaders/MMDLoader.js";
import { pickByAliasPriority, setLegRig } from "./motion.mjs";
import { ACTIONS, actionById } from "./actions.mjs";
import { applyMotionPose, sampleActionPose } from "./pose.mjs";

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
  const pose = sampleActionPose(selectedAction(), (now - actionStart) / 1000, clock.getElapsedTime());
  if (pose.finished && selected !== "idle") {
    selected = "idle";
    paintList();
    labelEl.textContent = "自然待机";
  }
  return pose;
}

function tick() {
  requestAnimationFrame(tick);
  if (!mesh) return;
  const now = performance.now();
  const pose = mode === "actions"
    ? actionPose(now)
    : sampleActionPose(null, 0, clock.getElapsedTime());
  applyMotionPose(mesh, pose);
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
