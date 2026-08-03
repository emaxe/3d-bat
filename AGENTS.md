# AGENTS.md

Guidance for AI agents working in this repository. Read this before editing code.

## Project

3D tower defense «3D-BAT»: a mystical cave where the player defends the Great Crystal
from waves of nocturnal creatures. Three.js r185 + Vite 8, pure-ESM (`"type": "module"`), Node 22.

**Hard requirement: zero asset files.** Every texture is generated via Canvas 2D
(`src/world/textures.js`), every sound via WebAudio synthesis (`src/audio/`).
Do not add image/audio/font assets. Do not add heavy dependencies; if one is really
needed, ask the user first.

## Layout

```
src/core/       game logic — NO three.js, NO DOM (portable to desktop, unit-testable in Node)
src/world/      procedural cave, path, perches, textures (Canvas 2D)
src/entities/   enemies, towers, projectiles, particles, effects
src/audio/      WebAudio sfx + generative music
src/ui/         HUD, menu, tower panel
tests/          node:test suites
```

## Commands

```bash
node --test 'tests/*.test.mjs'   # MUST use the glob — `node --test tests/` silently runs nothing
node node_modules/vite/bin/vite.js build    # production build → dist/
node node_modules/vite/bin/vite.js preview  # serve dist/ (production link on :4173)
```

35 tests: `logic` (core math/path), `design` (waves/economy/state), `runtime`
(scene builders + enemy/tower constructors with canvas stubs — catches TDZ/TypeError
that import checks miss).

## Core conventions (src/core/*)

- `math.js`: `Vec3` has **`len()`** and **`scale()`**, NOT `length()`/`multiplyScalar()`
  (three-style methods on core Vec3 = runtime crash: `n.length is not a function`).
- Deterministic RNG: `mulberry32(seed)` from `rng.js`. Same seed → same waves/decor/moon.
- `Path` (Catmull-Rom, extrapolated edge points): use `pointAt(d)`, `tangentAt(d)`,
  `nearest()`, `length`. Uniform sampling: step 0.5 along arc → chord ≈ 0.5 ±20%.
- `towers.js`: `TOWER_TYPES` with Russian names (Визгун, Иней, Спора, Эхо, Жар, Фонарь,
  Вампир); `upgradeCost` above max level returns **Infinity** — that is the intended sentinel.
- `pickTarget`: cloak lives on the enemy (`e.cloaked`), reveal is `e.effects.revealed > 0`.
- `layout.js`: 3 levels (campaign), each with own theme, path points, perches.
  Walls/blobs and all decor MUST stay ≥2.5 / ≥3.0 from every level path
  (enforced by tests — never loosen, move the geometry).

## Rendering conventions

- Enemies/towers face **+Z** (three's `lookAt` points +Z forward): eyes/antennae/fangs
  go on +Z, otherwise they look backwards.
- PointLights use physical units (r155+): intensities 200–950 with range 10–24, decay 2.
- `textures.js` caches heavy textures (`cachedTextures` set). `disposeScene()` in
  `game.js` must NEVER dispose cached textures — shared across levels.
- Keep mobile performance priority: ≤5 point lights, adaptive pixelRatio (0.8–1.5),
  no MSAA on touch, static landscape props (time-based shader/opacity anims only).
- Fog: `FogExp2(theme.fog, 0.024)`; ACESFilmicToneMapping.

## Testing new decor/landscape

Runtime tests stub `document`/canvas and call `buildCave` for every level. If you add
new decor kinds, register them in `tests/runtime.test.mjs` clearance map and verify
XZ-distance from every path sample.

## Style

- Comments in code: **Russian**. Commit messages: English or Russian, concise.
- Fixes via small targeted patches; after a series of patches, re-check module
  exports/imports and re-run the full test suite + build.
