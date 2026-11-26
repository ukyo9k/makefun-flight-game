// terrain.js — builds Aeris Vale: a 4.4 km valley with a river lake, a
// flattened runway strip, ridged mountains on both flanks and a dawn sky dome.
// Also owns groundHeight(x, z), the single source of truth for collisions,
// ring placement and the landing check.
import { THREE } from './three-shim.js';
import { makeNoise } from './noise.js';

export const WORLD = {
  size: 4400,            // terrain spans -2200..2200 on x and z
  runwayLength: 900,
  runwayWidth: 46,
  runwayHeadingDeg: 90,  // runway runs east-west; landing heading 090
  lakeCenter: { x: -1150, z: 900 },
  lakeRadius: 420,
};

const noise = makeNoise(20261126);

// Ridge profile: mountains rise toward the map edges, the valley floor
// stays low along the runway corridor (z near 0) and the river (x < -700).
function ridgeProfile(x, z) {
  const ax = Math.abs(x) / (WORLD.size / 2);
  const az = Math.abs(z) / (WORLD.size / 2);
  const edge = Math.max(ax, az);
  let h = Math.pow(Math.max(0, edge - 0.28) / 0.72, 1.7) * 520;
  // A second ridge line crossing the valley mid-way, for the rings to weave.
  const spine = Math.exp(-Math.pow((x - 650) / 260, 2)) * 150 * (0.5 + 0.5 * Math.sin(z * 0.0016));
  h += Math.max(0, spine);
  return h;
}

export function groundHeight(x, z) {
  // Flatten a generous pad around the runway so take-off and landing are fair.
  const runwayPad = smoothBox(x, z, 0, 0, 620, 150);
  const fbm = noise.fbm(x * 0.0011 + 7.3, z * 0.0011 + 2.9, 4);
  let h = (fbm - 0.5) * 170 + ridgeProfile(x, z);
  // River valley carve on the west side, feeding the lake.
  const river = Math.exp(-Math.pow((z - 900) / 190, 2)) * Math.max(0, -x - 300) * 0.09;
  h -= Math.min(river, 60);
  h = h * (1 - runwayPad);
  // Lake floor sits below water level.
  const dLake = Math.hypot(x - WORLD.lakeCenter.x, z - WORLD.lakeCenter.z);
  if (dLake < WORLD.lakeRadius) {
    const t = Math.max(0, 1 - dLake / WORLD.lakeRadius);
    h = h * (1 - t) + (-14) * t;
  }
  return h;
}

function smoothBox(x, z, cx, cz, hx, hz) {
  const dx = Math.max(0, Math.abs(x - cx) - hx) / 220;
  const dz = Math.max(0, Math.abs(z - cz) - hz) / 220;
  const d = Math.min(1, Math.hypot(dx, dz));
  const t = Math.max(0, 1 - d);
  return t * t * (3 - 2 * t);
}

export function isWater(x, z) {
  const d = Math.hypot(x - WORLD.lakeCenter.x, z - WORLD.lakeCenter.z);
  return d < WORLD.lakeRadius - 12 && groundHeight(x, z) < -4;
}

function heightColor(h, slope) {
  // Valley grass -> dry scrub -> rock -> snow, tinted by slope.
  const c = new THREE.Color();
  if (h < 6) c.setHex(0x5d8a4a);            // low meadow
  else if (h < 60) c.setHex(0x6f9150);      // grass
  else if (h < 160) c.setHex(0x8a7a4e);     // dry scrub
  else if (h < 300) c.setHex(0x7d6a58);     // rock
  else c.setHex(0xe8eef2);                  // snow
  const shade = 1 - Math.min(0.35, slope * 0.5);
  c.multiplyScalar(shade);
  return c;
}

export function buildTerrain(scene) {
  const SEG = 150;
  const size = WORLD.size;
  const geo = new THREE.PlaneGeometry(size, size, SEG, SEG);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const tmp = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const h = groundHeight(x, z);
    pos.setY(i, h);
    const hx = groundHeight(x + 8, z) - groundHeight(x - 8, z);
    const hz = groundHeight(x, z + 8) - groundHeight(x, z - 8);
    const slope = Math.hypot(hx, hz) / 16;
    const c = heightColor(h, slope);
    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'vale-terrain';
  scene.add(mesh);

  buildRunway(scene);
  buildLake(scene);
  buildTrees(scene);
  buildSky(scene);
  return mesh;
}

function buildRunway(scene) {
  const g = new THREE.Group();
  g.name = 'runway-09';
  const strip = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD.runwayWidth, WORLD.runwayLength),
    new THREE.MeshLambertMaterial({ color: 0x3a3f45 }),
  );
  strip.rotation.x = -Math.PI / 2;
  strip.rotation.z = Math.PI / 2; // runway runs along x (east-west)
  strip.position.y = 0.6;
  g.add(strip);
  // Centreline dashes.
  const dashMat = new THREE.MeshBasicMaterial({ color: 0xf5f5e8 });
  for (let x = -400; x <= 400; x += 60) {
    const dash = new THREE.Mesh(new THREE.PlaneGeometry(4, 26), dashMat);
    dash.rotation.x = -Math.PI / 2;
    dash.position.set(x, 0.75, 0);
    g.add(dash);
  }
  // Threshold bars at both ends.
  for (const end of [-WORLD.runwayLength / 2 + 18, WORLD.runwayLength / 2 - 18]) {
    for (let k = -2; k <= 2; k++) {
      const bar = new THREE.Mesh(new THREE.PlaneGeometry(5, 22), dashMat);
      bar.rotation.x = -Math.PI / 2;
      bar.position.set(end, 0.75, k * 9);
      g.add(bar);
    }
  }
  // "09" numbers as simple block glyphs (two planes of canvas texture).
  g.add(makeTextPlane('09', 34, -WORLD.runwayLength / 2 + 70, 0.8, 0));
  g.add(makeTextPlane('27', 34, WORLD.runwayLength / 2 - 70, 0.8, 0));
  // Runway edge lights (emissive dots, read clearly at dawn).
  const lightGeo = new THREE.SphereGeometry(1.1, 8, 6);
  const lightMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
  for (let x = -430; x <= 430; x += 43) {
    for (const z of [-WORLD.runwayWidth / 2 - 3, WORLD.runwayWidth / 2 + 3]) {
      const l = new THREE.Mesh(lightGeo, lightMat);
      l.position.set(x, 1.2, z);
      g.add(l);
    }
  }
  // Windsocks + a small hangar beside the strip.
  const sock = makeWindsock();
  sock.position.set(60, 0, 60);
  g.add(sock);
  const hangar = new THREE.Mesh(
    new THREE.BoxGeometry(60, 22, 40),
    new THREE.MeshLambertMaterial({ color: 0x9aa7b0 }),
  );
  hangar.position.set(-120, 11, 85);
  g.add(hangar);
  const roof = new THREE.Mesh(
    new THREE.CylinderGeometry(20, 20, 60, 12, 1, false, 0, Math.PI),
    new THREE.MeshLambertMaterial({ color: 0x5d707c }),
  );
  roof.rotation.z = Math.PI / 2; roof.rotation.y = Math.PI / 2;
  roof.position.set(-120, 22, 85);
  g.add(roof);
  scene.add(g);
}

function makeTextPlane(text, size, x, y, z) {
  const cv = document.createElement('canvas');
  cv.width = 128; cv.height = 128;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#f5f5e8';
  ctx.font = `bold ${size * 2.4}px Arial`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, 64, 68);
  const tex = new THREE.CanvasTexture(cv);
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(34, 34),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true }),
  );
  m.rotation.x = -Math.PI / 2;
  m.rotation.z = Math.PI / 2;
  m.position.set(x, y, z);
  return m;
}

function makeWindsock() {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.5, 0.5, 14, 6),
    new THREE.MeshLambertMaterial({ color: 0xd8d8d8 }),
  );
  pole.position.y = 7;
  g.add(pole);
  const cone = new THREE.Mesh(
    new THREE.ConeGeometry(2.2, 9, 10),
    new THREE.MeshLambertMaterial({ color: 0xff7a2a }),
  );
  cone.rotation.z = -Math.PI / 2;
  cone.position.set(4.5, 13.4, 0);
  g.add(cone);
  return g;
}

function buildLake(scene) {
  const lake = new THREE.Mesh(
    new THREE.CircleGeometry(WORLD.lakeRadius, 48),
    new THREE.MeshLambertMaterial({ color: 0x2f6f9e, transparent: true, opacity: 0.92 }),
  );
  lake.rotation.x = -Math.PI / 2;
  lake.position.set(WORLD.lakeCenter.x, -2, WORLD.lakeCenter.z);
  lake.name = 'mirror-lake';
  scene.add(lake);
}

function buildTrees(scene) {
  // Low-poly conifers scattered on the valley floor, kept clear of the runway.
  const trunkGeo = new THREE.CylinderGeometry(0.8, 1.2, 6, 5);
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x6b4a2f });
  const coneGeo = new THREE.ConeGeometry(5, 16, 7);
  const coneMat = new THREE.MeshLambertMaterial({ color: 0x2e5d33 });
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, 320);
  const cones = new THREE.InstancedMesh(coneGeo, coneMat, 320);
  const m = new THREE.Matrix4();
  const n = makeNoise(777);
  let placed = 0, tries = 0;
  while (placed < 320 && tries < 4000) {
    tries++;
    const x = (n.rand() - 0.5) * 3800;
    const z = (n.rand() - 0.5) * 3800;
    const h = groundHeight(x, z);
    if (h < 2 || h > 150) continue;
    if (Math.abs(z) < 130 && Math.abs(x) < 700) continue; // keep the strip clear
    if (isWater(x, z)) continue;
    const s = 0.8 + n.rand() * 1.1;
    m.makeScale(s, s, s);
    m.setPosition(x, h + 3 * s, z);
    trunks.setMatrixAt(placed, m);
    m.setPosition(x, h + (6 + 8) * s, z);
    cones.setMatrixAt(placed, m);
    placed++;
  }
  trunks.count = placed; cones.count = placed;
  scene.add(trunks); scene.add(cones);
}

function buildSky(scene) {
  // Gradient dawn dome with a low sun glow in the east.
  const geo = new THREE.SphereGeometry(5200, 24, 16);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      top: { value: new THREE.Color(0x2a4d7a) },
      mid: { value: new THREE.Color(0x7fb2d9) },
      low: { value: new THREE.Color(0xf7b267) },
      sunDir: { value: new THREE.Vector3(0.85, 0.18, -0.25).normalize() },
    },
    vertexShader: `
      varying vec3 vDir;
      void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `
      varying vec3 vDir;
      uniform vec3 top; uniform vec3 mid; uniform vec3 low; uniform vec3 sunDir;
      void main() {
        float h = clamp(vDir.y, -0.08, 1.0);
        vec3 col = mix(low, mid, smoothstep(-0.02, 0.22, h));
        col = mix(col, top, smoothstep(0.25, 0.85, h));
        float sun = pow(max(dot(normalize(vDir), sunDir), 0.0), 90.0);
        col += vec3(1.0, 0.75, 0.4) * sun * 1.4;
        float halo = pow(max(dot(normalize(vDir), sunDir), 0.0), 6.0);
        col += vec3(1.0, 0.6, 0.25) * halo * 0.18;
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const sky = new THREE.Mesh(geo, mat);
  sky.name = 'dawn-sky';
  scene.add(sky);
  scene.fog = new THREE.Fog(0x9db8cc, 900, 4200);

  // A few soft billboard clouds.
  const cloudMat = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 });
  const cn = makeNoise(4242);
  for (let i = 0; i < 14; i++) {
    const cl = new THREE.Group();
    const puffs = 3 + Math.floor(cn.rand() * 3);
    for (let p = 0; p < puffs; p++) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(28 + cn.rand() * 30, 10, 8), cloudMat);
      s.position.set((cn.rand() - 0.5) * 120, (cn.rand() - 0.5) * 14, (cn.rand() - 0.5) * 40);
      s.scale.y = 0.45;
      cl.add(s);
    }
    cl.position.set((cn.rand() - 0.5) * 4200, 420 + cn.rand() * 220, (cn.rand() - 0.5) * 4200);
    scene.add(cl);
  }
}
