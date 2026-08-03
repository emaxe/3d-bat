# 3D-BAT

A 3D tower defense game set in a mystical cave: defend the Great Crystal from waves of nocturnal creatures.

**Play:** every texture and sound is generated procedurally at runtime (Canvas 2D + WebAudio) — zero asset files.

## Features

- 🕹️ 3-level campaign + endless mode: «Преддверие», «Зал эха», «Сердце пещеры»
- 🗼 7 tower guardians with unique silhouettes (Визгун, Иней, Спора, Эхо, Жар, Фонарь, Вампир), upgrades (max lvl 3) and alpha-merging
- 👾 10 enemy types + 2 bosses: moth swarms, armored beetles, spiders, cloak-stalkers, regenerators, priests, vampire-moths
- 🌒 Moon phases («Кровавая луна» alters the wave), combo rewards, bonus choices, campaign-wide upgrades
- 🏔 Procedural landscape per level: hills, crystal lakes, lava pools, glowing spires, torches, sparkling motes
- 🔊 Generative WebAudio music + synthesized SFX
- 📱 Mobile-friendly: multi-touch gestures (tap/drag/zoom/two-finger pause), adaptive resolution
- 🧪 Pure-JS core (`src/core/`) with no three.js/DOM dependencies — unit-tested under Node (`node --test`), desktop-portable

## How to play

- Build towers on glowing perches along the path to stop the creatures from reaching the Crystal
- Same-type towers adjacent to an alpha (level-3) tower merge into a **super tower**
- Moon phases («Кровавая луна») change wave behavior — watch the sky
- Combo kills (within 3s) multiply essence rewards

**Controls:**
- Desktop: LMB build/select, wheel zoom, MMB/WASD pan, Esc cancel, Space pause, Q speed, N next wave, 1–7 tower hotkeys
- Mobile: tap = build/select, drag = rotate, pinch = zoom, two-finger tap = pause

## Tech

- [three.js](https://threejs.org/) r185 — WebGL rendering
- [Vite](https://vitejs.dev/) — build tooling
- Deterministic RNG (mulberry32), Catmull-Rom path curves, single-draw-call particles

## Run

```bash
npm install
npm run dev      # dev server on :5173
npm run build    # production bundle to dist/
npm run test     # node --test 'tests/*.test.mjs'
```

## Project layout

```
src/core/       game logic (no three/DOM): math, rng, towers, enemies, waves, economy, levels
src/world/      procedural cave, path, perches, textures
src/entities/   enemies, towers, projectiles, particles, effects
src/audio/      WebAudio sfx + generative music
src/ui/         HUD, menu, tower panel
tests/          logic + design + runtime smoke tests (35)
```

## License

MIT
