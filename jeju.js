import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Water } from 'three/addons/objects/Water.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

// ---------------------------------------------------------------- renderer / scene
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.55;
document.body.appendChild(renderer.domElement);
const labelRenderer = new CSS2DRenderer();
labelRenderer.setSize(innerWidth, innerHeight);
Object.assign(labelRenderer.domElement.style, { position: 'fixed', top: 0, left: 0, pointerEvents: 'none' });
document.body.appendChild(labelRenderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x9cc4dc, 0.0016);
const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 20000);
camera.position.set(0, 90, 150);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; controls.maxPolarAngle = Math.PI * 0.49; controls.minDistance = 4; controls.maxDistance = 400; controls.enabled = false;

// ---------------------------------------------------------------- sky + sun
const sky = new Sky(); sky.scale.setScalar(10000); scene.add(sky);
const sunDir = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - 26), THREE.MathUtils.degToRad(215));
Object.assign(sky.material.uniforms, { turbidity: { value: 6 }, rayleigh: { value: 1.6 }, mieCoefficient: { value: 0.006 }, mieDirectionalG: { value: 0.85 } });
sky.material.uniforms.sunPosition.value.copy(sunDir);
const sunLight = new THREE.DirectionalLight(0xfff0d8, 3.2); sunLight.position.copy(sunDir).multiplyScalar(300); scene.add(sunLight);
scene.add(new THREE.HemisphereLight(0xbfd8ff, 0x3a5a3a, 0.9));
{ const pm = new THREE.PMREMGenerator(renderer); scene.environment = pm.fromScene(sky).texture; scene.environmentIntensity = 0.5; }

// ---------------------------------------------------------------- procedural noise + island height field (BU: 1 unit = 500 m)
function hash(x, y) { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); }
function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  return (hash(xi, yi) * (1 - u) + hash(xi + 1, yi) * u) * (1 - v) + (hash(xi, yi + 1) * (1 - u) + hash(xi + 1, yi + 1) * u) * v;
}
function fbm(x, y, o = 5) { let a = .5, s = 0; for (let i = 0; i < o; i++) { s += a * vnoise(x, y); x *= 2; y *= 2; a *= .5; } return s; }
const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// lon/lat -> world (x east, y north), same scale as real Jeju: 73 km x 31 km
const toXY = (lon, lat) => [(lon - 126.56) * 93.1 / 0.5, (lat - 33.34) * 111 / 0.5];
const HALLA = toXY(126.533, 33.362);
const OREUM = Array.from({ length: 46 }, (_, i) => {
  const a = hash(i, 3) * 6.283, r = Math.sqrt(hash(i, 7)) * 0.85;
  return { x: Math.cos(a) * r * 62 - 4, y: Math.sin(a) * r * 22 + 2, h: 0.5 + hash(i, 11) * 1.1, s: 2 + hash(i, 13) * 3.2 };
});
function elevation(x, y) {
  // elliptical outline with noisy coast, long axis tilted a little
  const c = Math.cos(-0.1), s = Math.sin(-0.1), px = (x + 2) * c - (y - 2) * s, py = (x + 2) * s + (y - 2) * c;
  const r = Math.hypot(px / 75, py / 31) * (1 + (fbm(x * 0.05 + 3, y * 0.05, 4) - .5) * 0.28);
  const t = 1 - r;                                     // > 0 inland
  const land = sm(0, 0.35, t);
  let h = 0.12 + 1.8 * land * (0.7 + 0.6 * fbm(x * 0.08, y * 0.08, 4));
  const dh = Math.hypot(x - HALLA[0], y - HALLA[1]);
  h += 8.4 * Math.exp(-Math.pow(dh / 15, 1.7)) * sm(-0.05, 0.25, t);                    // Hallasan
  h += 0.35 * Math.exp(-Math.pow(dh / 3.2, 2));                                         // crater lake rim
  for (const o of OREUM) h += o.h * Math.exp(-(((x - o.x) ** 2 + (y - o.y) ** 2) / (o.s * o.s))) * land;
  const sea = -0.15 - 3.6 * sm(0, 0.55, -t);
  const w = sm(0, 0.08, t);                              // blend sea floor -> land across the coast
  return sea * (1 - w) + Math.max(h, 0.05) * w;
}

// ---------------------------------------------------------------- terrain mesh
const NX = 420, NZ = 270, W = 210, D = 135;
const geo = new THREE.PlaneGeometry(W, D, NX - 1, NZ - 1); geo.rotateX(-Math.PI / 2);
{
  const p = geo.attributes.position, col = new Float32Array(p.count * 3), c = new THREE.Color();
  const stops = [[-3.6, '#16414f'], [-0.4, '#2a7f86'], [0.02, '#d9c993'], [0.25, '#b5bd74'], [0.9, '#5f9a45'], [2.2, '#3f7a38'], [4.2, '#4a6b3a'], [6.2, '#7a6f58'], [8.6, '#a79d90']];
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = -p.getZ(i), e = elevation(x, y); p.setY(i, e);
    let k = 0; while (k < stops.length - 2 && e > stops[k + 1][0]) k++;
    const tt = Math.min(1, Math.max(0, (e - stops[k][0]) / (stops[k + 1][0] - stops[k][0])));
    c.set(stops[k][1]).lerp(new THREE.Color(stops[k + 1][1]), tt).multiplyScalar(0.9 + 0.2 * hash(i, 5));
    col.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3)); geo.computeVertexNormals();
}
scene.add(new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 })));
const floor = new THREE.Mesh(new THREE.PlaneGeometry(8000, 8000).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x16414f })); floor.position.y = -3.7; scene.add(floor);

// ---------------------------------------------------------------- ocean (Gerstner-like normal map animation from three.js Water)
let water;
function makeWater(tex) {
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  water = new Water(new THREE.PlaneGeometry(8000, 8000), {
    textureWidth: 512, textureHeight: 512, waterNormals: tex, sunDirection: sunDir.clone(), sunColor: 0xfff2d8,
    waterColor: 0x0a6f8a, distortionScale: 2.2, fog: true, alpha: 0.82,
  });
  water.rotation.x = -Math.PI / 2; water.material.transparent = true; water.material.uniforms.size.value = 6;
  scene.add(water);
}
new THREE.TextureLoader().load('https://cdn.jsdelivr.net/gh/mrdoob/three.js@r160/examples/textures/waternormals.jpg', makeWater, undefined, () => {
  const d = new Uint8Array(4 * 4 * 4); for (let i = 0; i < 16; i++) d.set([128, 128, 255, 255], i * 4);
  const t = new THREE.DataTexture(d, 4, 4); t.needsUpdate = true; makeWater(t);
});

// ---------------------------------------------------------------- spots
const SPOTS = [
  { name: '제주국제공항', lon: 126.493, lat: 33.507, desc: '여행의 시작. 비행기에서 내려다본 제주 북쪽 해안선이 펼쳐집니다.', tag: '출발' },
  { name: '협재해변', lon: 126.239, lat: 33.394, desc: '에메랄드빛 얕은 바다와 하얀 모래, 멀리 비양도가 보이는 서쪽 대표 해변입니다.', tag: '서쪽 해안' },
  { name: '용머리해안', lon: 126.311, lat: 33.231, desc: '용이 바다로 머리를 내미는 모양의 퇴적암 절벽 해안입니다.', tag: '남서쪽' },
  { name: '천지연폭포', lon: 126.553, lat: 33.246, desc: '서귀포 시내에 있는 울창한 숲 속의 폭포입니다.', tag: '서귀포' },
  { name: '한라산 백록담', lon: 126.533, lat: 33.362, desc: '해발 1,947m, 남한에서 가장 높은 산입니다. 정상에는 화산 분화구 백록담이 있습니다.', tag: '중앙' },
  { name: '섭지코지', lon: 126.931, lat: 33.424, desc: '바다로 길게 뻗은 초원 곶. 붉은 화산송이 지형과 등대가 어우러집니다.', tag: '동남쪽' },
  { name: '성산일출봉', lon: 126.942, lat: 33.458, desc: '바다 위로 솟은 분화구형 화산체. 일출 명소이며 유네스코 세계유산입니다.', tag: '동쪽' },
  { name: '우도', lon: 126.953, lat: 33.506, desc: '성산 앞바다의 작은 섬. 해안 드라이브와 땅콩 아이스크림으로 유명합니다.', tag: '부속 섬' },
];
for (const s of SPOTS) {                       // pull each spot inland until it stands on dry land
  let [x, y] = toXY(s.lon, s.lat);
  for (let i = 0; i < 60 && elevation(x, y) < 0.35; i++) { x += (HALLA[0] - x) * 0.04; y += (HALLA[1] - y) * 0.04; }
  s.x = x; s.z = -y; s.h = Math.max(elevation(x, y), 0.3);
}
const pinMat = new THREE.MeshStandardMaterial({ color: 0xff6a3d, emissive: 0xff4a1a, emissiveIntensity: 0.9 });
for (const s of SPOTS) {
  const pin = new THREE.Group(); pin.position.set(s.x, s.h, s.z);
  const cone = new THREE.Mesh(new THREE.ConeGeometry(0.45, 1.6, 16), pinMat); cone.rotation.x = Math.PI; cone.position.y = 0.8; pin.add(cone);
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.55, 20, 16), pinMat); ball.position.y = 2.0; pin.add(ball);
  const el = document.createElement('div'); el.className = 'label'; el.textContent = s.name;
  const lab = new CSS2DObject(el); lab.position.set(0, 3.2, 0); pin.add(lab);
  scene.add(pin); s.pin = pin;
}

// clouds: soft sprites drifting over the island
const cloudTex = (() => {
  const cv = document.createElement('canvas'); cv.width = cv.height = 128; const x = cv.getContext('2d');
  const g = x.createRadialGradient(64, 64, 0, 64, 64, 64); g.addColorStop(0, 'rgba(255,255,255,.9)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 128, 128); return new THREE.CanvasTexture(cv);
})();
const clouds = [];
for (let i = 0; i < 28; i++) {
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudTex, transparent: true, opacity: 0.5, depthWrite: false, fog: false }));
  sp.position.set((Math.random() - .5) * 260, 26 + Math.random() * 14, (Math.random() - .5) * 150); sp.scale.set(30 + Math.random() * 30, 12 + Math.random() * 8, 1);
  scene.add(sp); clouds.push(sp);
}

// ---------------------------------------------------------------- UI
const $ = (id) => document.getElementById(id);
const spotsEl = $('spots'), card = $('card'), tourBtn = $('tour');
SPOTS.forEach((s, i) => {
  const b = document.createElement('button'); b.className = 'glass'; b.textContent = s.name; b.onclick = () => { auto = true; flyTo(i); updateBtn(); };
  spotsEl.appendChild(b); s.btn = b;
});
function showCard(i) {
  const s = SPOTS[i]; card.classList.add('hide');
  setTimeout(() => { card.querySelector('h2').textContent = s.name; card.querySelector('p').textContent = s.desc; card.querySelector('small').textContent = `${i + 1} / ${SPOTS.length} · ${s.tag}`; card.classList.remove('hide'); }, 350);
  SPOTS.forEach((o, k) => o.btn.classList.toggle('on', k === i));
}
function updateBtn() { tourBtn.textContent = auto ? '⏸ 여행 일시정지' : '▶ 여행 이어가기'; }

// ---------------------------------------------------------------- tour state machine
const look = new THREE.Vector3(0, 0, 0), fromPos = new THREE.Vector3(), fromLook = new THREE.Vector3(), tmp = new THREE.Vector3();
let idx = 0, phase = 'fly', tp = 0, ang = 0.9, auto = true;
const FLY = 5.5, HOVER = 7.5;
const poseOf = (i, a) => { const s = SPOTS[i], r = i === 4 ? 30 : 16, h = i === 4 ? 17 : 8.5; return { pos: new THREE.Vector3(s.x + Math.cos(a) * r, s.h + h, s.z + Math.sin(a) * r), look: new THREE.Vector3(s.x, s.h + 1.2, s.z) }; };
function flyTo(i) { idx = i; phase = 'fly'; tp = 0; ang = 0.9; fromPos.copy(camera.position); fromLook.copy(look); controls.enabled = false; showCard(i); }
tourBtn.onclick = () => { auto = !auto; if (auto) flyTo(idx); else { controls.enabled = true; controls.target.copy(look); } updateBtn(); };
controls.addEventListener('start', () => { if (auto) { auto = false; updateBtn(); } });
camera.position.set(-30, 80, 140); look.set(0, 0, 0); fromPos.copy(camera.position); fromLook.copy(look); flyTo(0);

addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); labelRenderer.setSize(innerWidth, innerHeight); });
const ease = (t) => t * t * (3 - 2 * t);
const clock = new THREE.Clock();
setTimeout(() => { $('loading').style.opacity = 0; setTimeout(() => $('loading').remove(), 900); }, 600);

renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05), t = clock.elapsedTime;
  if (water) water.material.uniforms.time.value += dt * 0.7;
  for (const c of clouds) { c.position.x += dt * 1.2; if (c.position.x > 140) c.position.x = -140; }
  SPOTS.forEach((s, i) => { s.pin.children[1].position.y = 2.0 + Math.sin(t * 2 + i) * 0.15; });

  if (auto) {
    tp += dt;
    if (phase === 'fly') {
      const k = ease(Math.min(1, tp / FLY)), to = poseOf(idx, ang);
      camera.position.lerpVectors(fromPos, to.pos, k); camera.position.y += Math.sin(Math.PI * k) * 14;
      look.lerpVectors(fromLook, to.look, k);
      if (tp >= FLY) { phase = 'hover'; tp = 0; }
    } else {
      ang += dt * 0.12; const to = poseOf(idx, ang); camera.position.copy(to.pos); look.copy(to.look);
      if (tp >= HOVER) flyTo((idx + 1) % SPOTS.length);
    }
    camera.lookAt(look);
  } else { controls.update(); look.copy(controls.target); }

  renderer.render(scene, camera); labelRenderer.render(scene, camera);
});
