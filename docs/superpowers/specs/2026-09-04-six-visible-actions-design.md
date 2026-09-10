# Six Visible Actions Design

## Goal

Turn the existing subtle procedural posing into six obvious, user-discoverable desktop-pet actions without replacing the character, proportions, hairstyle, clothing, textures, or adding props.

## Approved behavior

- Natural idle uses readable breathing, weight shift, head motion, asymmetric arms, and secondary hair/skirt response.
- A single click performs a clear anticipation crouch, upward bounce, hands-to-chest pose, and settled landing.
- A double click performs an arms-open turn with anticipation and a soft landing.
- Hovering over the character performs a shy right-hand face touch with a head lean.
- Repeated clicking and the action menu can trigger a visible right-foot stomp with an angry expression and body jolt.
- Walking alternates legs and arms, bobs the body, and moves the Electron window horizontally across the current display work area. The character faces the travel direction and reverses smoothly at an edge.
- Walking starts automatically after 15–30 seconds without interaction. Clicking, dragging, chat, or opening a menu stops it immediately.
- A right-click “动作展示” submenu exposes idle, bounce, spin, face touch, stomp, and walk start/stop actions for direct verification.
- Running `start.bat` while a development instance is already open reloads the renderer so source changes become visible.

## Technical boundaries

- Pure motion sampling and window-edge math remain testable without Electron or WebGL.
- Renderer code owns action timing and PMX bone application.
- Main-process code owns clamped desktop-window movement.
- Lower-body bone lookup accepts D-bone and ordinary Japanese/Chinese/English names; missing optional bones degrade to center bob plus window movement without crashing.
- Discrete actions are mutually exclusive. Starting a discrete action stops walking first.
- Automated preview validates finite transforms and restoration across the bundled 1883, nurse, outing, maid, and xmas PMX variants.

