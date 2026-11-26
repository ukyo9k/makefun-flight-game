// rings.js — glowing course rings (and gates) the pilot flies through.
// A ring is a torus standing upright, facing the course direction, with a
// translucent centre disc and a floating number. Passing is detected by the
// sign change of the aircraft's position against the ring plane while the
// aircraft is inside the ring's radius.
import { THREE } from './three-shim.js';

export function makeRingSet(scene, defs) {
  const rings = [];
  defs.forEach((def, i) => {
    const group = new THREE.Group();
    group.name = `ring-${i + 1}`;
    const radius = def.radius ?? 26;
    const torus = new THREE.Mesh(
      new THREE.TorusGeometry(radius, 1.6, 10, 40),
      new THREE.MeshBasicMaterial({ color: 0xff8c1a }),
    );
    group.add(torus);
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(radius - 1, 32),
      new THREE.MeshBasicMaterial({
        color: 0xffb347, transparent: true, opacity: 0.10,
        side: THREE.DoubleSide, depthWrite: false,
      }),
    );
    group.add(disc);
    // Number label above the ring.
    const label = makeNumberSprite(i + 1);
    label.position.set(0, radius + 12, 0);
    group.add(label);

    group.position.set(def.x, def.y, def.z);
    // Face the ring along the course direction (its normal = +Z rotated).
    group.rotation.y = def.yaw ?? 0;
    group.userData = {
      index: i,
      radius,
      passed: false,
      normal: new THREE.Vector3(0, 0, 1).applyEuler(group.rotation),
      prevSide: null,
    };
    scene.add(group);
    rings.push(group);
  });
  return rings;
}

function makeNumberSprite(n) {
  const cv = document.createElement('canvas');
  cv.width = 128; cv.height = 128;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = 'rgba(8,20,32,0.65)';
  ctx.beginPath(); ctx.arc(64, 64, 56, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#ffd27a'; ctx.lineWidth = 5;
  ctx.beginPath(); ctx.arc(64, 64, 56, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 64px Arial';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(String(n), 64, 68);
  const tex = new THREE.CanvasTexture(cv);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
  sprite.scale.set(22, 22, 1);
  return sprite;
}

// Returns the ring just passed (or null). Call once per frame.
export function checkRingPass(rings, aircraftPos) {
  for (const ring of rings) {
    const u = ring.userData;
    if (u.passed) continue;
    const rel = aircraftPos.clone().sub(ring.position);
    const side = Math.sign(rel.dot(u.normal));
    if (u.prevSide !== null && side !== 0 && side !== u.prevSide) {
      const dist = rel.length();
      if (dist < u.radius * 0.95) {
        u.passed = true;
        ring.children[0].material = ring.children[0].material.clone();
        ring.children[0].material.color.setHex(0x2ecc71); // flown rings turn green
        return ring;
      }
    }
    if (side !== 0) u.prevSide = side;
  }
  return null;
}

export function resetRings(rings) {
  for (const ring of rings) {
    ring.userData.passed = false;
    ring.userData.prevSide = null;
    ring.children[0].material.color.setHex(0xff8c1a);
  }
}

export function nextRing(rings) {
  return rings.find((r) => !r.userData.passed) ?? null;
}
