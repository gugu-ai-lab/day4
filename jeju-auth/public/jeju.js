import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

// ================================================================ renderer / scene (soft studio look, transparent so the CSS gradient shows)
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
document.body.appendChild(renderer.domElement);
const labelRenderer = new CSS2DRenderer();
labelRenderer.setSize(innerWidth, innerHeight);
Object.assign(labelRenderer.domElement.style, { position: 'fixed', top: 0, left: 0, pointerEvents: 'none' });
document.body.appendChild(labelRenderer.domElement);

const scene = new THREE.Scene();
{ const pm = new THREE.PMREMGenerator(renderer); scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture; scene.environmentIntensity = 0.7; }
const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.5, 2000);
camera.position.set(0, 120, 190);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; controls.maxPolarAngle = Math.PI * 0.48; controls.minDistance = 6; controls.maxDistance = 420; controls.enabled = false;

const sun = new THREE.DirectionalLight(0xfff1dc, 2.6); sun.position.set(-90, 130, 80); sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096); Object.assign(sun.shadow.camera, { left: -110, right: 110, top: 70, bottom: -70, near: 10, far: 400 });
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.25; scene.add(sun);
scene.add(new THREE.HemisphereLight(0xffffff, 0xb8c4cc, 0.7));

// ================================================================ noise + height field (1 unit = 500 m)
function hash(x, y) { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); }
function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  return (hash(xi, yi) * (1 - u) + hash(xi + 1, yi) * u) * (1 - v) + (hash(xi, yi + 1) * (1 - u) + hash(xi + 1, yi + 1) * u) * v;
}
function fbm(x, y, o = 5) { let a = .5, s = 0; for (let i = 0; i < o; i++) { s += a * vnoise(x, y); x *= 2; y *= 2; a *= .5; } return s; }
const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const toXY = (lon, lat) => [(lon - 126.56) * 93.1 / 0.5, (lat - 33.34) * 111 / 0.5];
const HALLA = toXY(126.533, 33.362);
const OREUM = Array.from({ length: 46 }, (_, i) => {
  const a = hash(i, 3) * 6.283, r = Math.sqrt(hash(i, 7)) * 0.85;
  return { x: Math.cos(a) * r * 62 - 4, y: Math.sin(a) * r * 22 + 2, h: 0.5 + hash(i, 11) * 1.1, s: 2 + hash(i, 13) * 3.2 };
});
const SEA_FLOOR = -3.6;
function elevation(x, y) {
  const c = Math.cos(-0.1), s = Math.sin(-0.1), px = (x + 2) * c - (y - 2) * s, py = (x + 2) * s + (y - 2) * c;
  const r = Math.hypot(px / 75, py / 31) * (1 + (fbm(x * 0.05 + 3, y * 0.05, 4) - .5) * 0.28), t = 1 - r;
  const land = sm(0, 0.35, t);
  let h = 0.12 + 1.8 * land * (0.7 + 0.6 * fbm(x * 0.08, y * 0.08, 4));
  const dh = Math.hypot(x - HALLA[0], y - HALLA[1]);
  h += Math.min(8.4 * Math.exp(-Math.pow(dh / 15, 1.7)), 7.6) * sm(-0.05, 0.25, t);            // flat-topped Hallasan (crater lake sits here)
  for (const o of OREUM) h += o.h * Math.exp(-(((x - o.x) ** 2 + (y - o.y) ** 2) / (o.s * o.s))) * land;
  const sea = -0.15 + (SEA_FLOOR + 0.15) * sm(0, 0.5, -t), w = sm(0, 0.08, t);
  return sea * (1 - w) + Math.max(h, 0.05) * w;
}
const HALLA_TOP = elevation(HALLA[0], HALLA[1]);

// ================================================================ diorama: plinth + water block + terrain
const W = 180, D = 100;
const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, metalness: 0, ...o });
function mesh(geo, color, o = {}) { const m = new THREE.Mesh(geo, o.mat || std(color, o)); m.castShadow = true; m.receiveShadow = true; return m; }

const plinth = mesh(new THREE.BoxGeometry(W + 8, 4, D + 8), 0x6b4a39); plinth.position.y = SEA_FLOOR - 2.2; scene.add(plinth);
const rim = mesh(new THREE.BoxGeometry(W + 9.5, 0.9, D + 9.5), 0xf3e9d8); rim.position.y = SEA_FLOOR - 0.15; scene.add(rim);

const terrainGeo = new THREE.PlaneGeometry(W, D, 360, 200); terrainGeo.rotateX(-Math.PI / 2);
{
  const p = terrainGeo.attributes.position, col = new Float32Array(p.count * 3), c = new THREE.Color(), c2 = new THREE.Color();
  const stops = [[-3.6, '#e7c98f'], [-0.5, '#efd9a0'], [0.0, '#f6e7b8'], [0.3, '#cfe08a'], [1.0, '#8fd16a'], [2.4, '#63b85e'], [4.4, '#5aa35a'], [6.4, '#b3a58f'], [7.7, '#d8d2c6']];
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = -p.getZ(i), e = elevation(x, y); p.setY(i, e);
    let k = 0; while (k < stops.length - 2 && e > stops[k + 1][0]) k++;
    const tt = Math.min(1, Math.max(0, (e - stops[k][0]) / (stops[k + 1][0] - stops[k][0])));
    c.set(stops[k][1]); c2.set(stops[k + 1][1]); c.lerp(c2, tt).multiplyScalar(0.95 + 0.1 * hash(i, 5));
    col.set([c.r, c.g, c.b], i * 3);
  }
  terrainGeo.setAttribute('color', new THREE.BufferAttribute(col, 3)); terrainGeo.computeVertexNormals();
}
const terrain = new THREE.Mesh(terrainGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }));
terrain.castShadow = true; terrain.receiveShadow = true; scene.add(terrain);

// water block: translucent sides + animated surface
const sideMat = new THREE.MeshStandardMaterial({ color: 0x5fd4e4, transparent: true, opacity: 0.42, roughness: 0.15, depthWrite: false });
const hidden = new THREE.MeshBasicMaterial({ visible: false });
const waterBox = new THREE.Mesh(new THREE.BoxGeometry(W, -SEA_FLOOR, D), [sideMat, sideMat, hidden, hidden, sideMat, sideMat]);
waterBox.position.y = SEA_FLOOR / 2; waterBox.renderOrder = 2; scene.add(waterBox);
const surfGeo = new THREE.PlaneGeometry(W, D, 150, 84); surfGeo.rotateX(-Math.PI / 2);
const surfBase = surfGeo.attributes.position.array.slice();
const surf = new THREE.Mesh(surfGeo, new THREE.MeshStandardMaterial({ color: 0x4ed0e6, transparent: true, opacity: 0.62, roughness: 0.08, metalness: 0.1, depthWrite: false }));
surf.receiveShadow = true; surf.renderOrder = 3; surf.position.y = -0.02; scene.add(surf);

// ================================================================ helpers for placing props on the island
function dry(x, y) { for (let i = 0; i < 80 && elevation(x, y) < 0.4; i++) { x += (HALLA[0] - x) * 0.04; y += (HALLA[1] - y) * 0.04; } return [x, y]; }
const place = (lon, lat) => { const [x, y] = dry(...toXY(lon, lat)); return { x, z: -y, h: elevation(x, y) }; };
const add = (o, p, s = 1, ry = 0) => { o.position.set(p.x, p.h, p.z); o.scale.setScalar(s); o.rotation.y = ry; scene.add(o); return o; };

// ---- crater lake on Hallasan
{
  const lake = mesh(new THREE.CircleGeometry(1.9, 40), 0x56c8e8, { roughness: .1 }); lake.rotation.x = -Math.PI / 2; lake.position.set(HALLA[0], HALLA_TOP + 0.04, -HALLA[1]); scene.add(lake);
  const ring = mesh(new THREE.TorusGeometry(2.0, 0.22, 10, 40), 0xcfc7b8); ring.rotation.x = Math.PI / 2; ring.position.set(HALLA[0], HALLA_TOP + 0.05, -HALLA[1]); scene.add(ring);
}

// ---- tangerine trees (instanced)
{
  const spots = []; for (let i = 0; i < 4000 && spots.length < 110; i++) {
    const x = (Math.random() - .5) * 150, y = (Math.random() - .5) * 60 + 2, e = elevation(x, y);
    if (e > 0.5 && e < 3.0 && Math.hypot(x - HALLA[0], y - HALLA[1]) > 12) spots.push([x, y, e]);
  }
  const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.1, 0.14, 0.7, 6), std(0x8a5a3a), spots.length);
  const leaf = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.62, 1), std(0x4cae5a, { roughness: .7 }), spots.length);
  const fruit = new THREE.InstancedMesh(new THREE.SphereGeometry(0.13, 8, 6), std(0xff9a2e, { roughness: .5 }), spots.length * 3);
  const m = new THREE.Object3D(); let f = 0;
  spots.forEach(([x, y, e], i) => {
    const s = 0.8 + Math.random() * 0.6;
    m.position.set(x, e + 0.3 * s, -y); m.scale.setScalar(s); m.rotation.set(0, 0, 0); m.updateMatrix(); trunk.setMatrixAt(i, m.matrix);
    m.position.set(x, e + 1.0 * s, -y); m.updateMatrix(); leaf.setMatrixAt(i, m.matrix);
    for (let k = 0; k < 3; k++) { const a = Math.random() * 6.28; m.position.set(x + Math.cos(a) * 0.5 * s, e + (0.9 + Math.random() * 0.4) * s, -y + Math.sin(a) * 0.5 * s); m.scale.setScalar(s); m.updateMatrix(); fruit.setMatrixAt(f++, m.matrix); }
  });
  for (const o of [trunk, leaf, fruit]) { o.castShadow = true; scene.add(o); }
}

// ---- dol hareubang (stone grandfather)
function hareubang() {
  const g = new THREE.Group(), stone = 0x9a948c;
  const body = mesh(new THREE.CylinderGeometry(0.5, 0.65, 1.3, 14), stone); body.position.y = 0.65; g.add(body);
  const head = mesh(new THREE.SphereGeometry(0.55, 18, 14), stone); head.position.y = 1.55; g.add(head);
  const hat = mesh(new THREE.SphereGeometry(0.62, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2), 0x6f6a64); hat.scale.y = 0.75; hat.position.y = 1.8; g.add(hat);
  const brim = mesh(new THREE.CylinderGeometry(0.68, 0.68, 0.07, 18), 0x6f6a64); brim.position.y = 1.78; g.add(brim);
  const nose = mesh(new THREE.BoxGeometry(0.16, 0.3, 0.16), stone); nose.position.set(0, 1.5, 0.52); g.add(nose);
  for (const s of [-1, 1]) {
    const eye = mesh(new THREE.SphereGeometry(0.06, 8, 6), 0x2b2b2b); eye.position.set(s * 0.2, 1.62, 0.5); g.add(eye);
    const hand = mesh(new THREE.BoxGeometry(0.22, 0.2, 0.2), stone); hand.position.set(s * 0.18, 0.95, 0.52); hand.rotation.z = s * -0.3; g.add(hand);
  }
  return g;
}
// ---- thatched house (choga)
function house() {
  const g = new THREE.Group();
  const wall = mesh(new THREE.BoxGeometry(2.0, 0.9, 1.5), 0xefe2c4); wall.position.y = 0.45; g.add(wall);
  const roof = mesh(new THREE.ConeGeometry(1.7, 1.0, 4), 0xd9b25a); roof.rotation.y = Math.PI / 4; roof.scale.set(1.2, 1, 0.9); roof.position.y = 1.4; g.add(roof);
  const door = mesh(new THREE.BoxGeometry(0.45, 0.6, 0.06), 0x7a5640); door.position.set(0, 0.32, 0.76); g.add(door);
  const fence = mesh(new THREE.TorusGeometry(2.0, 0.12, 6, 20), 0x77726c); fence.rotation.x = Math.PI / 2; fence.scale.set(1.15, 1, 0.85); fence.position.y = 0.12; g.add(fence);
  return g;
}
// ---- horse
function horse() {
  const g = new THREE.Group(), brown = 0x8d5a3b;
  const body = mesh(new THREE.BoxGeometry(1.3, 0.55, 0.5), brown); body.position.y = 0.95; g.add(body);
  const neck = mesh(new THREE.BoxGeometry(0.28, 0.7, 0.3), brown); neck.position.set(0.62, 1.3, 0); neck.rotation.z = -0.5; g.add(neck);
  const head = mesh(new THREE.BoxGeometry(0.5, 0.26, 0.26), brown); head.position.set(0.98, 1.58, 0); head.rotation.z = -0.3; g.add(head);
  const mane = mesh(new THREE.BoxGeometry(0.1, 0.6, 0.12), 0x2f2118); mane.position.set(0.5, 1.4, 0); mane.rotation.z = -0.5; g.add(mane);
  const tail = mesh(new THREE.BoxGeometry(0.1, 0.55, 0.14), 0x2f2118); tail.position.set(-0.7, 0.9, 0); tail.rotation.z = 0.4; g.add(tail);
  for (const [x, z] of [[.45, .17], [.45, -.17], [-.45, .17], [-.45, -.17]]) { const l = mesh(new THREE.BoxGeometry(0.12, 0.7, 0.12), 0x5e3b27); l.position.set(x, 0.4, z); g.add(l); }
  return g;
}
// ---- wind turbine
const blades = [];
function turbine() {
  const g = new THREE.Group();
  const tower = mesh(new THREE.CylinderGeometry(0.1, 0.2, 6, 10), 0xffffff); tower.position.y = 3; g.add(tower);
  const hub = new THREE.Group(); hub.position.set(0, 6.1, 0.25); g.add(hub);
  hub.add(mesh(new THREE.SphereGeometry(0.22, 12, 10), 0xffffff));
  for (let i = 0; i < 3; i++) { const b = mesh(new THREE.BoxGeometry(0.2, 3, 0.05), 0xf4f6f8); b.position.y = 1.5; const arm = new THREE.Group(); arm.rotation.z = i * 2.094; arm.add(b); hub.add(arm); }
  blades.push(hub); return g;
}
// ---- lighthouse
function lighthouse() {
  const g = new THREE.Group();
  const base = mesh(new THREE.CylinderGeometry(0.55, 0.8, 3.6, 14), 0xffffff); base.position.y = 1.8; g.add(base);
  const band = mesh(new THREE.CylinderGeometry(0.62, 0.7, 0.6, 14), 0xe8564a); band.position.y = 2.0; g.add(band);
  const lamp = mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.6, 12), 0xffe08a, { emissive: 0xffc94a, emissiveIntensity: 0.9 }); lamp.position.y = 3.9; g.add(lamp);
  const cap = mesh(new THREE.ConeGeometry(0.55, 0.7, 14), 0xe8564a); cap.position.y = 4.55; g.add(cap);
  return g;
}

const SPOTS = [
  { name: '제주국제공항', lon: 126.493, lat: 33.507, desc: '여행의 시작. 비행기에서 내려다본 제주 북쪽 해안선이 펼쳐집니다.', tag: '출발', color: 0xff7aa8 },
  { name: '협재해변', lon: 126.239, lat: 33.394, desc: '에메랄드빛 얕은 바다와 하얀 모래, 멀리 비양도가 보이는 서쪽 대표 해변입니다.', tag: '서쪽 해안', color: 0x4fc3f7 },
  { name: '용머리해안', lon: 126.311, lat: 33.231, desc: '용이 바다로 머리를 내미는 모양의 퇴적암 절벽 해안입니다.', tag: '남서쪽', color: 0xffb74d, key: '산방산_용머리' },
  { name: '천지연폭포', lon: 126.553, lat: 33.246, desc: '서귀포 시내에 있는 울창한 숲 속의 폭포입니다.', tag: '서귀포', color: 0x66d9a0, key: '천지연폭포' },
  { name: '한라산 백록담', lon: 126.533, lat: 33.362, desc: '해발 1,947m, 남한에서 가장 높은 산입니다. 정상에는 화산 분화구 백록담이 있습니다.', tag: '중앙', color: 0xff8a65 },
  { name: '섭지코지', lon: 126.931, lat: 33.424, desc: '바다로 길게 뻗은 초원 곶. 붉은 화산송이 지형과 등대가 어우러집니다.', tag: '동남쪽', color: 0xba68c8 },
  { name: '성산일출봉', lon: 126.942, lat: 33.458, desc: '바다 위로 솟은 분화구형 화산체. 일출 명소이며 유네스코 세계유산입니다.', tag: '동쪽', color: 0xffd54f },
  { name: '우도', lon: 126.953, lat: 33.506, desc: '성산 앞바다의 작은 섬. 해안 드라이브와 땅콩 아이스크림으로 유명합니다.', tag: '부속 섬', color: 0x7986cb },
  { name: '정방폭포', lon: 126.5716, lat: 33.2447, desc: '바다로 직접 떨어지는 동양 유일의 해안 폭포입니다.', tag: '서귀포', color: 0x4dd0e1, key: '정방폭포' },
  { name: '천제연폭포', lon: 126.4166, lat: 33.2530, desc: '중문 관광단지 옆, 세 단계로 흘러내리는 계곡 폭포입니다.', tag: '중문', color: 0x81c784, key: '천제연폭포' },
  { name: '중문대포 주상절리대', lon: 126.4252, lat: 33.2378, desc: '용암이 식으며 만든 육각 기둥이 해안을 따라 늘어선 명소입니다.', tag: '중문', color: 0xe57373, key: '중문대포 주상절리대' },
  { name: '감귤박물관', lon: 126.608, lat: 33.286, desc: '제주 감귤의 역사와 재배 문화를 보여주는 박물관과 감귤 농원입니다.', tag: '감귤재배지', color: 0xffa726, key: '감귤박물관' },
];
for (const s of SPOTS) Object.assign(s, place(s.lon, s.lat));
// props around the spots
add(hareubang(), { x: SPOTS[0].x + 2.4, z: SPOTS[0].z + 1.8, h: elevation(SPOTS[0].x + 2.4, -(SPOTS[0].z + 1.8)) }, 1.5, -0.6);
add(hareubang(), { x: SPOTS[6].x - 2.6, z: SPOTS[6].z + 1.2, h: elevation(SPOTS[6].x - 2.6, -(SPOTS[6].z + 1.2)) }, 1.4, 0.8);
add(lighthouse(), { x: SPOTS[5].x + 2.5, z: SPOTS[5].z - 1, h: elevation(SPOTS[5].x + 2.5, -(SPOTS[5].z - 1)) }, 1.1);
for (const [lo, la, r] of [[126.80, 33.39, 0.5], [126.775, 33.378, 1.8], [126.82, 33.405, -0.7], [126.35, 33.45, 0.3], [126.64, 33.30, 2.2]]) add(house(), place(lo, la), 1.0, r);
for (const [lo, la, r] of [[126.76, 33.43, 0.4], [126.745, 33.425, 1.7], [126.78, 33.44, -0.9], [126.42, 33.40, 0.2]]) add(horse(), place(lo, la), 1.0, r);
for (const [lo, la] of [[126.80, 33.545], [126.76, 33.548], [126.72, 33.545], [126.86, 33.53], [126.9, 33.51], [126.68, 33.54]]) { const p = place(lo, la); add(turbine(), p, 1.0, -0.4); }
// clouds
const clouds = [];
for (let i = 0; i < 11; i++) {
  const g = new THREE.Group(), n = 3 + Math.floor(Math.random() * 3);
  for (let k = 0; k < n; k++) { const b = new THREE.Mesh(new THREE.SphereGeometry(2.2 + Math.random() * 1.6, 16, 12), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, transparent: true, opacity: 0.95 })); b.position.set(k * 2.6 - n * 1.3, Math.random() * 0.8, (Math.random() - .5) * 2); b.scale.y = 0.7; g.add(b); }
  g.position.set((Math.random() - .5) * 190, 30 + Math.random() * 12, (Math.random() - .5) * 110); scene.add(g); clouds.push(g);
}
// boats
const boats = [];
function boat(color) {
  const g = new THREE.Group();
  const hull = mesh(new THREE.BoxGeometry(2.2, 0.5, 0.9), 0xffffff); hull.position.y = 0.2; g.add(hull);
  const stripe = mesh(new THREE.BoxGeometry(2.22, 0.14, 0.92), color); stripe.position.y = 0.38; g.add(stripe);
  const mast = mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.2, 6), 0x8a6a4a); mast.position.set(0, 1.4, 0); g.add(mast);
  const sh = new THREE.Shape(); sh.moveTo(0, 0); sh.lineTo(1.2, 0); sh.lineTo(0, 2); const sail = mesh(new THREE.ShapeGeometry(sh), 0xfff7e6, { side: THREE.DoubleSide }); sail.position.set(-0.05, 0.6, 0); sail.rotation.y = Math.PI / 2; g.add(sail);
  return g;
}
[[-60, 38, 0xff6b6b], [30, 40, 0x4d96ff], [72, -34, 0xffc94a], [-38, -42, 0x6bcf8e], [88, 8, 0xff8fb1]].forEach(([x, z, c], i) => { const b = boat(c); b.position.set(x, 0, z); b.rotation.y = i * 1.3; scene.add(b); boats.push({ b, x, z, i }); });
// dolphins
const dolphins = [];
function dolphin() {
  const g = new THREE.Group(), c = 0x8fbde6;
  const body = mesh(new THREE.CapsuleGeometry(0.4, 1.5, 6, 12), c); body.rotation.z = Math.PI / 2; g.add(body);
  const belly = mesh(new THREE.SphereGeometry(0.34, 12, 10), 0xf5fbff); belly.scale.set(2.2, 0.6, 0.9); belly.position.set(0.1, -0.15, 0); g.add(belly);
  const snout = mesh(new THREE.CapsuleGeometry(0.12, 0.35, 4, 8), c); snout.rotation.z = Math.PI / 2; snout.position.x = 1.15; g.add(snout);
  const fin = mesh(new THREE.ConeGeometry(0.2, 0.5, 8), c); fin.position.set(0, 0.5, 0); g.add(fin);
  const tail = mesh(new THREE.BoxGeometry(0.1, 0.8, 0.12), c); tail.position.set(-1.1, 0.1, 0); tail.rotation.z = 0.4; g.add(tail);
  const flukes = mesh(new THREE.BoxGeometry(0.3, 0.1, 0.8), c); flukes.position.set(-1.35, 0.4, 0); g.add(flukes);
  return g;
}
[[-62, 6, 22, 0], [60, -22, 18, 2.1], [10, 44, 14, 4.0]].forEach(([cx, cz, R, ph]) => { const d = dolphin(); scene.add(d); dolphins.push({ d, cx, cz, R, ph }); });

// ================================================================ pins + UI
for (const s of SPOTS) {
  const mat = std(s.color, { roughness: 0.35, emissive: s.color, emissiveIntensity: 0.25 });
  const pin = new THREE.Group(); pin.position.set(s.x, s.h, s.z);
  const cone = mesh(new THREE.ConeGeometry(0.5, 1.8, 16), 0, { mat }); cone.rotation.x = Math.PI; cone.position.y = 0.9; pin.add(cone);
  const ball = mesh(new THREE.SphereGeometry(0.75, 24, 18), 0, { mat }); ball.position.y = 2.3; pin.add(ball);
  const dot = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 10), new THREE.MeshBasicMaterial({ color: 0xffffff })); dot.position.set(0, 2.3, 0.62); pin.add(dot);
  const el = document.createElement('div'); el.className = 'label'; el.textContent = s.name;
  const lab = new CSS2DObject(el); lab.position.set(0, 3.7, 0); pin.add(lab);
  scene.add(pin); s.pin = pin; s.ball = ball;
}
const $ = (id) => document.getElementById(id);
const spotsEl = $('spots'), card = $('card'), tourBtn = $('tour');
SPOTS.forEach((s, i) => { const b = document.createElement('button'); b.className = 'glass'; b.textContent = s.name; b.onclick = () => { auto = true; flyTo(i); updateBtn(); }; spotsEl.appendChild(b); s.btn = b; });
function showCard(i) {
  const s = SPOTS[i]; card.classList.add('hide');
  setTimeout(() => { card.querySelector('h2').textContent = s.name; card.querySelector('p').textContent = s.desc; card.querySelector('small').textContent = `${i + 1} / ${SPOTS.length} · ${s.tag}`; $('chart').innerHTML = chartHTML(s); card.classList.remove('hide'); }, 350);
  SPOTS.forEach((o, k) => { if (o.bars) o.bars.userData.target = k === i ? 1 : 0; });
  SPOTS.forEach((o, k) => o.btn.classList.toggle('on', k === i));
}
function updateBtn() { tourBtn.textContent = auto ? '⏸ 여행 일시정지' : '▶ 여행 이어가기'; }

// ================================================================ visitors data (/api/visitors → 서귀포시 직영관광지 관람객수, 공공데이터포털)
let VIS = null;
const fmt = (n) => n.toLocaleString('ko-KR'), fmtK = (v) => v >= 10000 ? (v / 10000).toFixed(v >= 100000 ? 0 : 1) + '만' : String(Math.round(v));
const hex = (c) => '#' + c.toString(16).padStart(6, '0');
const byYear = (key) => { const o = {}; for (const r of VIS) (o[r['기준연도']] ??= Array(12).fill(null))[r['기준월'] - 1] = r[key]; return o; };
function chartHTML(s) {
  if (!VIS || !s.key) return '';
  const ser = byYear(s.key), yrs = Object.keys(ser).sort(), W = 380, H = 112, L = 34, B = 18, T = 8;
  const max = Math.max(...yrs.flatMap((y) => ser[y]).filter((v) => v != null)) * 1.08;
  const X = (m) => L + (W - L - 8) * m / 11, Y = (v) => T + (H - T - B) * (1 - v / max);
  const cols = ['#9aa7b4', hex(s.color)];
  let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${s.name} 월별 관람객 추이">`;
  for (const f of [0, 0.5, 1]) { const v = max / 1.08 * f; svg += `<line x1="${L}" x2="${W - 8}" y1="${Y(v)}" y2="${Y(v)}" stroke="#243447" stroke-opacity=".12"/><text x="${L - 4}" y="${Y(v) + 3}" text-anchor="end" font-size="9" fill="#243447" opacity=".6">${fmtK(v)}</text>`; }
  for (let m = 0; m < 12; m += 3) svg += `<text x="${X(m)}" y="${H - 4}" text-anchor="middle" font-size="9" fill="#243447" opacity=".6">${m + 1}월</text>`;
  yrs.forEach((y, k) => {
    const pts = ser[y].map((v, m) => v == null ? null : [X(m), Y(v)]).filter(Boolean), c = cols[Math.min(k, 1)];
    svg += `<polyline fill="none" stroke="${c}" stroke-width="2.2" stroke-linejoin="round" points="${pts.map((p) => p.join(',')).join(' ')}"/>` + pts.map((p) => `<circle cx="${p[0]}" cy="${p[1]}" r="2.4" fill="${c}"/>`).join('');
  });
  svg += '</svg>';
  const last = yrs[yrs.length - 1], prev = yrs[yrs.length - 2], n = ser[last].filter((v) => v != null).length;
  const sum = (a, k = 12) => a.slice(0, k).reduce((t, v) => t + (v || 0), 0);
  const rows = [];
  if (prev) rows.push([`${prev}년 전체`, sum(ser[prev]), cols[0]], [`${prev}년 1~${n}월`, sum(ser[prev], n), cols[0]]);
  rows.push([`${last}년 1~${n}월`, sum(ser[last], n), cols[1]]);
  const top = Math.max(...rows.map((r) => r[1]));
  const bars = rows.map(([lb, v, c]) => `<div class="yr"><span>${lb}</span><i style="width:${Math.max(2, v / top * 100)}%;background:${c}"></i><b>${fmt(v)}명</b></div>`).join('');
  const d = prev ? (rows[2][1] / rows[1][1] - 1) * 100 : null;
  const legend = yrs.map((y, k) => `<em style="color:${cols[Math.min(k, 1)]}">● ${y}</em>`).join(' ');
  return `<div class="ct"><div class="ch">월별 관람객 ${legend}</div>${svg}<div class="ch">연도별 합계${d == null ? '' : ` · 전년 동기 대비 <strong>${d >= 0 ? '+' : ''}${d.toFixed(1)}%</strong>`}</div>${bars}<small class="src">자료: 서귀포시 직영관광지 관람객수 (공공데이터포털)</small></div>`;
}
// 3D: 월별 관람객 수를 높이로 한 원형 막대 (최근 연도는 진하게)
function buildBars(s) {
  if (!VIS || !s.key || s.bars) return;
  const g = new THREE.Group(), n = VIS.length, vmax = Math.max(...VIS.map((r) => r[s.key])), lastY = VIS[n - 1]['기준연도'], R = 3.8;
  const disc = mesh(new THREE.CylinderGeometry(R + 1.1, R + 1.4, 1.8, 40), 0xf6f3ee); disc.position.y = -0.8; g.add(disc);
  VIS.forEach((r, k) => {
    const a = k / n * Math.PI * 2, geo = new THREE.BoxGeometry(0.75, 1, 0.75); geo.translate(0, 0.5, 0);
    const col = new THREE.Color(s.color); if (r['기준연도'] !== lastY) col.offsetHSL(0, -0.25, 0.14);
    const b = new THREE.Mesh(geo, std(col, { roughness: 0.45 })); b.castShadow = true;
    b.position.set(Math.cos(a) * R, 0.1, Math.sin(a) * R); b.rotation.y = -a; b.userData.h = Math.max(0.15, r[s.key] / vmax * 7); b.scale.y = 0.001; g.add(b);
  });
  g.position.set(s.x, s.h, s.z); g.userData = { cur: 0, target: 0 }; g.visible = false; scene.add(g); s.bars = g;
}
fetch('api/visitors').then((r) => r.ok ? r.json() : Promise.reject(r.status)).then((j) => {
  VIS = (j.data || []).sort((a, b) => a['기준연도'] - b['기준연도'] || a['기준월'] - b['기준월']);
  if (!VIS.length) { VIS = null; return; }
  SPOTS.forEach(buildBars); showCard(idx);
}).catch((e) => console.warn('관람객 데이터를 불러오지 못했습니다:', e));

// ================================================================ tour
const look = new THREE.Vector3(), fromPos = new THREE.Vector3(), fromLook = new THREE.Vector3();
let idx = 0, phase = 'fly', tp = 0, ang = 0.9, auto = true;
const FLY = 5.5, HOVER = 10;
const poseOf = (i, a) => { const s = SPOTS[i], big = i === 4, r = big ? 46 : 20, h = big ? 26 : 11; return { pos: new THREE.Vector3(s.x + Math.cos(a) * r, s.h + h, s.z + Math.sin(a) * r), look: new THREE.Vector3(s.x, s.h + 1.2, s.z) }; };
function flyTo(i) { idx = i; phase = 'fly'; tp = 0; ang = 0.9; fromPos.copy(camera.position); fromLook.copy(look); controls.enabled = false; showCard(i); }
tourBtn.onclick = () => { auto = !auto; if (auto) flyTo(idx); else { controls.enabled = true; controls.target.copy(look); } updateBtn(); };
controls.addEventListener('start', () => { if (auto) { auto = false; updateBtn(); } });
look.set(0, 0, 0); fromPos.copy(camera.position); fromLook.copy(look); flyTo(0);

addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); labelRenderer.setSize(innerWidth, innerHeight); });
const ease = (t) => t * t * (3 - 2 * t), clock = new THREE.Clock();
setTimeout(() => { $('loading').style.opacity = 0; setTimeout(() => $('loading').remove(), 900); }, 700);

renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05), t = clock.elapsedTime;
  // gentle water ripples
  const pa = surfGeo.attributes.position, base = surfBase;
  for (let i = 0; i < pa.count; i++) { const x = base[i * 3], z = base[i * 3 + 2]; pa.setY(i, Math.sin(x * 0.28 + t * 1.6) * 0.07 + Math.cos(z * 0.33 + t * 1.2) * 0.06); }
  pa.needsUpdate = true;
  for (const h of blades) h.rotation.z -= dt * 1.6;
  for (const c of clouds) { c.position.x += dt * 1.4; if (c.position.x > 110) c.position.x = -110; }
  for (const b of boats) { b.b.position.y = Math.sin(t * 1.5 + b.i) * 0.12; b.b.rotation.z = Math.sin(t * 1.1 + b.i) * 0.06; b.b.position.x = b.x + Math.sin(t * 0.2 + b.i) * 3; }
  for (const d of dolphins) {
    const a = t * 0.35 + d.ph, ph = (a % 6.283) / 6.283, jump = ph < 0.4 ? Math.sin(ph / 0.4 * Math.PI) : 0;
    d.d.position.set(d.cx + Math.cos(a) * d.R, -1.2 + jump * 4.2, d.cz + Math.sin(a) * d.R);
    d.d.rotation.set(0, -a - Math.PI / 2 + Math.PI, 0); d.d.rotateZ(ph < 0.4 ? (ph < 0.2 ? 0.6 : -0.6) : 0);
    d.d.visible = jump > 0.02;
  }
  SPOTS.forEach((s, i) => {
    s.ball.position.y = 2.3 + Math.sin(t * 2 + i) * 0.18;
    const g = s.bars; if (!g) return;
    const u = g.userData; u.cur += (u.target - u.cur) * Math.min(1, dt * 2.5); g.visible = u.cur > 0.01;
    if (g.visible) g.children.forEach((b, k) => { if (b.userData.h) b.scale.y = Math.max(0.001, b.userData.h * ease(Math.min(1, Math.max(0, u.cur * 1.6 - k / g.children.length * 0.6)))); });
  });

  if (auto) {
    tp += dt;
    if (phase === 'fly') {
      const k = ease(Math.min(1, tp / FLY)), to = poseOf(idx, ang);
      camera.position.lerpVectors(fromPos, to.pos, k); camera.position.y += Math.sin(Math.PI * k) * 16; look.lerpVectors(fromLook, to.look, k);
      if (tp >= FLY) { phase = 'hover'; tp = 0; }
    } else {
      ang += dt * 0.12; const to = poseOf(idx, ang); camera.position.copy(to.pos); look.copy(to.look);
      if (tp >= HOVER) flyTo((idx + 1) % SPOTS.length);
    }
    camera.lookAt(look);
  } else { controls.update(); look.copy(controls.target); }

  renderer.render(scene, camera); labelRenderer.render(scene, camera);
});
