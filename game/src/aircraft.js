// aircraft.js — builds the KV-7 Kestrel, a single-seat dawn-patrol jet,
// from three.js primitives: no borrowed art, just a fuselage, swept wings,
// tail, glass canopy, nav lights and retractable gear.
import { THREE } from './three-shim.js';

export function buildAircraft() {
  const jet = new THREE.Group();
  jet.name = 'kv7-kestrel';

  const orange = new THREE.MeshLambertMaterial({ color: 0xe8622a });
  const cream = new THREE.MeshLambertMaterial({ color: 0xf2ead8 });
  const dark = new THREE.MeshLambertMaterial({ color: 0x2b343c });
  const glass = new THREE.MeshPhongMaterial({ color: 0x1a2f45, shininess: 120, specular: 0x99ccff });
  const steel = new THREE.MeshLambertMaterial({ color: 0x8d99a3 });

  // Fuselage: nose cone + body + tail cone, nose toward -Z (forward).
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.85, 3.4, 12), orange);
  nose.rotation.x = -Math.PI / 2;
  nose.position.set(0, 0, -4.6);
  jet.add(nose);

  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.62, 5.6, 12), cream);
  body.rotation.x = Math.PI / 2;
  body.position.set(0, 0, -0.6);
  jet.add(body);

  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.62, 2.2, 12), orange);
  tail.rotation.x = Math.PI / 2;
  tail.position.set(0, 0, 3.2);
  jet.add(tail);

  // Canopy: a flattened glass bubble on top of the nose.
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.72, 14, 10), glass);
  canopy.scale.set(0.82, 0.62, 1.7);
  canopy.position.set(0, 0.55, -2.4);
  jet.add(canopy);

  // Main wings: swept, slightly tapered boxes.
  const wingGeo = new THREE.BoxGeometry(11.4, 0.22, 2.4);
  const wings = new THREE.Mesh(wingGeo, orange);
  wings.position.set(0, -0.12, 0.4);
  wings.rotation.y = 0.0;
  jet.add(wings);
  // Wingtip tanks (small, cream).
  for (const sx of [-1, 1]) {
    const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 1.6, 8), cream);
    tip.rotation.x = Math.PI / 2;
    tip.position.set(sx * 5.7, -0.12, 0.4);
    jet.add(tip);
    // Nav light: red port, green starboard.
    const light = new THREE.Mesh(
      new THREE.SphereGeometry(0.14, 8, 6),
      new THREE.MeshBasicMaterial({ color: sx < 0 ? 0xff2222 : 0x22ff66 }),
    );
    light.position.set(sx * 5.85, -0.05, 0.4);
    light.name = sx < 0 ? 'nav-port' : 'nav-starboard';
    jet.add(light);
  }

  // Tailplane and fin.
  const tailplane = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.16, 1.4), cream);
  tailplane.position.set(0, 0.1, 3.4);
  jet.add(tailplane);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.18, 2.0, 1.9), orange);
  fin.position.set(0, 1.0, 3.3);
  fin.rotation.x = -0.35;
  jet.add(fin);

  // Engine intake + exhaust glow.
  const intake = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.55, 0.8, 10), dark);
  intake.rotation.x = Math.PI / 2;
  intake.position.set(0, -0.15, -1.6);
  jet.add(intake);
  const exhaust = new THREE.Mesh(
    new THREE.CircleGeometry(0.5, 12),
    new THREE.MeshBasicMaterial({ color: 0xffb347 }),
  );
  exhaust.position.set(0, 0, 4.32);
  exhaust.rotation.y = Math.PI;
  exhaust.name = 'exhaust-glow';
  jet.add(exhaust);

  // Landing gear (visible when down): nose wheel + two mains.
  const gear = new THREE.Group();
  gear.name = 'landing-gear';
  const strutMat = steel;
  const wheelMat = dark;
  function wheel(x, y, z) {
    const g = new THREE.Group();
    const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 1.0, 6), strutMat);
    strut.position.y = 0.5;
    g.add(strut);
    const tyre = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.24, 10), wheelMat);
    tyre.rotation.z = Math.PI / 2;
    g.add(tyre);
    g.position.set(x, y, z);
    return g;
  }
  gear.add(wheel(0, -1.55, -2.6));
  gear.add(wheel(-1.15, -1.55, 1.1));
  gear.add(wheel(1.15, -1.55, 1.1));
  jet.add(gear);

  // Registration stripe along the fuselage.
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(1.72, 0.1, 4.4), dark);
  stripe.position.set(0, 0.32, -0.6);
  jet.add(stripe);

  jet.traverse((o) => { if (o.isMesh) o.castShadow = false; });
  return { group: jet, gear, exhaust };
}
