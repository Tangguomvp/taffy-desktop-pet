import test from "node:test";
import assert from "node:assert/strict";
import windowMotion from "../window-motion.cjs";

const { advanceWithinWorkArea } = windowMotion;

test("walker clamps at the right work-area edge and reverses", () => {
  assert.deepEqual(
    advanceWithinWorkArea(
      { x: 730, y: 20, width: 260, height: 500 },
      { x: 0, y: 0, width: 1000, height: 760 },
      1,
      25
    ),
    { x: 740, movedX: 10, direction: -1, hitEdge: true, distToEdge: 0 }
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
    { x: -1200, movedX: -10, direction: 1, hitEdge: true, distToEdge: 0 }
  );
});

test("walker reverses after rounding reaches the left work-area edge", () => {
  assert.deepEqual(
    advanceWithinWorkArea(
      { x: 1, y: 20, width: 260, height: 500 },
      { x: 0, y: 0, width: 1000, height: 760 },
      -1,
      0.6
    ),
    { x: 0, movedX: -1, direction: 1, hitEdge: true, distToEdge: 0 }
  );
});

test("walker advances inside the work area without reversing", () => {
  assert.deepEqual(
    advanceWithinWorkArea(
      { x: 400, y: 20, width: 260, height: 500 },
      { x: 0, y: 0, width: 1000, height: 760 },
      -1,
      12.5
    ),
    { x: 388, movedX: -12, direction: -1, hitEdge: false, distToEdge: 388 }
  );
});
