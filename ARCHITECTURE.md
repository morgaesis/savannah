# Architecture

Browser-based pixel-art African savanna screensaver. Single-page app, 100% client-side.

## Files

- `public/engine.js` (~1900 lines) — all simulation, rendering, and audio
- `public/index.html` — canvas, controls, meta tags
- `public/favicon.svg` — pixel-art acacia tree icon
- `public/og.png` — social sharing preview image
- `src/server.ts` — dev server (static files + SSE hot-reload). Not needed for production.
- `build.sh` — produces minified static build in `dist/`
- `deploy.sh` — deploys to production VM (requires `.env` with credentials)

## Client Architecture

### Rendering
- **Logic**: fixed 30 tps via accumulator, decoupled from render
- **Render**: native refresh rate via `requestAnimationFrame`
- **Background canvas**: pre-rendered sky/ground/grass/rocks/vignette, re-rendered when time shifts (~every 30s sim time)
- **Dynamic layers**: clouds, waterhole (with sky/moon reflection), wind waves, foreground grass, depth-sorted animals+trees+shrubs, particles, sun rays, eye-shine, fireflies, crickets, dust devil, lightning, shooting stars, owl, vultures, morning mist, heat shimmer, footprints, narration, color grade
- **Dynamic viewport**: canvas resolution = `window.innerWidth / PIXEL_SCALE` (4 on desktop, 3 tablet, 2 phone). Horizon at 52% from top via computed `VP.y`.

### Simulation
- **Brain config**: ~18 tunable parameters per species (speed, stamina, restDesire, grazeDesire, boldness, fearSensitivity, herdDesire, etc.). Individualized per animal with wide random variation.
- **Coroutine fibers**: generator functions that yield tick counts. Multi-step sequences (stalk→chase→rest) as linear code. Interruptible by threat detection and sleep pressure.
- **Energy/stamina**: depletes during sprinting (lion 20s, gazelle 80s), sprint speed drops to 40% when exhausted. Based on real animal data.
- **Spatial grid**: 20px cells, rebuilt each tick. O(n) collision avoidance with speed-scaled push force.
- **Alarm propagation**: fleeing prey triggers fear in nearby herd-mates.
- **Seam handling**: world wraps horizontally. `wrapDeltaX` for distance, `worldToScreenX` for rendering. HomeX syncs at seam. Herding force respects velocity direction near boundary.

### Placement
- **Jittered grid**: PCG-hashed stratified sampling for grass, rocks, stars. Deterministic, no clumping, no visible grid pattern.
- **World seed**: `?seed=N` query param for reproducible worlds.

### Audio (Web Audio API, no files)
- Wind (filtered noise, volume scales with ambient)
- Crickets (night, sine chirps with double-chirp pattern)
- Birdsong (day/dawn, frequency-swept sine)
- Cicadas (hot midday, sawtooth with tremolo)
- Lion roar (hunt events, filtered noise burst)
- Stampede hoofbeats (flee events, rapid sine thumps)

### Time System
- 12 sky color keyframes interpolated
- Sun arc (6am-6pm), moon opposite, Southern Cross, Milky Way
- Settings persisted to localStorage, restorable via query params (`?t=17.5&speed=300`)
- Circular time dial in controls

### Visual Effects
Crepuscular sun rays, dynamic shadow length (3x at horizon), morning mist, heat shimmer, dust devils, lightning, fireflies, wind-blown seeds, shooting stars, owl silhouettes, vultures circling kills, cricket pulse rings, animal footprints, eye-shine (tapetum lucidum), breathing animation, panting/exhaustion dots, elephant dust-bathing, giraffe neck sway, zebra heat-swishing, first light horizon band, moonlight ground wash, waterhole sky/moon reflection

### Animal Species
zebra, gazelle, wildebeest, warthog, lion, elephant, giraffe, bird — each with unique pixel-art sprites, state-specific animations, sleeping poses, and species-appropriate behavior.
