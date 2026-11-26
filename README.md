[![make.fun](https://make.fun/badge/best-flight-game-20261126-0057.svg)](https://make.fun/bounty/best-flight-game-20261126-0057)
[![make.fun rank](https://make.fun/badge/best-flight-game-20261126-0057/ukyo9k/makefun-flight-game/rank.svg)](https://make.fun/bounty/best-flight-game-20261126-0057)
[![make.fun reward](https://make.fun/badge/best-flight-game-20261126-0057/ukyo9k/makefun-flight-game/reward.svg)](https://make.fun/bounty/best-flight-game-20261126-0057)

# Kestrel Ridge Run

Entry for the [make.fun bounty "Make the best flight game"](https://make.fun/bounty/best-flight-game-20261126-0057).

Fly the **KV-7 Kestrel**, a single-seat dawn-patrol jet, through the ridges of
**Aeris Vale** — a procedurally built valley with a river lake, a conifer
forest and one 900 m runway (Runway 09). Three sorties, one airframe, and only
so much fuel:

1. **Ring Run** — thread 10 glowing rings through the valley, then land on
   Runway 09.
2. **Canyon Dash** — a low-level sprint: 6 gates under 500 ft, against a
   4-minute clock.
3. **Precision Landing** — take off, climb to the beacon ring at 2,000 ft,
   then grease it on the numbers.

## Playing

Open `game/index.html` in desktop Chrome (serve `game/` with any static
server — the game makes no network requests). Keyboard + mouse:

- **W / S** pitch · **A / D** roll · **Q / E** rudder
- **Shift / Ctrl** throttle · **F** flaps · **G** gear · **C** camera
  (chase / cockpit) · **P** pause · **R** restart · **M** sound
- **Mouse**: hold the left button and steer toward the cursor

Throttle and turn discipline matter: the jet stalls below ~58 kt clean
(~43 kt with flaps), fuel burns with throttle, and hard contact with terrain
damages the airframe. Land gear-down, on the strip, gentle — or walk home.

## How it is built

- `game/index.html` + `game/style.css` — page and HUD (airspeed, altitude,
  vertical speed, throttle, compass, fuel/damage, attitude indicator).
- `game/src/` — one job per file: `main.js` (state machine, collisions,
  landings), `flight.js` (arcade flight model), `terrain.js` (procedural
  valley, runway, lake, sky), `aircraft.js` (the KV-7, built from primitives),
  `rings.js` (course rings), `missions.js` (the three sorties), `hud.js`,
  `input.js`, `audio.js` (synthesised engine, wind and chimes — no audio
  files), `camera.js` (chase + cockpit), `noise.js` (seeded terrain noise).
- `game/vendor/three.min.js` — vendored three.js r160 build.
- `main.ts` (Node 22) copies `game/` and `screenshots/` to `/output` and
  writes `/output/dossier.json` with the kit's `vendor/makefun-game.ts`.

Everything — names, art, sounds, music, terrain, aircraft — is original,
written for this entry. `?scene=ring|approach|cockpit|menu` positions the jet
for screenshots using the game's own code.
