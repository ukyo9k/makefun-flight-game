// flight.js — arcade flight model for the KV-7 Kestrel.
// Speeds in m/s, altitudes in metres, angles in radians. The model is
// deliberately simple and readable: thrust, drag, lift vs stall, banked
// turns, flaps, gear drag, fuel burn and damage from hard contact.
import { THREE } from './three-shim.js';

export const FLIGHT = {
  stallClean: 30,     // m/s, clean configuration
  stallFlaps: 22,     // m/s, flaps down
  maxSpeed: 165,      // m/s at full throttle, level
  cruiseSpeed: 95,
  maxThrottle: 1,
  fuelCapacity: 100,
  fuelBurnPerSec: 0.16, // at full throttle; 0.05 at idle
  rotateSpeed: 34,
};

export function createFlightState(spawn) {
  return {
    position: new THREE.Vector3(spawn.x, spawn.y, spawn.z),
    heading: spawn.headingDeg * Math.PI / 180, // 0 = north (-Z), 90 = east (+X)
    pitch: 0,
    roll: 0,
    speed: spawn.speed,
    throttle: spawn.throttle ?? 0,
    flaps: false,
    gearDown: true,
    fuel: 100,
    damage: 0,
    airborne: spawn.airborne ?? false,
    verticalSpeed: 0,
    grounded: !spawn.airborne,
    engineOut: false,
    // control smoothing
    pitchRate: 0,
    rollRate: 0,
  };
}

// ctrl: { pitch: -1..1 (pull up positive), roll: -1..1, yaw: -1..1,
//         throttleDelta: -1..1, mouseSteer: -1..1 }
export function stepFlight(state, ctrl, dt) {
  const stall = state.flaps ? FLIGHT.stallFlaps : FLIGHT.stallClean;

  // --- throttle ---
  state.throttle = clamp(state.throttle + ctrl.throttleDelta * dt * 0.55, 0, 1);

  // --- fuel ---
  if (!state.engineOut) {
    const burn = (0.05 + state.throttle * 0.14) * dt;
    state.fuel = Math.max(0, state.fuel - burn);
    if (state.fuel <= 0) state.engineOut = true;
  }
  const thrust = state.engineOut ? 0 : state.throttle;

  // --- control authority grows with speed (controls answer at every speed,
  // but weakly near stall, strongly at cruise) ---
  const authority = clamp((state.speed - 8) / 70, 0.15, 1);

  // Pitch: pull up positive. Roll: bank right positive. Yaw: rudder.
  const targetPitchRate = ctrl.pitch * 0.55 * authority;
  const targetRollRate = (ctrl.roll + ctrl.mouseSteer * 0.6) * 1.15 * authority;
  state.pitchRate += (targetPitchRate - state.pitchRate) * Math.min(1, dt * 6);
  state.rollRate += (targetRollRate - state.rollRate) * Math.min(1, dt * 6);
  state.pitch = clamp(state.pitch + state.pitchRate * dt, -0.6, 0.6);
  state.roll = clamp(state.roll + state.rollRate * dt, -1.25, 1.25);
  // Roll damps back toward level when the stick is centred.
  if (Math.abs(ctrl.roll + ctrl.mouseSteer) < 0.05) {
    state.roll *= Math.max(0, 1 - dt * 0.55);
  }
  // Pitch eases back toward level flight too (a stable little jet).
  if (Math.abs(ctrl.pitch) < 0.05) {
    state.pitch *= Math.max(0, 1 - dt * 0.35);
  }

  // Banked turn: heading changes with roll and speed. Banking right
  // (roll positive) turns right: heading grows from north toward east.
  const turnRate = Math.tan(state.roll) * 9.81 / Math.max(25, state.speed);
  state.heading += (turnRate + ctrl.yaw * 0.22 * authority) * dt;

  // --- speed: thrust vs drag, gravity along the flight path ---
  const dragBase = 0.011;
  const dragFlaps = state.flaps ? 0.012 : 0;
  const dragGear = state.gearDown ? 0.006 : 0;
  const drag = dragBase + dragFlaps + dragGear + 0.00006 * state.speed;
  const accel = thrust * 26 - drag * state.speed * state.speed * 0.32
    - Math.sin(state.pitch) * 9.81 * 0.9;
  state.speed = Math.max(0, state.speed + accel * dt);
  if (state.speed > FLIGHT.maxSpeed) state.speed = FLIGHT.maxSpeed;

  // --- lift: above stall the jet holds its pitch; below it, it sinks ---
  const liftFactor = clamp(state.speed / stall, 0, 1.25);
  const climbRate = Math.sin(state.pitch) * state.speed * liftFactor;
  const sinkRate = (1 - liftFactor) * 9.5 + (state.flaps ? -1.2 : 0);
  state.verticalSpeed = climbRate - Math.max(0, sinkRate) * (state.airborne ? 1 : 0);
  if (!state.airborne) state.verticalSpeed = 0;

  // --- move ---
  const fwd = new THREE.Vector3(
    Math.sin(state.heading), 0, -Math.cos(state.heading),
  );
  const horiz = fwd.clone().multiplyScalar(Math.cos(state.pitch));
  state.position.addScaledVector(horiz, state.speed * dt);
  state.position.y += state.verticalSpeed * dt;

  // --- ground handling: rolling on the runway ---
  if (!state.airborne) {
    if (state.speed >= FLIGHT.rotateSpeed && state.pitch > 0.08) {
      state.airborne = true;
      state.grounded = false;
    }
  }
  return { stall, liftFactor };
}

export function isStalled(state, stall) {
  return state.airborne && state.speed < stall * 1.05;
}

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

// Heading in degrees, 0..360, for the HUD compass.
export function headingDeg(state) {
  return ((state.heading * 180 / Math.PI) % 360 + 360) % 360;
}

// Knots / feet for the instruments (pilots think in knots and feet).
export function knots(ms) { return ms * 1.94384; }
export function feet(m) { return m * 3.28084; }
export function fpm(ms) { return ms * 196.85; }
