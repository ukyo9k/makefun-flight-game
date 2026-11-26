// camera.js — chase camera that never fights the pilot, plus a cockpit view.
// The chase camera trails the jet on a smoothed spring; the cockpit camera
// sits at the canopy and looks along the nose.
import { THREE } from './three-shim.js';

export function createCameraRig(camera) {
  const chasePos = new THREE.Vector3();
  const chaseLook = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  let mode = 'chase'; // 'chase' | 'cockpit'

  function toggle() {
    mode = mode === 'chase' ? 'cockpit' : 'chase';
    return mode;
  }
  function getMode() { return mode; }

  function update(flight, dt) {
    const pos = flight.position;
    // Body orientation: nose (-Z) onto the forward vector (sin h, 0, -cos h)
    // needs yaw -heading, pitch as flown, roll -roll so the right wing drops.
    const q = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(flight.pitch, -flight.heading, -flight.roll, 'YXZ'),
    );
    if (mode === 'cockpit') {
      const eye = new THREE.Vector3(0, 1.3, -3.1).applyQuaternion(q).add(pos);
      const fwd = new THREE.Vector3(0, -0.06, -1).applyQuaternion(q);
      camera.position.copy(eye);
      camera.up.set(0, 1, 0);
      camera.lookAt(eye.clone().add(fwd));
      camera.fov = 72;
      camera.updateProjectionMatrix();
      return;
    }
    // Chase: behind and above, in the jet's own frame.
    const back = new THREE.Vector3(0, 4.8, 20).applyQuaternion(q).add(pos);
    const look = new THREE.Vector3(0, 0.8, -30).applyQuaternion(q).add(pos);
    const k = 1 - Math.exp(-dt * 5.5);
    chasePos.lerp(back, k);
    chaseLook.lerp(look, k);
    // Keep the camera out of the terrain.
    chasePos.y = Math.max(chasePos.y, 4);
    camera.position.copy(chasePos);
    camera.up.set(0, 1, 0);
    camera.lookAt(chaseLook);
    camera.fov = 62;
    camera.updateProjectionMatrix();
    // Roll the camera a touch with the jet so banks read on screen.
    camera.rotateZ(flight.roll * 0.22);
  }

  function snap(flight) {
    const q = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(flight.pitch, -flight.heading, -flight.roll, 'YXZ'),
    );
    chasePos.copy(new THREE.Vector3(0, 4.8, 20).applyQuaternion(q).add(flight.position));
    chaseLook.copy(new THREE.Vector3(0, 0.8, -30).applyQuaternion(q).add(flight.position));
  }

  return { update, toggle, getMode, snap };
}
