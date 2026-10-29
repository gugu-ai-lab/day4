import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 2000);
camera.position.set(0, 30, 60);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; controls.maxDistance = 300; controls.enabled = false;

// ---------------------------------------------------------------- procedural textures
function hash(x, y) { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); }
function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  return (hash(xi, yi) * (1 - u) + hash(xi + 1, yi) * u) * (1 - v) + (hash(xi, yi + 1) * (1 - u) + hash(xi + 1, yi + 1) * u) * v;
}
function fbm(x, y, o = 5) { let a = .5, s = 0; for (let i = 0; i < o; i++) { s += a * vnoise(x, y); x *= 2; y *= 2; a *= .5; } return s; }
function makeTexture(w, h, fn) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d'), img = ctx.createImageData(w, h);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const [r, g, b] = fn(i / w, j / h); const k = (j * w + i) * 4;
    img.data[k] = r * 255; img.data[k + 1] = g * 255; img.data[k + 2] = b * 255; img.data[k + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const TEX = {
  rock: (c1, c2) => makeTexture(512, 256, (u, v) => mix(c1, c2, fbm(u * 9, v * 5, 6))),
  banded: (cols) => makeTexture(512, 256, (u, v) => {
    const n = fbm(u * 6 + v * 2, v * 22, 4), t = (v * (cols.length - 1) + (n - .5) * 1.4);
    const i = Math.max(0, Math.min(cols.length - 2, Math.floor(t))); return mix(cols[i], cols[i + 1], Math.max(0, Math.min(1, t - i)));
  }),
  earth: () => makeTexture(512, 256, (u, v) => {
    const h = fbm(u * 6, v * 3.5, 6), polar = Math.abs(v - .5) * 2;
    if (polar > .9 + (fbm(u * 20, v * 20, 3) - .5) * .2) return [.95, .97, 1];
    if (h < .5) return mix([.02, .1, .35], [.05, .3, .6], h * 2);
    return mix([.1, .4, .12], [.55, .45, .3], (h - .5) * 2.6);
  }),
};

// ---------------------------------------------------------------- stars + nebula backdrop
{
  const N = 6000, p = new Float32Array(N * 3), c = new Float32Array(N * 3), col = new THREE.Color();
  for (let i = 0; i < N; i++) {
    const v = new THREE.Vector3().randomDirection().multiplyScalar(700 + Math.random() * 200); p.set([v.x, v.y, v.z], i * 3);
    col.setHSL(.55 + Math.random() * .15, .5, .65 + Math.random() * .3); c.set([col.r, col.g, col.b], i * 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(p, 3)); g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  scene.add(new THREE.Points(g, new THREE.PointsMaterial({ size: 2.2, vertexColors: true, sizeAttenuation: false, transparent: true, opacity: .9 })));
  const neb = new THREE.Mesh(new THREE.SphereGeometry(900, 48, 24), new THREE.MeshBasicMaterial({
    side: THREE.BackSide, depthWrite: false, map: makeTexture(512, 256, (u, v) => {
      const a = fbm(u * 5, v * 3, 6), b = fbm(u * 3 + 9, v * 2 + 4, 5);
      return [0.01 + a * a * .14, 0.01 + b * b * .05, 0.03 + a * b * .22];
    })
  }));
  scene.add(neb);
}

// ---------------------------------------------------------------- sun
const sun = new THREE.Mesh(new THREE.SphereGeometry(4, 48, 48), new THREE.MeshBasicMaterial({
  map: makeTexture(512, 256, (u, v) => mix([1, .45, .05], [1, .95, .55], fbm(u * 14, v * 7, 5))),
}));
scene.add(sun);
function glowSprite(color, size) {
  const cv = document.createElement('canvas'); cv.width = cv.height = 128; const x = cv.getContext('2d');
  const g = x.createRadialGradient(64, 64, 0, 64, 64, 64); g.addColorStop(0, color); g.addColorStop(.3, color.replace(/[\d.]+\)$/, '.25)')); g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  s.scale.setScalar(size); return s;
}
sun.add(glowSprite('rgba(255,190,90,.9)', 26));
scene.add(new THREE.PointLight(0xfff0d8, 900, 0, 1.6));
scene.add(new THREE.AmbientLight(0x1a2038, 1.2));

// ---------------------------------------------------------------- planets
const planets = [];
function addPlanet({ name, r, orbit, period, tex, tilt = 0, spin = .4, ring, moon, phase = Math.random() * 6.28 }) {
  const pivot = new THREE.Object3D(); scene.add(pivot);
  const body = new THREE.Mesh(new THREE.SphereGeometry(r, 48, 32), new THREE.MeshStandardMaterial({ map: tex, roughness: .85, metalness: 0 }));
  body.position.x = orbit; body.rotation.z = tilt; pivot.add(body);
  if (ring) {
    const rg = new THREE.RingGeometry(r * ring[0], r * ring[1], 96); const pos = rg.attributes.position, uv = rg.attributes.uv;
    for (let i = 0; i < pos.count; i++) { const d = Math.hypot(pos.getX(i), pos.getY(i)); uv.setXY(i, (d - r * ring[0]) / (r * (ring[1] - ring[0])), .5); }
    const rt = makeTexture(256, 4, (u) => { const a = .35 + .65 * fbm(u * 30, 1, 3); const g = (u > .55 && u < .62) ? .1 : 1; return [.8 * a * g, .72 * a * g, .55 * a * g]; });
    const rm = new THREE.Mesh(rg, new THREE.MeshBasicMaterial({ map: rt, side: THREE.DoubleSide, transparent: true, opacity: .85 }));
    rm.rotation.x = Math.PI / 2 - .25; body.add(rm);
  }
  let moonMesh = null;
  if (moon) {
    moonMesh = new THREE.Mesh(new THREE.SphereGeometry(moon.r, 24, 16), new THREE.MeshStandardMaterial({ map: TEX.rock([.45, .45, .47], [.8, .8, .82]), roughness: 1 }));
    scene.add(moonMesh);
  }
  const line = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(Array.from({ length: 128 }, (_, i) => new THREE.Vector3(Math.cos(i / 128 * 6.283) * orbit, 0, Math.sin(i / 128 * 6.283) * orbit))),
    new THREE.LineBasicMaterial({ color: 0x5a7cc0, transparent: true, opacity: .13 }));
  scene.add(line);
  pivot.rotation.y = phase;
  planets.push({ name, pivot, body, period, spin, moon: moonMesh, moonCfg: moon, orbit });
}
addPlanet({ name: 'Mercury', r: .5, orbit: 9, period: 8, tex: TEX.rock([.3, .28, .26], [.7, .65, .6]), spin: .2 });
addPlanet({ name: 'Venus', r: 1.0, orbit: 13.5, period: 14, tex: TEX.banded([[.8, .6, .3], [.95, .82, .55], [.75, .5, .25]]), spin: .1 });
addPlanet({ name: 'Earth', r: 1.1, orbit: 19, period: 22, tex: TEX.earth(), tilt: .4, spin: .6, moon: { r: .3, dist: 2.2, period: 4 } });
addPlanet({ name: 'Mars', r: .75, orbit: 25, period: 32, tex: TEX.rock([.45, .18, .08], [.85, .45, .25]), spin: .55 });
addPlanet({ name: 'Jupiter', r: 3.0, orbit: 40, period: 60, tex: TEX.banded([[.85, .7, .5], [.55, .35, .22], [.95, .85, .7], [.6, .4, .25], [.9, .78, .6]]), spin: 1.0 });
addPlanet({ name: 'Saturn', r: 2.4, orbit: 56, period: 90, tex: TEX.banded([[.9, .8, .55], [.8, .68, .45], [.95, .88, .65]]), tilt: .45, spin: .9, ring: [1.5, 2.6] });
addPlanet({ name: 'Neptune', r: 1.5, orbit: 70, period: 130, tex: TEX.banded([[.1, .25, .75], [.2, .45, .95], [.1, .3, .8]]), spin: .7 });

// ---------------------------------------------------------------- asteroid belt (between Mars and Jupiter)
const belt = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(.12, 0), new THREE.MeshStandardMaterial({ color: 0x8a7f74, roughness: 1, flatShading: true }), 1800);
{
  const m = new THREE.Object3D();
  for (let i = 0; i < belt.count; i++) {
    const a = Math.random() * 6.283, r = 30 + Math.random() * 6 + (Math.random() - .5) * 2;
    m.position.set(Math.cos(a) * r, (Math.random() - .5) * 1.4, Math.sin(a) * r);
    m.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6); m.scale.setScalar(.4 + Math.random() * 1.6);
    m.updateMatrix(); belt.setMatrixAt(i, m.matrix);
  }
  scene.add(belt);
}

// ---------------------------------------------------------------- spaceship
const ship = new THREE.Group();
{
  const hullMat = new THREE.MeshStandardMaterial({ color: 0xcfd6e0, metalness: .75, roughness: .3 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x28303d, metalness: .6, roughness: .4 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(.18, .28, 1.5, 16), hullMat); body.rotation.x = Math.PI / 2; ship.add(body);   // points to -Z
  const nose = new THREE.Mesh(new THREE.ConeGeometry(.18, .55, 16), hullMat); nose.rotation.x = -Math.PI / 2; nose.position.z = -1.0; ship.add(nose);
  const cockpit = new THREE.Mesh(new THREE.SphereGeometry(.17, 16, 12), new THREE.MeshStandardMaterial({ color: 0x66ccff, emissive: 0x1a6fa0, emissiveIntensity: .9, metalness: .9, roughness: .1 }));
  cockpit.scale.set(1, .7, 1.7); cockpit.position.set(0, .2, -.45); ship.add(cockpit);
  for (const s of [-1, 1]) {
    const wing = new THREE.Mesh(new THREE.BoxGeometry(.9, .04, .7), hullMat); wing.position.set(s * .6, -.02, .25); wing.rotation.y = s * -.35; ship.add(wing);
    const tip = new THREE.Mesh(new THREE.BoxGeometry(.05, .3, .35), darkMat); tip.position.set(s * 1.0, .1, .38); ship.add(tip);
    const eng = new THREE.Mesh(new THREE.CylinderGeometry(.1, .13, .5, 12), darkMat); eng.rotation.x = Math.PI / 2; eng.position.set(s * .38, -.02, .65); ship.add(eng);
    const flame = new THREE.Mesh(new THREE.ConeGeometry(.09, .9, 12), new THREE.MeshBasicMaterial({ color: 0x66bbff, transparent: true, opacity: .9, blending: THREE.AdditiveBlending, depthWrite: false }));
    flame.rotation.x = Math.PI / 2; flame.position.set(s * .38, -.02, 1.3); flame.name = 'flame'; ship.add(flame);
    const g = glowSprite('rgba(110,190,255,.95)', 1.2); g.position.set(s * .38, -.02, .95); ship.add(g);
  }
  const lamp = new THREE.PointLight(0x88ccff, 6, 14); lamp.position.set(0, 0, 1.2); ship.add(lamp);
  const red = glowSprite('rgba(255,60,60,.9)', .35); red.position.set(-1.0, .26, .38); ship.add(red);
  const green = glowSprite('rgba(60,255,120,.9)', .35); green.position.set(1.0, .26, .38); ship.add(green);
  ship.scale.setScalar(1.3);
  scene.add(ship);
}

// flight path: a wide loop that dives through the inner system, skims the belt, and sweeps past the gas giants
const path = new THREE.CatmullRomCurve3([
  [-50, 8, 60], [-22, 3, 34], [-8, -2, 20], [12, 1, 8], [26, 4, -6], [38, 6, -26], [22, 12, -50], [-10, 8, -66],
  [-44, 2, -52], [-62, -4, -26], [-58, 6, 4], [-60, 10, 36],
].map((p) => new THREE.Vector3(...p)), true, 'centripetal');
const PATH_LEN = path.getLength();

// engine trail: ring buffer of fading points
const TRAIL = 260, trailPos = new Float32Array(TRAIL * 3), trailAge = new Float32Array(TRAIL);
const trailGeo = new THREE.BufferGeometry();
trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPos, 3)); trailGeo.setAttribute('aAge', new THREE.BufferAttribute(trailAge, 1));
const trail = new THREE.Points(trailGeo, new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  vertexShader: `attribute float aAge; varying float vA; void main(){ vA = aAge; vec4 mv = modelViewMatrix*vec4(position,1.); gl_Position = projectionMatrix*mv; gl_PointSize = (1.0 - aAge) * 260. / -mv.z; }`,
  fragmentShader: `varying float vA; void main(){ float d = length(gl_PointCoord-.5); float a = smoothstep(.5,0.,d) * (1.-vA); gl_FragColor = vec4(mix(vec3(.4,.7,1.), vec3(.1,.2,.6), vA), a*.8); }`,
}));
trail.frustumCulled = false; scene.add(trail);
let trailHead = 0;
for (let i = 0; i < TRAIL; i++) trailAge[i] = 1;

// ---------------------------------------------------------------- bloom + camera modes
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
composer.addPass(new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), .85, .7, .6));

let mode = 'chase', speedMul = 1;
const setMode = (m) => {
  mode = m; controls.enabled = m === 'free';
  for (const id of ['chase', 'side', 'free']) document.getElementById(id).classList.toggle('on', id === m);
  if (m === 'free') { controls.target.copy(ship.position); }
};
for (const id of ['chase', 'side', 'free']) document.getElementById(id).onclick = () => setMode(id);
document.getElementById('speed').onclick = (e) => { speedMul = speedMul === 1 ? 2 : speedMul === 2 ? .5 : 1; e.target.textContent = `속도 ×${speedMul}`; };
addEventListener('keydown', (e) => { if (e.key === '1') setMode('chase'); if (e.key === '2') setMode('side'); if (e.key === '3') setMode('free'); });
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight); });

// ---------------------------------------------------------------- loop
const clock = new THREE.Clock(); let u = 0, T = 0;
const fwd = new THREE.Vector3(), tmp = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), camPos = new THREE.Vector3(), look = new THREE.Vector3();
const q = new THREE.Quaternion(), m4 = new THREE.Matrix4(), bank = { v: 0 }, prevFwd = new THREE.Vector3();
camPos.copy(camera.position);

renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), .05); T += dt;
  sun.rotation.y += dt * .05;
  for (const p of planets) {
    p.pivot.rotation.y += dt * (6.283 / p.period) * speedMul * .5;
    p.body.rotation.y += dt * p.spin;
    if (p.moon) {
      const a = T * (6.283 / p.moonCfg.period), wp = p.body.getWorldPosition(tmp);
      p.moon.position.set(wp.x + Math.cos(a) * p.moonCfg.dist, wp.y + .15, wp.z + Math.sin(a) * p.moonCfg.dist);
    }
  }
  belt.rotation.y += dt * .01;

  // ship along the path
  u = (u + dt * 7 * speedMul / PATH_LEN) % 1;
  path.getPointAt(u, ship.position); path.getTangentAt(u, fwd);
  m4.lookAt(ship.position, tmp.copy(ship.position).add(fwd), up);    // lookAt aims +Z at target; ship nose is -Z, so flip
  q.setFromRotationMatrix(m4); q.multiply(new THREE.Quaternion().setFromAxisAngle(up, Math.PI));
  const turn = fwd.clone().cross(prevFwd).y * 60; prevFwd.copy(fwd);
  bank.v += (Math.max(-.6, Math.min(.6, -turn)) - bank.v) * Math.min(1, dt * 3);
  ship.quaternion.copy(q); ship.rotateZ(bank.v);
  const pulse = .85 + Math.sin(T * 40) * .15;
  ship.traverse((o) => { if (o.name === 'flame') o.scale.set(1, pulse * (1 + .3 * speedMul), 1); });

  // trail
  const tail = tmp.copy(fwd).multiplyScalar(-1.2).add(ship.position);
  trailPos.set([tail.x, tail.y, tail.z], trailHead * 3); trailAge[trailHead] = 0; trailHead = (trailHead + 1) % TRAIL;
  for (let i = 0; i < TRAIL; i++) trailAge[i] = Math.min(1, trailAge[i] + dt * .9);
  trailGeo.attributes.position.needsUpdate = true; trailGeo.attributes.aAge.needsUpdate = true;

  // camera
  if (mode === 'chase') {
    const side = new THREE.Vector3().crossVectors(fwd, up).normalize();
    const want = new THREE.Vector3().copy(ship.position).addScaledVector(fwd, -6.5).addScaledVector(up, 1.6).addScaledVector(side, Math.sin(T * .3) * 1.5);
    camPos.lerp(want, 1 - Math.pow(.02, dt)); camera.position.copy(camPos);
    look.lerp(tmp.copy(ship.position).addScaledVector(fwd, 2.5).addScaledVector(up, -0.4), 1 - Math.pow(.01, dt)); camera.lookAt(look);
  } else if (mode === 'side') {
    const side = new THREE.Vector3().crossVectors(fwd, up).normalize();
    const want = new THREE.Vector3().copy(ship.position).addScaledVector(side, 9).addScaledVector(fwd, 2).addScaledVector(up, 1.5);
    camPos.lerp(want, 1 - Math.pow(.03, dt)); camera.position.copy(camPos);
    look.lerp(ship.position, 1 - Math.pow(.01, dt)); camera.lookAt(look);
  } else { controls.update(); camPos.copy(camera.position); look.copy(controls.target); }

  composer.render();
});
