// missions.js — the three sorties of Kestrel Ridge Run.
// Each mission is data: a name, a briefing, a spawn, a list of ring
// definitions and a landing goal. The mission engine tracks the current
// objective, the score and the clock, and decides when a sortie is won.
import { groundHeight, WORLD } from './terrain.js';

export const MISSIONS = {
  'ring-run': {
    id: 'ring-run',
    name: 'Ring Run',
    briefing: 'Thread all 10 rings through the valley, then land on Runway 09.',
    spawn: { x: -350, y: 0.8, z: 0, headingDeg: 90, speed: 0, throttle: 0, airborne: false },
    timeLimitSec: 0, // no clock
    rings: ringValleyCourse(),
    landing: { runway: true },
    ringPoints: 100,
    landingPoints: 500,
  },
  'canyon-dash': {
    id: 'canyon-dash',
    name: 'Canyon Dash',
    briefing: 'Low-level sprint: 6 gates, stay under 500 ft, beat the clock.',
    spawn: { x: -350, y: 0.8, z: 0, headingDeg: 270, speed: 0, throttle: 0, airborne: false },
    timeLimitSec: 240,
    maxAltFt: 500,
    rings: ringCanyonCourse(),
    landing: { runway: true },
    ringPoints: 150,
    landingPoints: 400,
  },
  'precision-landing': {
    id: 'precision-landing',
    name: 'Precision Landing',
    briefing: 'Take off, climb to the beacon at 2,000 ft, then grease it on the numbers.',
    spawn: { x: -350, y: 0.8, z: 0, headingDeg: 90, speed: 0, throttle: 0, airborne: false },
    timeLimitSec: 0,
    rings: ringBeaconCourse(),
    landing: { runway: true, precision: true },
    ringPoints: 100,
    landingPoints: 800,
  },
};

// Valley course: rings snake east along the runway corridor, weaving
// around the mid-valley ridge, then turn back toward the runway. Each
// ring faces the leg that leads into it (yaw from the segment direction).
function ringValleyCourse() {
  const pts = [
    [-250, 55, -60], [-80, 70, 40], [120, 85, -50], [320, 110, 60],
    [520, 150, -40], [700, 190, 50], [880, 170, -30], [1020, 120, 40],
    [900, 80, -120], [620, 60, -140],
  ];
  return pts.map(([x, y, z], i) => {
    const next = pts[Math.min(i + 1, pts.length - 1)];
    const prev = pts[Math.max(i - 1, 0)];
    const dx = next[0] - prev[0], dz = next[2] - prev[2];
    return {
      x, y: y + groundHeight(x, z) * 0.4, z,
      radius: 26,
      yaw: Math.atan2(dx, dz),
    };
  });
}

// Canyon course: low gates down the river valley to the lake and back.
function ringCanyonCourse() {
  const pts = [
    [-560, 45, 120], [-760, 48, 380], [-950, 52, 640], [-1120, 55, 880],
    [-900, 60, 1080], [-620, 65, 900],
  ];
  return pts.map(([x, y, z], i) => {
    const next = pts[Math.min(i + 1, pts.length - 1)];
    const prev = pts[Math.max(i - 1, 0)];
    const dx = next[0] - prev[0], dz = next[2] - prev[2];
    return {
      x, y: Math.max(y, groundHeight(x, z) + 42), z,
      radius: 24,
      yaw: Math.atan2(dx, dz),
    };
  });
}

// Beacon course: a single high ring to climb to, then the landing.
function ringBeaconCourse() {
  return [
    { x: 350, y: 620, z: -260, radius: 30, yaw: Math.PI / 2 },
  ];
}

export function createMissionRun(missionId) {
  const mission = MISSIONS[missionId] ?? MISSIONS['ring-run'];
  return {
    mission,
    ringsPassed: 0,
    score: 0,
    elapsedSec: 0,
    phase: 'takeoff', // takeoff -> rings -> landing -> done
    landed: false,
    crashed: false,
    lowAltViolations: 0,
    landingQuality: null,
  };
}

export function missionObjectiveText(run) {
  const m = run.mission;
  if (run.phase === 'takeoff') return 'Take off from Runway 09 — full throttle, rotate at 65 kt.';
  if (run.phase === 'rings') {
    const total = m.rings.length;
    const next = run.ringsPassed + 1;
    if (m.id === 'precision-landing') return `Climb to the beacon ring (${next}/${total}) — 2,000 ft.`;
    if (m.id === 'canyon-dash') return `Gate ${next} of ${total} — stay under 500 ft!`;
    return `Fly through ring ${next} of ${total}.`;
  }
  if (run.phase === 'landing') {
    return m.landing.precision
      ? 'Land on Runway 09 — on the numbers, gentle as you can.'
      : 'All rings flown — land on Runway 09 to finish.';
  }
  return 'Sortie complete.';
}

// Score a ring pass; returns points earned (with a speed bonus).
export function scoreRing(run, speedMs) {
  const base = run.mission.ringPoints;
  const speedBonus = Math.round(Math.max(0, Math.min(50, (speedMs - 55) * 1.2)));
  const pts = base + speedBonus;
  run.score += pts;
  run.ringsPassed += 1;
  if (run.ringsPassed >= run.mission.rings.length) run.phase = 'landing';
  return pts;
}

// Score a landing. quality 0..1 from touchdown vertical speed, centreline
// offset and speed; returns points earned.
export function scoreLanding(run, quality) {
  const pts = Math.round(run.mission.landingPoints * (0.4 + 0.6 * quality));
  run.score += pts;
  run.landed = true;
  run.phase = 'done';
  run.landingQuality = quality;
  return pts;
}

export function missionTimeLeft(run) {
  if (!run.mission.timeLimitSec) return null;
  return Math.max(0, run.mission.timeLimitSec - run.elapsedSec);
}

export { WORLD };
