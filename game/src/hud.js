// hud.js — the instrument panel: airspeed, altitude, vertical speed,
// throttle, fuel and damage bars, a scrolling compass, an artificial
// horizon, warning lights, mission objective and score. All DOM, so the
// instruments stay crisp in screenshots.
import { knots, feet, fpm, headingDeg } from './flight.js';

const $ = (id) => document.getElementById(id);
const COMPASS_POINTS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

export function createHud() {
  const horizonCtx = $('horizon').getContext('2d');
  let toastTimer = null;

  function fmtTime(sec) {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  function updateCompass(heading) {
    const strip = $('compass-strip');
    let html = '';
    for (let d = -60; d <= 60; d += 15) {
      let h = Math.round((heading + d) / 15) * 15;
      const norm = ((h % 360) + 360) % 360;
      const label = norm % 90 === 0
        ? COMPASS_POINTS[(norm / 45) % 8]
        : String(norm).padStart(3, '0');
      html += `<span class="tick${d === 0 ? ' hot' : ''}">${label}</span>`;
    }
    strip.innerHTML = html;
    $('hud-hdg').textContent = String(Math.round(heading)).padStart(3, '0');
  }

  function drawHorizon(pitch, roll) {
    const c = horizonCtx;
    const w = 150, h = 150;
    c.clearRect(0, 0, w, h);
    c.save();
    c.beginPath(); c.arc(w / 2, h / 2, 72, 0, Math.PI * 2); c.clip();
    c.translate(w / 2, h / 2);
    c.rotate(-roll);
    const pitchPx = pitch * 110;
    // Sky above the horizon line, ground below.
    c.fillStyle = '#3f7fb8';
    c.fillRect(-90, -90 + pitchPx, 180, 90);
    c.fillStyle = '#7a5a34';
    c.fillRect(-90, pitchPx, 180, 90);
    c.strokeStyle = '#ffffff'; c.lineWidth = 2;
    c.beginPath(); c.moveTo(-72, pitchPx); c.lineTo(72, pitchPx); c.stroke();
    c.restore();
    // Fixed wings marker.
    c.strokeStyle = '#ffd27a'; c.lineWidth = 3;
    c.beginPath();
    c.moveTo(w / 2 - 46, h / 2); c.lineTo(w / 2 - 14, h / 2);
    c.moveTo(w / 2 + 14, h / 2); c.lineTo(w / 2 + 46, h / 2);
    c.moveTo(w / 2, h / 2 - 6); c.lineTo(w / 2, h / 2 + 6);
    c.stroke();
  }

  function showToast(text, ms = 1800) {
    const el = $('hud-toast');
    el.textContent = text;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), ms);
  }

  function setWarning(id, on, amber = false) {
    const el = $(id);
    el.classList.toggle('on', on);
    el.classList.toggle('amber', amber && on);
  }

  return {
    update(flight, run, stallInfo) {
      $('hud-speed').textContent = Math.round(knots(flight.speed));
      $('hud-alt').textContent = Math.round(feet(Math.max(0, flight.position.y)));
      $('hud-vs').textContent = Math.round(fpm(flight.verticalSpeed));
      $('hud-thr').textContent = Math.round(flight.throttle * 100);
      $('hud-fuel').textContent = Math.round(flight.fuel);
      $('hud-fuel-bar').style.width = `${flight.fuel}%`;
      $('hud-dmg').textContent = Math.round(flight.damage);
      $('hud-dmg-bar').style.width = `${flight.damage}%`;
      $('hud-flaps').textContent = flight.flaps ? 'DOWN' : 'UP';
      $('hud-gear').textContent = flight.gearDown ? 'DOWN' : 'UP';
      $('hud-score-value').textContent = String(run.score);
      $('hud-timer').textContent = fmtTime(run.elapsedSec);
      $('hud-mission').textContent = `${run.mission.name.toUpperCase()} · ${run.phase.toUpperCase()}`;
      $('hud-objective-text').textContent = run.objectiveText;
      $('hud-ring-count').textContent = `${run.ringsPassed}/${run.mission.rings.length}`;
      updateCompass(headingDeg(flight));
      drawHorizon(flight.pitch, flight.roll);
      setWarning('warn-stall', stallInfo.stalled);
      setWarning('warn-gear', !flight.gearDown && flight.airborne && flight.position.y < 120, true);
      setWarning('warn-fuel', flight.fuel < 20, true);
      setWarning('warn-terrain', stallInfo.terrainClose);
    },
    showToast,
    setObjective(text) { $('hud-objective-text').textContent = text; },
  };
}
