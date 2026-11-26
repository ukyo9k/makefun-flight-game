// main.js — Kestrel Ridge Run: boots the renderer, owns the game state
// machine (menu -> flying -> landed / crashed), runs the flight loop,
// checks terrain and runway contact, and wires missions, HUD and sound.
import { THREE } from './three-shim.js';
import { buildTerrain, groundHeight, isWater, WORLD } from './terrain.js';
import { buildAircraft } from './aircraft.js';
import { createFlightState, stepFlight, isStalled, headingDeg, clamp } from './flight.js';
import { makeRingSet, checkRingPass, resetRings, nextRing } from './rings.js';
import {
  MISSIONS, createMissionRun, missionObjectiveText, scoreRing, scoreLanding,
} from './missions.js';
import { createHud } from './hud.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import { createCameraRig } from './camera.js';

const $ = (id) => document.getElementById(id);

// ---------- scene query param (screenshot-friendly states) ----------
// ?scene=ring     — mid-flight, rings ahead, chase view
// ?scene=approach — on final approach to Runway 09
// ?scene=cockpit  — cockpit view, mid-flight
// ?scene=menu     — title screen (default)
const sceneParam = new URLSearchParams(window.location.search).get('scene') || 'menu';

const canvas = $('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 9000);

const sun = new THREE.DirectionalLight(0xffe0b3, 1.35);
sun.position.set(1800, 700, -500);
scene.add(sun);
// Cool fill from the west so the jet's shadow side still reads.
const fill = new THREE.DirectionalLight(0x9db8cc, 0.55);
fill.position.set(-1500, 500, 800);
scene.add(fill);
scene.add(new THREE.AmbientLight(0x8fb4d8, 0.75));

buildTerrain(scene);
const { group: jet, gear, exhaust } = buildAircraft();
scene.add(jet);

const hud = createHud();
const input = createInput();
const audio = createAudio();
const cameraRig = createCameraRig(camera);

// ---------- game state ----------
let mode = 'menu'; // menu | flying | paused | ended
let run = createMissionRun('ring-run');
let flight = createFlightState(MISSIONS['ring-run'].spawn);
let rings = [];
let stallInfo = { stalled: false, terrainClose: false };
let endReason = '';
let lowAltTimer = 0;
let warnBeepTimer = 0;

function loadMission(missionId) {
  run = createMissionRun(missionId);
  flight = createFlightState(run.mission.spawn);
  for (const r of rings) scene.remove(r);
  rings = makeRingSet(scene, run.mission.rings);
  run.objectiveText = missionObjectiveText(run);
  updateJetTransform(0);
  cameraRig.snap(flight);
}

function startMission(missionId) {
  audio.ensure();
  loadMission(missionId);
  mode = 'flying';
  $('menu').classList.add('hidden');
  $('endscreen').classList.add('hidden');
  $('hud').classList.remove('hidden');
  hud.showToast(run.mission.name.toUpperCase(), 2200);
}

function endSortie(title, sub, stats) {
  mode = 'ended';
  endReason = title;
  $('end-title').textContent = title;
  $('end-sub').textContent = sub;
  $('end-stats').innerHTML = stats.map(([k, v]) => `<div>${k}<b>${v}</b></div>`).join('');
  $('endscreen').classList.remove('hidden');
  if (title.includes('COMPLETE') || title.includes('LANDED')) audio.complete();
}

function backToMenu() {
  mode = 'menu';
  $('endscreen').classList.add('hidden');
  $('paused').classList.add('hidden');
  $('hud').classList.add('hidden');
  $('menu').classList.remove('hidden');
  loadMission(run.mission.id);
}

function updateJetTransform(dt) {
  jet.position.copy(flight.position);
  jet.rotation.set(0, 0, 0);
  jet.rotation.order = 'YXZ';
  // The mesh nose is local -Z: rotating by -heading swings it onto the
  // flight model's forward vector (sin h, 0, -cos h).
  jet.rotation.y = -flight.heading;
  jet.rotation.x = flight.pitch;
  jet.rotation.z = -flight.roll;
  gear.visible = flight.gearDown;
  const glow = 0.6 + flight.throttle * 0.8 + Math.sin(performance.now() * 0.02) * 0.15;
  exhaust.material.color.setRGB(1, 0.55 + flight.throttle * 0.2, 0.1 + glow * 0.1);
  exhaust.scale.setScalar(0.7 + flight.throttle * 0.7);
}

let brushCooldown = 0;

// ---------- contact: terrain, water, runway ----------
function checkContact(dt) {
  const p = flight.position;
  const gh = groundHeight(p.x, p.z);
  const clearance = p.y - gh;
  brushCooldown = Math.max(0, brushCooldown - dt);

  stallInfo.terrainClose = flight.airborne && clearance < 45 && flight.verticalSpeed < -2;

  // Water: ditching is a crash.
  if (flight.airborne && isWater(p.x, p.z) && p.y <= 0) {
    crash('DITCHED IN MIRROR LAKE', 'The Kestrel went down in the lake. The valley keeps its secrets.');
    return;
  }

  // Terrain strike: only a real impact counts — descending into the ground,
  // or skimming it level at speed. A fresh liftoff (climbing, vertical
  // speed positive) is not a strike.
  if (flight.airborne && clearance <= 1.5) {
    if (flight.verticalSpeed < -8 || (clearance <= 0.5 && flight.verticalSpeed < 0.5)) {
      crash('TERRAIN STRIKE', 'The ridge won this one. Watch the horizon, not the rings.');
      return;
    }
    // A low, slow brush with a hillside: damage and a bounce — but only
    // while actually descending toward it, never on a climbing liftoff,
    // and at most once per 1.5 s so one bad approach cannot shred the jet.
    if (flight.verticalSpeed < -1 && brushCooldown <= 0) {
      brushCooldown = 1.5;
      flight.damage += 18;
      flight.position.y = gh + 2;
      flight.verticalSpeed = 3; // bounce clear
      hud.showToast('TERRAIN — AIRFRAME DAMAGE', 1400);
      if (flight.damage >= 100) crash('AIRFRAME FAILURE', 'Too many hard knocks — the Kestrel came apart.');
      return;
    }
  }

  // Runway contact: landing or rolling.
  const onStrip = Math.abs(p.z) < WORLD.runwayWidth / 2 + 2
    && Math.abs(p.x) < WORLD.runwayLength / 2 + 10;
  if (!flight.airborne && onStrip) {
    // Rolling on the strip: fine.
    return;
  }
  if (flight.airborne && onStrip && clearance <= 1.2 && flight.verticalSpeed < 0) {
    landAttempt();
    return;
  }
  // Touching rough ground while airborne and slow: treat as a field landing attempt.
  if (flight.airborne && clearance <= 1.2 && flight.verticalSpeed < 0 && !onStrip) {
    if (Math.abs(flight.verticalSpeed) > 8 || flight.speed > 55) {
      crash('OFF-FIELD CRASH', 'That field is not a runway. The Kestrel is built for strips, not scrub.');
    } else {
      flight.damage += 25;
      flight.airborne = false;
      flight.grounded = true;
      flight.speed *= 0.5;
      hud.showToast('ROUGH FIELD LANDING — HEAVY DAMAGE', 1800);
    }
  }
}

function landAttempt() {
  const p = flight.position;
  const vs = Math.abs(flight.verticalSpeed);
  const aligned = Math.abs(((headingDeg(flight) - 90 + 540) % 360) - 180) < 25
    || Math.abs(((headingDeg(flight) - 270 + 540) % 360) - 180) < 25;
  if (!flight.gearDown) {
    crash('BELLY LANDING', 'Gear up on the runway. The Kestrel slid — and stopped.');
    return;
  }
  if (vs > 7 || flight.speed > 75) {
    flight.damage += 30;
    if (flight.damage >= 100 || vs > 11) {
      crash('HARD LANDING', 'The runway forgives a lot. That was not a lot.');
      return;
    }
    hud.showToast('HARD TOUCHDOWN — DAMAGE', 1600);
  }
  // Successful landing.
  flight.airborne = false;
  flight.grounded = true;
  flight.position.y = Math.max(flight.position.y, 1.0);
  flight.verticalSpeed = 0;
  flight.pitch = 0;
  flight.roll = 0;
  audio.touchdown();
  const centre = 1 - Math.min(1, Math.abs(p.z) / (WORLD.runwayWidth / 2));
  const softness = 1 - Math.min(1, vs / 7);
  const quality = clamp(0.35 + 0.35 * centre + 0.3 * softness, 0, 1);
  if (run.phase === 'landing' || run.phase === 'rings') {
    const pts = scoreLanding(run, quality);
    hud.showToast(`TOUCHDOWN +${pts}`, 2000);
    const stats = [
      ['Score', String(run.score)],
      ['Rings flown', `${run.ringsPassed}/${run.mission.rings.length}`],
      ['Time', fmtClock(run.elapsedSec)],
      ['Fuel left', `${Math.round(flight.fuel)}%`],
      ['Airframe damage', `${Math.round(flight.damage)}%`],
      ['Landing quality', `${Math.round(quality * 100)}%`],
    ];
    const title = run.mission.landing.precision && quality > 0.8
      ? 'GREASED IT — MISSION COMPLETE'
      : 'MISSION COMPLETE';
    endSortie(title, run.mission.briefing, stats);
  } else {
    hud.showToast('LANDED — TAXI TO A STOP', 1800);
    setTimeout(() => { if (mode === 'flying') backToMenu(); }, 2500);
  }
}

function crash(title, sub) {
  audio.crash();
  flight.damage = 100;
  const stats = [
    ['Score', String(run.score)],
    ['Rings flown', `${run.ringsPassed}/${run.mission.rings.length}`],
    ['Time', fmtClock(run.elapsedSec)],
    ['Altitude', `${Math.round(flight.position.y * 3.28)} ft`],
    ['Speed', `${Math.round(flight.speed * 1.94)} kt`],
  ];
  endSortie(title, sub, stats);
}

function fmtClock(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// ---------- main loop ----------
let last = performance.now();
let elapsed = 0;

function tick(now) {
  requestAnimationFrame(tick);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  elapsed += dt;

  // Edge-triggered keys.
  if (input.consume('KeyF') && mode === 'flying') {
    flight.flaps = !flight.flaps;
    hud.showToast(flight.flaps ? 'FLAPS DOWN' : 'FLAPS UP', 900);
  }
  if (input.consume('KeyG') && mode === 'flying') {
    flight.gearDown = !flight.gearDown;
    hud.showToast(flight.gearDown ? 'GEAR DOWN' : 'GEAR UP', 900);
  }
  if (input.consume('KeyC') && mode === 'flying') {
    hud.showToast(cameraRig.toggle() === 'cockpit' ? 'COCKPIT VIEW' : 'CHASE VIEW', 900);
  }
  if (input.consume('KeyM')) {
    audio.setMuted(!audio.isMuted());
    hud.showToast(audio.isMuted() ? 'SOUND OFF' : 'SOUND ON', 900);
  }
  if (input.consume('KeyP') && (mode === 'flying' || mode === 'paused')) {
    mode = mode === 'flying' ? 'paused' : 'flying';
    $('paused').classList.toggle('hidden', mode !== 'paused');
  }
  if (input.consume('KeyR') && (mode === 'flying' || mode === 'ended')) {
    startMission(run.mission.id);
  }
  if (input.consume('Escape') && mode === 'ended') backToMenu();
  if (mode === 'menu') {
    if (input.consume('Digit1')) startMission('ring-run');
    if (input.consume('Digit2')) startMission('canyon-dash');
    if (input.consume('Digit3')) startMission('precision-landing');
  }
  if (input.consume('Enter') && mode === 'ended') startMission(run.mission.id);

  if (mode === 'flying') {
    const ctrl = input.poll();
    const { stall } = stepFlight(flight, ctrl, dt);
    stallInfo.stalled = isStalled(flight, stall);
    run.elapsedSec += dt;

    // Canyon dash altitude rule.
    if (run.mission.maxAltFt && flight.airborne && flight.position.y * 3.28 > run.mission.maxAltFt) {
      lowAltTimer += dt;
      if (lowAltTimer > 1.5) {
        lowAltTimer = 0;
        run.lowAltViolations += 1;
        run.score = Math.max(0, run.score - 25);
        hud.showToast('TOO HIGH — CANYON DASH IS LOW LEVEL (−25)', 1400);
      }
    } else {
      lowAltTimer = 0;
    }

    // Stall warning beep.
    if (stallInfo.stalled) {
      warnBeepTimer -= dt;
      if (warnBeepTimer <= 0) { audio.warning(); warnBeepTimer = 0.6; }
    }

    // Ring pass.
    if (run.phase === 'rings' || run.phase === 'takeoff') {
      const passed = checkRingPass(rings, flight.position);
      if (passed) {
        if (run.phase === 'takeoff') run.phase = 'rings';
        const pts = scoreRing(run, flight.speed);
        audio.ring();
        hud.showToast(`RING ${passed.userData.index + 1}  +${pts}`, 1400);
        if (run.phase === 'landing') hud.showToast('ALL RINGS — LAND ON RUNWAY 09', 2200);
      }
      const nxt = nextRing(rings);
      if (nxt && run.phase === 'takeoff' && flight.airborne) run.phase = 'rings';
    }

    // Fuel out: glide only.
    if (flight.engineOut && flight.fuel <= 0 && flight.airborne) {
      hud.setObjective('ENGINE OUT — GLIDE TO THE RUNWAY');
    } else {
      run.objectiveText = missionObjectiveText(run);
    }

    // Time limit.
    const left = run.mission.timeLimitSec ? run.mission.timeLimitSec - run.elapsedSec : null;
    if (left !== null && left <= 0 && run.phase !== 'done') {
      endSortie('TIME UP', 'The clock beat the Kestrel this time.', [
        ['Score', String(run.score)],
        ['Rings flown', `${run.ringsPassed}/${run.mission.rings.length}`],
        ['Time', fmtClock(run.elapsedSec)],
      ]);
    }

    // Ground roll friction after landing.
    if (!flight.airborne && flight.speed > 0) {
      flight.speed = Math.max(0, flight.speed - dt * (flight.throttle > 0.3 ? 0 : 14));
      if (flight.throttle > 0.3 && flight.speed > 5) {
        flight.speed += dt * 8; // taxi power
      }
    }

    checkContact(dt);
    audio.update(flight.throttle, flight.speed, flight.airborne);
    hud.update(flight, run, stallInfo);
  }

  updateJetTransform(dt);
  cameraRig.update(flight, dt);
  renderer.render(scene, camera);
}

// ---------- menu buttons ----------
document.querySelectorAll('.mission-btn[data-mission]').forEach((btn) => {
  btn.addEventListener('click', () => startMission(btn.dataset.mission));
});
$('end-again').addEventListener('click', () => startMission(run.mission.id));
$('end-menu').addEventListener('click', backToMenu);
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
window.addEventListener('pointerdown', () => audio.ensure(), { once: true });

// ---------- boot ----------
loadMission('ring-run');

// Screenshot-friendly scene states: place the jet mid-flight so the
// screenshots show the game at its best, using the game's own code.
function applySceneParam() {
  if (sceneParam === 'ring' || sceneParam === 'cockpit') {
    startMission('ring-run');
    flight.airborne = true;
    flight.grounded = false;
    flight.position.set(-60, 95, 10);
    flight.heading = Math.PI / 2; // east, down the valley
    flight.pitch = -0.02;
    flight.speed = 85;
    flight.throttle = 0.75;
    run.phase = 'rings';
    run.ringsPassed = 2;
    rings[0].userData.passed = true;
    rings[1].userData.passed = true;
    rings[0].children[0].material.color.setHex(0x2ecc71);
    rings[1].children[0].material.color.setHex(0x2ecc71);
    if (sceneParam === 'cockpit') cameraRig.toggle();
    updateJetTransform(0);
    cameraRig.snap(flight);
  } else if (sceneParam === 'approach') {
    startMission('ring-run');
    flight.airborne = true;
    flight.grounded = false;
    flight.position.set(-680, 55, 0);
    flight.heading = Math.PI / 2;
    flight.pitch = -0.05;
    flight.speed = 62;
    flight.throttle = 0.45;
    flight.flaps = true;
    flight.gearDown = true;
    run.phase = 'landing';
    run.ringsPassed = 10;
    rings.forEach((r) => { r.userData.passed = true; r.children[0].material.color.setHex(0x2ecc71); });
    updateJetTransform(0);
    cameraRig.snap(flight);
  }
  // 'menu' (default): leave the title screen up.
}
applySceneParam();

// Debug handle for headless play-testing (read-only state view).
window.__kestrel = {
  get flight() { return flight; },
  get run() { return run; },
  get mode() { return mode; },
  startMission,
};

requestAnimationFrame(tick);
