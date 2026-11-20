# Port Solano

[![make.fun — "Make GTA 6" bounty entry by @qtz](https://make.fun/api/badge/competitions/gta6-01/entry.svg?u=qtz)](https://make.fun/bounty/gta6-01)
[![Follow @qtz on make.fun](https://make.fun/api/badge/follow.svg?u=qtz)](https://make.fun/@qtz)
[![Invited by @qtz — join make.fun](https://make.fun/api/badge/referral.svg?u=qtz&code=cxst033q)](https://make.fun/invite/cxst033q)

**Port Solano** is an original top-down open-world crime game that runs entirely in the
browser. You are **Marco Reyes**, a wheelman who just arrived in a sun-soaked coastal city
with $100 and a reputation to build. Fixer **Dona Carla** has work for you — four story
missions that tour the whole city — and the Port Solano PD has a five-star wanted system
with your name on it.

Everything is vanilla JavaScript on a single canvas: no engine, no libraries, no image or
audio assets. Every sprite is drawn in code and every sound — engine, sirens, gunshots,
the bassline — is synthesized live with WebAudio. The game plays fully offline from
static files.

## The city

A 3200 × 2400 coastal city generated procedurally from a seed: six avenues and five
streets of two-lane roads with crosswalks, ~90 pastel buildings (shops with awnings, a
hospital, a police station, a warehouse, a motel with a pool), a tiled central plaza with
a fountain, a park, palm trees, a beach promenade, two wooden piers and the teal sea.

## Features

- **Open world, on foot and by car** — walk, sprint, swim-free (the sea is not forgiving),
  and steal any of the ~35 cars: sedans, hatchbacks, taxis, convertibles, sports cars, vans.
- **Living traffic** — lane-following AI drivers who stop for obstacles, turn at
  intersections, and flee when the shooting starts.
- **Pedestrians** — they stroll the sidewalks, plaza, park and beach, flee danger, and
  act as witnesses: crimes nobody sees barely raise your heat.
- **Wanted system** — a hidden heat value behind the five stars. Police cars hunt in
  packs sized by your stars and ram you; at three stars and up, foot officers join in,
  shoot, and can arrest you if they hold you for two seconds. Break line of sight long
  enough and the heat cools off.
- **Combat** — fists (F) and a mouse-aimed hitscan pistol earned in mission 2, with
  tracers, muzzle flash and shell-shock vignette.
- **Four-mission story** for Dona Carla:
  1. *First Wheels* — steal the red sports car at the beach motel, deliver it to the docks.
  2. *Hot Package* — a 120-second delivery across town with two stars on your tail; earns the pistol.
  3. *Convoy Trouble* — ram an armored van to scrap before it reaches the north depot.
  4. *Harbour Heat* — carry a briefcase to the boat under a four-star manhunt, then lose the police.
- **Consequences** — death is a $200 hospital bill and a respawn at the hospital; arrest
  costs a fine and your pistol, and you walk out of the police station.
- **HUD & minimap** — health, money, wanted stars, weapon/ammo, mission banner and
  objective with distance, context prompts, countdown chip, arrest meter, and a live
  minimap with mission marker and flashing police blips.
- **Save / continue** — progress (money, weapon, mission, position) persists in
  `localStorage`; saving happens automatically after every mission and manually from
  the pause menu.
- **Synthesized audio** — engine hum pitched by speed, skids, crashes, gunfire, sirens
  that wail when the law is close, mission jingles and a quiet looping bassline. M mutes.

## Controls

| Keys | Action |
| --- | --- |
| WASD / arrows | Walk / drive |
| Shift | Sprint |
| E | Enter / exit a car |
| Space | Handbrake |
| F | Punch |
| Mouse + left click | Aim & fire the pistol |
| Esc / P | Pause |
| M | Mute |

## Run it

```sh
node serve.ts            # serves game/ on http://localhost:8080
```

…then open http://localhost:8080 in a desktop browser. Or simply open
`game/index.html` directly — there is nothing to build and nothing to fetch.

To hand the entry in the way the bounty does:

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

This copies `game/` and `screenshots/` to the output directory and writes
`dossier.json` with the vendored make.fun library in `vendor/`.

## Layout

```
main.ts                  hands the entry in (copies the game, writes the dossier)
serve.ts                 tiny local dev server for game/
vendor/makefun-game.ts   the vendored make.fun dossier library (unmodified)
game/index.html          page, HUD DOM, overlays, styles
game/src/rng.js          seeded PRNG + math helpers
game/src/audio.js        WebAudio-synthesized SFX, engine, siren and music
game/src/save.js         localStorage save / load
game/src/city.js         the procedural city, static rendering, collision queries
game/src/vehicles.js     car factory, driving physics, traffic AI, car rendering
game/src/pedestrians.js  pedestrian spawn / walk / flee AI and rendering
game/src/police.js       wanted heat, police pursuit AI, foot officers, arrests
game/src/player.js       Marco: movement, combat, car entry, death & arrest hooks
game/src/missions.js     Dona Carla's four-mission story chain
game/src/hud.js          HUD updates and the minimap
game/src/main.js         boot, input, camera, effects, state machine, main loop
screenshots/             four renders of the game (the first is the cover)
```

The screenshots are real renders of the game's own code, staged deterministically
with `?shot=cover|chase|foot|mission&seed=1` scenes (see `shots.json`).

## License

MIT — see `LICENSE`.

---

Submitted to make.fun's "Make GTA 6" bounty by @qtz — https://make.fun/bounty/gta6-01 · Invited by @qtz: https://make.fun/invite/cxst033q
