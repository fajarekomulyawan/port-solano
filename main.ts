// Port Solano — an original top-down open-world crime game for the make.fun "Make GTA 6"
// bounty (gta6-01), built with Node 22 and the standard library only. The game lives in this
// directory's game/ folder: plain static files a desktop browser loads fully offline
// (game/index.html plus classic scripts under game/src/, no library, no assets, no network
// request — every sprite is drawn in code and every sound is synthesized with WebAudio).
// This program hands the entry in: it copies game/ and screenshots/ from beside this file to
// /output and writes /output/dossier.json, the summary the judge reads, with the vendored
// make.fun library. The game itself is a sun-soaked coastal city you explore on foot or in
// stolen cars, with traffic, pedestrians, a five-star wanted system with pursuing police,
// a four-mission story for fixer Dona Carla, punch-and-pistol combat, a minimap HUD and
// localStorage saves — see README.md for the full tour.
//
// Serve it locally with `node serve.ts`, then open http://localhost:8080.
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const GAME_TITLE = 'Port Solano';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });

// The scorer's own caps (reference/gate.json): only text_max_bytes shapes the bytes; the others refuse an entry the
// scorer would refuse (more than 4 screenshots or one over 256 KiB; more than 993 files in game/ or 48 MiB of game
// files, in all, or a path under game/ over 1000 bytes: game/ counts beside /output's own 1000-entry cap, its
// screenshots/ and dossier.json).
const dossier = buildDossier(out, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});
writeFileSync(join(out, 'dossier.json'), dossier);

// A small receipt for whoever runs this by hand: how many screenshots went in
// and how large the dossier the judge will read turned out to be.
const shotDir = join(here, 'screenshots');
const shotCount = existsSync(shotDir)
  ? readdirSync(shotDir).filter((name) => /\.(png|jpe?g)$/i.test(name)).length
  : 0;
console.log(
  `${GAME_TITLE}: game/ and ${shotCount} screenshots handed in; ` +
  `dossier written to ${join(out, 'dossier.json')} (${Buffer.byteLength(dossier)} bytes)`,
);
