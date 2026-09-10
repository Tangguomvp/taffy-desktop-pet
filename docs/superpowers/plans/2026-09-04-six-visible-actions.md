# Six Visible Actions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement six obvious, directly triggerable full-body actions, including foot stomping and true edge-aware desktop walking.

**Architecture:** Keep animation curves in `renderer/motion.mjs`, add Electron-independent edge clamping in `window-motion.cjs`, and let `renderer/pet.js` coordinate actions, bones, and window movement through a bounded IPC method. The HTML menu exposes every action, while the existing preview loads the same curve functions against all bundled PMX outfits.

**Tech Stack:** Electron 35, Three.js 0.170, MMD/PMX, browser ES modules, Node.js built-in test runner.

**Spec:** `docs/superpowers/specs/2026-09-04-six-visible-actions-design.md`

## Global Constraints

- Preserve the existing character identity, proportions, hairstyle, clothing, textures, and model files.
- Add no text to generated character imagery, watermark, new character, or new prop.
- `start.bat` remains the supported development launcher.
- Discrete actions never overlap; any user interaction cancels automatic walking.
- Missing optional lower-body bones must not crash rendering.

---

### Task 1: Pure stomp, walk, and action-arbitration behavior

**Files:**
- Modify: `tests/motion.test.mjs`
- Modify: `renderer/motion.mjs`

**Interfaces:**
- Consumes: Existing `phaseEnvelope(progress)` and motion samplers.
- Produces: `sampleStompMotion(progress)`, `sampleWalkMotion(seconds, strength)`, and extended `canStartAction(active, requested)`.

- [ ] **Step 1: Write failing stomp and walk tests**

```js
test("stomp raises the right foot, strikes, and returns every channel to rest", () => {
  const raised = sampleStompMotion(0.24);
  const strike = sampleStompMotion(0.56);
  const rest = sampleStompMotion(1);
  assert.ok(raised.legR < -0.25);
  assert.ok(raised.kneeR > 0.35);
  assert.ok(strike.impact > 0.8);
  for (const value of Object.values(rest)) near(value, 0);
});

test("walk alternates opposite limbs and preserves foot contact phases", () => {
  const a = sampleWalkMotion(0, 1);
  const b = sampleWalkMotion(0.5, 1);
  assert.ok(a.legR * b.legR < 0);
  assert.ok(a.armR * a.legR < 0);
  assert.ok(a.centerY >= 0 && b.centerY >= 0);
});
```

- [ ] **Step 2: Run the motion tests and verify RED**

Run: `node --test tests/motion.test.mjs`

Expected: FAIL because `sampleStompMotion` and `sampleWalkMotion` are not exported.

- [ ] **Step 3: Implement minimal pure samplers and arbitration**

```js
export function sampleWalkMotion(seconds, strength = 1) {
  const amount = clamp01(strength);
  const phase = (Number(seconds) || 0) * Math.PI * 3.6;
  const step = Math.sin(phase);
  const liftR = Math.max(0, -step);
  const liftL = Math.max(0, step);
  return {
    centerY: Math.abs(Math.sin(phase)) * 0.12 * amount,
    bodyX: Math.cos(phase) * 0.035 * amount,
    bodyZ: step * 0.045 * amount,
    legR: step * 0.48 * amount,
    legL: -step * 0.48 * amount,
    kneeR: liftR * 0.62 * amount,
    kneeL: liftL * 0.62 * amount,
    ankleR: liftR * -0.2 * amount,
    ankleL: liftL * -0.2 * amount,
    armR: -step * 0.34 * amount,
    armL: step * 0.34 * amount,
  };
}
```

Implement `sampleStompMotion` as raise, hold, strike, recoil, and settle phases with zero-valued output at progress 1. Extend arbitration to include `stomp` and `walk`, with only `walk` allowed when no discrete action is active.

- [ ] **Step 4: Run the motion suite and verify GREEN**

Run: `node --test tests/motion.test.mjs`

Expected: all motion tests pass with no warning or error output.

### Task 2: Edge-aware window movement

**Files:**
- Create: `window-motion.cjs`
- Create: `tests/window-motion.test.mjs`
- Modify: `main.js`
- Modify: `preload.js`

**Interfaces:**
- Consumes: `{x, y, width, height}` BrowserWindow bounds, display work area, direction `-1 | 1`, and positive distance.
- Produces: `advanceWithinWorkArea(bounds, workArea, direction, distance)` and `window.pet.walkStep(direction, distance)` returning `{x, movedX, direction, hitEdge}`.

- [ ] **Step 1: Write failing literal boundary tests**

```js
test("walker clamps at the right work-area edge and reverses", () => {
  assert.deepEqual(
    advanceWithinWorkArea(
      { x: 730, y: 20, width: 260, height: 500 },
      { x: 0, y: 0, width: 1000, height: 760 },
      1,
      25
    ),
    { x: 740, movedX: 10, direction: -1, hitEdge: true }
  );
});

test("walker honors a negative-origin display", () => {
  assert.deepEqual(
    advanceWithinWorkArea(
      { x: -1190, y: 20, width: 300, height: 500 },
      { x: -1200, y: 0, width: 1200, height: 760 },
      -1,
      30
    ),
    { x: -1200, movedX: -10, direction: 1, hitEdge: true }
  );
});
```

- [ ] **Step 2: Run the boundary tests and verify RED**

Run: `node --test tests/window-motion.test.mjs`

Expected: FAIL because `window-motion.cjs` does not exist.

- [ ] **Step 3: Implement the pure clamp and Electron IPC boundary**

```js
function advanceWithinWorkArea(bounds, area, direction, distance) {
  const dir = direction < 0 ? -1 : 1;
  const step = Math.max(0, Number(distance) || 0) * dir;
  const minX = area.x;
  const maxX = area.x + Math.max(0, area.width - bounds.width);
  const x = Math.max(minX, Math.min(maxX, bounds.x + step));
  const hitEdge = (dir < 0 && x === minX) || (dir > 0 && x === maxX);
  return { x, movedX: x - bounds.x, direction: hitEdge ? -dir : dir, hitEdge };
}
```

Register `ipcMain.handle("walk-step", ...)`, select `screen.getDisplayMatching(win.getBounds()).workArea`, apply only the clamped x-position, and expose the invocation from `preload.js`.

- [ ] **Step 4: Run both suites and verify GREEN**

Run: `npm test`

Expected: all motion and window-motion tests pass.

### Task 3: Renderer action controller and PMX lower-body posing

**Files:**
- Modify: `renderer/pet.js`
- Modify: `renderer/index.html`
- Modify: `renderer/style.css`

**Interfaces:**
- Consumes: `sampleWalkMotion`, `sampleStompMotion`, and `window.pet.walkStep`.
- Produces: `startStomp()`, `startWalking({manual})`, `stopWalking()`, `stopAllActions()`, and the visible right-click action menu.

- [ ] **Step 1: Add failing action-controller assertions to the pure arbitration test**

```js
test("discrete actions exclude each other and walking", () => {
  assert.equal(canStartAction({ walk: true }, "stomp"), false);
  assert.equal(canStartAction({ stomp: true }, "walk"), false);
  assert.equal(canStartAction({}, "stomp"), true);
  assert.equal(canStartAction({}, "walk"), true);
});
```

- [ ] **Step 2: Run the assertion and verify RED**

Run: `node --test tests/motion.test.mjs`

Expected: FAIL until the arbitration contract accounts for walk and stomp.

- [ ] **Step 3: Wire the visible actions and lower-body bones**

Use alias lookups for `右足D/右足/右腿/RightLeg`, `左足D/左足/左腿/LeftLeg`, matching knees and ankles. Blend walk/stomp channels into hips, knees, ankles, center, upper body, head, and arms. At most once every 33 ms while walking, invoke `walkStep`; use its returned direction to set facing yaw to `0` or `Math.PI` and continue from the returned edge direction.

Add this menu structure:

```html
<button data-act="actions">动作展示 ›</button>
<div id="actionMenu" hidden>
  <button data-motion="idle">自然待机</button>
  <button data-motion="bounce">点击蓄力弹起</button>
  <button data-motion="spin">张臂转圈软着陆</button>
  <button data-motion="touch">害羞摸脸</button>
  <button data-motion="stomp">跺脚</button>
  <button data-motion="walk">开始 / 停止走动</button>
</div>
```

Single click starts bounce, double click starts spin, five clicks within seven seconds start stomp, and a 900 ms character hover starts face touch. Set the next automatic-walk deadline to `now + 15000 + Math.random() * 15000`; reset it and stop walking on click, drag, chat, or menu opening.

- [ ] **Step 4: Run all pure tests and syntax checks**

Run: `npm test`

Run: `node --check main.js; node --check preload.js; node --check renderer/pet.js`

Expected: all commands exit 0.

### Task 4: Preview all six actions on every bundled outfit

**Files:**
- Modify: `renderer/preview_actions.html`
- Modify: `tools/capture_actions.js`

**Interfaces:**
- Consumes: All six motion samplers and the same lower-body bone aliases as the renderer.
- Produces: a six-panel preview plus `window.__ACTION_PREVIEW_RESULT__` containing each outfit/action validation result.

- [ ] **Step 1: Extend the preview validator before adding preview posing**

The validator must require head, upper body, center, both arms/elbows, both legs, and both knees for the five bundled PMX variants. It must evaluate `idle`, `poke`, `spin`, `touch`, `stomp`, and `walk`, assert finite transforms, restore the snapshot after each pose, and surface any missing bone group as a rejected preview result.

- [ ] **Step 2: Run preview capture and verify RED**

Run: `npm run preview:actions`

Expected: FAIL because stomp and walk pose application/render cells are not implemented yet.

- [ ] **Step 3: Implement stomp/walk pose application and six cells**

Render representative phases: idle `1.25s`, bounce `0.42`, spin `0.55`, touch `0.5`, stomp `0.56`, and walk `0.25s`. Apply the same leg, knee, ankle, arm, center, upper-body, and facing transformations as the live renderer.

- [ ] **Step 4: Run capture and verify GREEN**

Run: `npm run preview:actions`

Expected: exit 0, six preview panels captured, and five outfits × six actions reported valid and restorable.

### Task 5: Launcher refresh and end-to-end verification

**Files:**
- Modify: `main.js`
- Modify: `start.bat`

**Interfaces:**
- Consumes: `--reload-source` passed by the development launcher.
- Produces: renderer reload on a second source instance while preserving packaged-app behavior.

- [ ] **Step 1: Add the reload argument to the launcher**

Start Electron as:

```bat
start "" "node_modules\electron\dist\electron.exe" "." "--reload-source"
```

- [ ] **Step 2: Handle the second-instance contract**

In development mode only, if the second instance arguments include `--reload-source`, call `win.webContents.reloadIgnoringCache()` before showing the window. Packaged builds continue to only show the existing window.

- [ ] **Step 3: Execute full automated verification**

Run: `npm test`

Run: `node --check main.js; node --check preload.js; node --check renderer/pet.js`

Run: `npm run preview:actions`

Expected: tests pass, syntax checks exit 0, preview validates all five outfits and all six actions.

- [ ] **Step 4: Verify the supported launcher**

Run `start.bat`, wait for the renderer to report loaded, run it a second time, and confirm the original window reloads. Manually trigger all six items from “动作展示”; confirm walking moves the window, reverses at a work-area edge, and stops immediately on interaction.

- [ ] **Step 5: Record evidence without committing**

This directory is not a Git repository, so do not create commits. Report exact command results and the absolute paths of the modified source, tests, and preview image.

