# Roadmap

## Completed
- Full day/night cycle with 12 sky keyframes, sun arc, moon, stars, Milky Way
- 8 animal species with brain configs, coroutine AI, alarm propagation, herding
- Predator-prey dynamics (lion stalk/chase/kill, prey flee, respawn)
- Perspective depth scaling, atmospheric effects (mist, dust, lightning, fireflies)
- Settings panel with animal counts, world width, day speed, time control
- Keyboard shortcuts (N=skip time, S=speed cycle, arrows/drag=pan)
- World wrapping, spatial grid for O(n) collision avoidance
- Deployed to VM at DEPLOY_HOST:8080

## Near-term
- Split engine.js (~3000 lines) into ES modules with a bundler step
- Audio: ambient sounds (crickets, birds, wind) with Web Audio API
- More weather: rain events with darkened sky, puddles forming
- Seasonal variation: dry/wet season affecting grass color and animal behavior
- Touch gesture support for mobile (pinch zoom, time scrub)

## Medium-term
- Migration system: wildebeest herds that cross the full world
- Predator variety: cheetah (fast sprinter), hyena pack (group hunters)
- Baby animals that follow mothers
- Vultures that circle above carcasses
- Termite mounds as static features
- Watering hole ecosystem: hippos, crocodiles

## Long-term
- WebGPU renderer for larger world and more animals
- Configurable biomes (desert, jungle, coastal)
- Multi-client sync: same world state across viewers via WebSocket
- AI-driven narration: LLM generates contextual descriptions of events
- User-placeable camera positions / bookmarks
