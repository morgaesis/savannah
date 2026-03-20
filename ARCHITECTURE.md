# Architecture

Browser-based pixel-art African savanna screensaver. Single-page app served by Bun.

## Runtime

- **Server**: `src/server.ts` - static file server on port 4680 with SSE hot-reload (watches `public/`)
- **Client**: `public/engine.js` (~2500 lines) - all rendering and simulation in one file
- **HTML**: `public/index.html` - canvas + minimal controls

## Client Architecture

### Rendering (decoupled from logic)
- **Logic loop**: Fixed 30 tps via accumulator in `requestAnimationFrame`
- **Render loop**: Native refresh rate via `requestAnimationFrame`
- **Background canvas**: Pre-rendered sky/ground/grass/rocks/vignette. Re-rendered when time-of-day shifts (~every 30s sim time)
- **Dynamic layers** (per frame): clouds, waterhole shimmer, wind waves, foreground grass, depth-sorted animals+trees+shrubs, particles, sun rays, eye-shine, fireflies, dust devil, shooting stars, narration text, color grade overlay
- **Waterhole**: Banks pre-rendered to small canvas; water body via `ImageData` (one `putImageData` instead of ~1800 `fillRect` calls)
- **Depth sorting**: Reusable array buffer, animals + trees + shrubs sorted by Y each frame

### Simulation
- **Brain config**: Each animal has a `brain` object (~18 tunable parameters: speed, restDesire, grazeDesire, boldness, fearSensitivity, herdDesire, etc.). Species defaults in `BRAINS`, individualized per animal with wide random variation
- **Coroutine fibers**: Each animal runs a generator function (`behaviorLoop`) that yields tick counts. Supports multi-step sequences (stalk -> chase -> rest) and can be interrupted (threat detection, sleep pressure)
- **Threat interrupt**: Runs in `tick()` every 8 ticks independent of fiber. Force-replaces the fiber with a flee sequence when predator detected. Triggers alarm call propagation to nearby herd-mates
- **Spatial grid**: 20px cells, rebuilt each tick. Used for O(n) collision avoidance instead of O(n^2)
- **Background herding**: Constant gentle velocity pull toward same-species center of mass (proportional to `herdDesire`), runs every tick
- **Waterhole avoidance**: Elliptical repulsion pushes non-drinking animals out of water area
- **Sleep pressure**: At night, per-tick chance to force-sleep, scaled by restDesire and time depth. Lions resist (nocturnal)
- **Day/night behavioral shifts**: Prey clusters tighter, grazes less, wanders less at night. Lions hunt more at dusk/dawn. Birds roost near trees

### Placement
- **Jittered grid** (Braid-style stratified sampling): `pcgHash`-seeded grid cells with random jitter for grass, rocks, stars. Deterministic, natural-looking, no clumping
- **pcgHash**: PCG-inspired deterministic hash function. Used everywhere instead of `Math.sin` to avoid visible banding patterns

### Time System
- Day/night cycle with 12 sky color keyframes interpolated smoothly
- Sun arc (rises 6am east, sets 6pm west)
- Moon at night with craters
- Settings persisted to localStorage (simTime, dayLength, timestamp for elapsed-time correction on reload)

### Visual Effects
- Crepuscular sun rays during golden hour
- Heat shimmer near horizon (midday)
- Dust kicked up by running animals, splashes when drinking, debris when grazing
- Dust devil (occasional, drifts across plain, scares animals)
- Shooting stars at night
- Fireflies at dusk/dawn
- Wind waves rippling across ground
- Animated foreground grass clumps
- Wind-blown seed particles
- Animal eye-shine at night (tapetum lucidum)
- Golden hour / night color grade overlays
- Perspective scaling (0.85x at horizon, 1.1x foreground)
- Event narration text (fade in/out)

### Animal Species
zebra, gazelle, wildebeest, warthog, lion, elephant, giraffe, bird

Each has unique pixel-art sprite with state-specific animations (walking, grazing, drinking, resting/lying down, fleeing, stalking/crouching). All sprites drawn facing right with canvas transform for mirroring.
