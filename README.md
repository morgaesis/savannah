# Savannah

Pixel-art African savanna screensaver with ecosystem simulation.

[![Sunset over the savanna](screenshot.png)](https://africa.morgaes.is/?t=17.5&seed=7742)

**[Live demo](https://africa.morgaes.is)** · [Blog post](https://morgaes.is/blog/african-savanna-screensaver)

## Features

Eight animal species (zebra, gazelle, wildebeest, warthog, lion, elephant, giraffe, bird) with coroutine-based AI, individual personalities, and realistic speeds. Lions stalk and chase; prey flees with alarm propagation through the herd. Vultures circle kills.

Full day/night cycle with Milky Way, moon, Southern Cross, shooting stars, morning mist, crepuscular sun rays, distant lightning, fireflies, dust devils, and procedural audio (wind, crickets, birdsong via Web Audio API).

Ground texture and decoration placed via PCG-hashed jittered grid (stratified sampling). Spatial hash grid for O(n) collision avoidance. Render loop decoupled from logic at 30 tps.

## Run locally

```
bun install
bun run src/server.ts
```

Open http://localhost:4680

## Static build

```
bash build.sh     # outputs to dist/
npx serve dist    # or any static host
```

## Query params

| Param | Description | Example |
|-------|-------------|---------|
| `t` | Time of day (hours, 0-24) | `?t=17.5` (sunset) |
| `seed` | World seed (deterministic layout) | `?seed=7742` |
| `speed` | Day length in seconds | `?speed=300` (5 min days) |
| `vp` | Viewport x position | `?vp=400` |
| `w` | World width (min 400) | `?w=1200` |
| `animals` | Animal counts (letter+number, comma-separated) | `?animals=z10,g8,l3,e5` |
| `pause` | Freeze time at specified `t` value | `?t=17.5&pause` |
| `hide` | Hide all UI (clean mode for screenshots/embedding) | `?hide` |

## Controls

- **Click** — fullscreen
- **Drag** / **arrow keys** — pan viewport
- **N** — skip to next time period
- **S** — cycle day speed (1x / 60x / 300x)
- **[cfg]** button — settings panel (animal counts, world width, reset)
- **Minimap** — click to pan
- **Time dial** — drag to set time (circular, wraps at midnight)

## Scenes

| Time | Link |
|------|------|
| Pre-dawn | [4:30](https://africa.morgaes.is/?t=4.5&seed=42&pause) |
| First light | [5:30](https://africa.morgaes.is/?t=5.5&seed=42&pause) |
| Sunrise | [6:30](https://africa.morgaes.is/?t=6.5&seed=42&pause) |
| Morning | [9:00](https://africa.morgaes.is/?t=9&seed=42&pause) |
| Midday heat | [13:00](https://africa.morgaes.is/?t=13&seed=7742&pause) |
| Afternoon rain | [14:00](https://africa.morgaes.is/?t=14&seed=42&rain&pause) |
| Golden hour | [17:30](https://africa.morgaes.is/?t=17.5&seed=7742&pause) |
| Sunset | [18:30](https://africa.morgaes.is/?t=18.5&seed=42&pause) |
| Dusk | [19:30](https://africa.morgaes.is/?t=19.5&seed=42&pause) |
| Night | [22:00](https://africa.morgaes.is/?t=22&seed=42&pause) |
| Deep night | [2:00](https://africa.morgaes.is/?t=2&seed=42&pause) |
- [Midday heat](https://africa.morgaes.is/?t=13&seed=7742&pause) — animals at waterhole

## License

MIT
