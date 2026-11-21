import * as THREE from './vendor/three.module.js';
import { OrbitControls } from './vendor/controls/OrbitControls.js';
import { cutout, thumb, loadImage } from './cutout.js';
import { persona } from './persona.js';
import { inflate } from './inflate.js';

const $ = (id) => document.getElementById(id);
const WORLD_R = 12, HEIGHT = 1.5;

// ---------- scene ----------
const renderer = new THREE.WebGLRenderer({ canvas: $('c'), antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x8fd3ff);
scene.fog = new THREE.Fog(0x8fd3ff, 22, 45);
const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
camera.position.set(0, 7.5, 15);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0.6, -1); controls.enableDamping = true; controls.enablePan = false;
controls.minDistance = 4; controls.maxDistance = 22; controls.maxPolarAngle = Math.PI * 0.47;

scene.add(new THREE.HemisphereLight(0xffffff, 0x6aa84f, 1.6));
const sun = new THREE.DirectionalLight(0xffffff, 2.2);
sun.position.set(6, 12, 8); sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -15, right: 15, top: 15, bottom: -15 });
scene.add(sun);

// island
const ground = new THREE.Mesh(new THREE.CylinderGeometry(WORLD_R + 1.5, WORLD_R + 0.5, 1, 48),
  new THREE.MeshStandardMaterial({ color: 0x7ccf5a, roughness: 1, flatShading: true }));
ground.position.y = -0.5; ground.receiveShadow = true; scene.add(ground);
const sea = new THREE.Mesh(new THREE.CircleGeometry(60, 48), new THREE.MeshStandardMaterial({ color: 0x5ab8e8 }));
sea.rotation.x = -Math.PI / 2; sea.position.y = -0.8; scene.add(sea);
const pond = new THREE.Mesh(new THREE.CircleGeometry(1.8, 24), new THREE.MeshStandardMaterial({ color: 0x4aa3df, roughness: 0.3 }));
pond.rotation.x = -Math.PI / 2; pond.position.set(-5, 0.01, -3); scene.add(pond);

const rnd = mulberry32(42);
function mulberry32(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const obstacles = [{ x: -5, z: -3, r: 2 }];
for (let i = 0; i < 11; i++) {           // trees in crayon colours
  let a = rnd() * Math.PI * 2; if (Math.sin(a) > 0.55) a += Math.PI; // keep the camera side clear
  const d = 6 + rnd() * 5.5, x = Math.cos(a) * d, z = Math.sin(a) * d;
  const tree = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.22, 1.2, 6), new THREE.MeshStandardMaterial({ color: 0x8b5a2b, flatShading: true }));
  trunk.position.y = 0.6;
  const top = new THREE.Mesh(new THREE.IcosahedronGeometry(0.9 + rnd() * 0.5, 0), new THREE.MeshStandardMaterial({ color: [0x3fae5a, 0x2e9e4f, 0xf29bc1, 0xffb347][i % 4], flatShading: true }));
  top.position.y = 1.7;
  tree.add(trunk, top); tree.position.set(x, 0, z);
  tree.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  scene.add(tree); obstacles.push({ x, z, r: 1.1 });
}
for (let i = 0; i < 40; i++) {          // flowers
  const f = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 4), new THREE.MeshStandardMaterial({ color: [0xffffff, 0xffe14d, 0xff6fa8, 0xb38cff][i % 4] }));
  const a = rnd() * Math.PI * 2, d = rnd() * WORLD_R; f.position.set(Math.cos(a) * d, 0.08, Math.sin(a) * d); scene.add(f);
}
const clouds = new THREE.Group(); scene.add(clouds);
for (let i = 0; i < 6; i++) {
  const c = new THREE.Group();
  for (let j = 0; j < 3; j++) { const p = new THREE.Mesh(new THREE.SphereGeometry(0.8 + rnd() * 0.5, 10, 8), new THREE.MeshStandardMaterial({ color: 0xffffff })); p.position.set(j * 0.9, rnd() * 0.3, 0); c.add(p); }
  const a = rnd() * Math.PI * 2; c.position.set(Math.cos(a) * 16, 8 + rnd() * 3, Math.sin(a) * 16); clouds.add(c);
}

// ---------- audio ----------
let actx, chirpBuf, chirpLoading;
function audio() {
  if (!actx) {
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
    actx = new AC();
    chirpLoading = fetch('assets/creature_chirp.mp3').then((r) => r.arrayBuffer())
      .then((b) => new Promise((res, rej) => actx.decodeAudioData(b, res, rej))).then((b) => (chirpBuf = b)).catch(() => null);
  }
  if (actx.state === 'suspended') actx.resume();
  return actx;
}
function synthChirp(ctx, pitch) {            // fallback if the mp3 can't decode
  const o = ctx.createOscillator(), g = ctx.createGain(), t = ctx.currentTime;
  o.type = 'triangle'; o.frequency.setValueAtTime(600 * pitch, t); o.frequency.exponentialRampToValueAtTime(1400 * pitch, t + 0.12);
  o.frequency.exponentialRampToValueAtTime(900 * pitch, t + 0.25);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.4, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
  o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + 0.32);
}
async function playSound(c) {
  const ctx = audio(); if (!ctx) return;
  if (!chirpBuf && chirpLoading) await chirpLoading;
  if (!chirpBuf) return synthChirp(ctx, c.meta.pitch);
  const s = ctx.createBufferSource(); s.buffer = chirpBuf; s.playbackRate.value = c.meta.pitch; s.connect(ctx.destination); s.start();
}
let speechUnlocked = false;
function unlockSpeech() {                    // iOS only allows speech that starts inside a tap
  if (speechUnlocked || !('speechSynthesis' in window)) return;
  speechUnlocked = true; const u = new SpeechSynthesisUtterance(' '); u.volume = 0; speechSynthesis.speak(u);
}
function speak(c) {
  if (!('speechSynthesis' in window)) return;
  const u = new SpeechSynthesisUtterance(c.meta.greeting);
  u.pitch = Math.min(2, c.meta.pitch * 1.25); u.rate = 1.05;
  speechSynthesis.cancel(); setTimeout(() => speechSynthesis.speak(u), 600);
}

// ---------- creatures ----------
const creatures = new Map();
const tmp = new THREE.Vector3();
const MAX_W = 2.6;

function canvasTexture(cv) { const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; }

function paperBody(cut) {                    // stacked layers = chunky cardboard cutout
  const g = new THREE.Group(), t = canvasTexture(cut);
  let h = HEIGHT, w = HEIGHT * cut.width / cut.height; if (w > MAX_W) { h *= MAX_W / w; w = MAX_W; }
  const geo = new THREE.PlaneGeometry(w, h); geo.translate(0, h / 2, 0);
  const LAYERS = 9;
  for (let i = 0; i < LAYERS; i++) {
    const edge = i > 0 && i < LAYERS - 1;
    const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: t, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 1, color: edge ? 0xd8c8a8 : 0xffffff }));
    m.position.z = (i / (LAYERS - 1) - 0.5) * 0.12; m.castShadow = i === 0;
    g.add(m);
  }
  return g;
}

function plushBody(cut) {                    // inflated 3D body
  const { geo, texCanvas, height, width } = inflate(cut);
  const s = Math.min(HEIGHT / Math.max(height, 0.05), MAX_W / Math.max(width, 0.05));
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: canvasTexture(texCanvas), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.85 }));
  m.scale.setScalar(s); m.castShadow = true; m.receiveShadow = true;
  const g = new THREE.Group(); g.add(m); g.userData.height = height * s;
  return g;
}

function goPlush(c, announce) {
  const body = plushBody(c.cut);
  c.root.remove(c.body); c.body = body; c.root.add(body);
  c.meta.stage = '3d'; c.pop = 1;
  if (announce) { toast(`✨ ${c.meta.name} popped into 3D!`); playSound(c); }
  save();
}

function addCreature(meta, cut, dropIn) {
  const root = new THREE.Group();
  const a = Math.random() * Math.PI * 2, d = Math.random() * 3.5;
  root.position.set(Math.cos(a) * d, dropIn ? 8 : 0, Math.sin(a) * d * 0.6);
  const c = { meta, cut, root, body: null, t: Math.random() * 10, vy: 0, target: null, wait: Math.random() * 2, pop: 0 };
  if (meta.stage === '3d') { c.body = plushBody(cut); } else { c.body = paperBody(cut); }
  root.add(c.body); scene.add(root);
  creatures.set(meta.id, c);
  updateCount();
  return c;
}
function updateCount() { $('count').textContent = `${creatures.size} creature${creatures.size === 1 ? '' : 's'}`; }

function pickTarget() {
  for (let i = 0; i < 20; i++) {
    const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * (WORLD_R - 1.5);
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (z < 3.5 && obstacles.every((o) => Math.hypot(o.x - x, o.z - z) > o.r + 0.6)) return new THREE.Vector3(x, 0, z);
  }
  return new THREE.Vector3(0, 0, 0);
}

function step(c, dt) {
  c.t += dt;
  const p = c.root.position;
  if (p.y > 0 || c.vy) {
    c.vy -= 20 * dt; p.y += c.vy * dt;
    if (p.y <= 0) { p.y = 0; c.vy = Math.abs(c.vy) > 3 ? -c.vy * 0.35 : 0; }
  }
  let walking = false;
  if (c.wait > 0) c.wait -= dt;
  else {
    c.target ||= pickTarget();
    tmp.subVectors(c.target, p); tmp.y = 0;
    const dist = tmp.length();
    if (dist < 0.2) { c.target = null; c.wait = 1 + Math.random() * 3; }
    else {
      walking = true;
      tmp.normalize().multiplyScalar(Math.min(dist, 1.2 * c.meta.speed * dt));
      p.add(tmp);
      const camYaw = Math.atan2(camera.position.x - p.x, camera.position.z - p.z);
      let rel = Math.atan2(tmp.x, tmp.z) - camYaw; rel = Math.atan2(Math.sin(rel), Math.cos(rel));
      const want = camYaw + THREE.MathUtils.clamp(rel, -0.8, 0.8);
      let diff = want - c.root.rotation.y; diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      c.root.rotation.y += diff * Math.min(1, dt * 4);
    }
  }
  const w = walking ? 9 * c.meta.speed : 2;
  c.body.rotation.z = Math.sin(c.t * w) * (walking ? 0.13 : 0.03);
  c.body.position.y = walking ? Math.abs(Math.sin(c.t * w)) * 0.1 * c.meta.bounce : 0;
  const sq = 1 + Math.sin(c.t * w * 2) * (walking ? 0.03 : 0.015);
  let s = 1;
  if (c.pop > 0) { c.pop = Math.max(0, c.pop - dt * 1.5); s = 1 + Math.sin(c.pop * Math.PI) * 0.4; }
  c.body.scale.set(s / Math.sqrt(sq), s * sq, s / Math.sqrt(sq));
}

// ---------- tap ----------
const ray = new THREE.Raycaster(), ptr = new THREE.Vector2();
let down = null, talking = null, talkUntil = 0;
renderer.domElement.addEventListener('pointerdown', (e) => { down = [e.clientX, e.clientY]; audio(); unlockSpeech(); });
renderer.domElement.addEventListener('pointerup', (e) => {
  if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 10) return;
  down = null;
  const c = pick(e.clientX, e.clientY); if (c) boop(c);
});
function pick(x, y) {
  ptr.set(x / innerWidth * 2 - 1, -(y / innerHeight) * 2 + 1);
  ray.setFromCamera(ptr, camera);
  const list = [...creatures.values()];
  for (const h of ray.intersectObjects(list.map((c) => c.root), true)) {
    const c = list.find((c) => { let o = h.object; while (o) { if (o === c.root) return true; o = o.parent; } return false; });
    if (c) return c;
  }
  return null;
}
function boop(c) {
  playSound(c); speak(c);
  if (c.root.position.y === 0) c.vy = 6;
  c.target = null; c.wait = 2;
  c.root.rotation.y = Math.atan2(camera.position.x - c.root.position.x, camera.position.z - c.root.position.z);
  talking = c; talkUntil = performance.now() + 3500;
  $('bubble').textContent = c.meta.greeting; $('bubble').hidden = false;
  window.__lastBoop = { id: c.meta.id, greeting: c.meta.greeting, at: Date.now() };
}
function placeBubble() {
  if (!talking || performance.now() > talkUntil) { $('bubble').hidden = true; talking = null; return; }
  tmp.copy(talking.root.position); tmp.y += HEIGHT * 1.15; tmp.project(camera);
  Object.assign($('bubble').style, { left: (tmp.x + 1) / 2 * innerWidth + 'px', top: Math.max(110, (1 - tmp.y) / 2 * innerHeight) + 'px' });
}

// ---------- save (this device only, localStorage) ----------
const KEY = 'drawingWorld.v1';
function save() {
  let list = [...creatures.values()].map((c) => ({ ...c.meta, cutout: c.dataURL }));
  for (;;) {
    try { localStorage.setItem(KEY, JSON.stringify(list)); return; }
    catch (e) {
      if (list.length <= 1) return;            // storage full: forget the oldest resident
      list = list.slice(1);
    }
  }
}
async function restore() {
  let list = [];
  try { list = JSON.parse(localStorage.getItem(KEY) || '[]'); } catch (e) { list = []; }
  for (const m of list) {
    try {
      const img = await loadImage(await (await fetch(m.cutout)).blob());
      const cv = document.createElement('canvas'); cv.width = img.naturalWidth; cv.height = img.naturalHeight;
      cv.getContext('2d').drawImage(img, 0, 0);
      const { cutout: url, ...meta } = m; meta.stage = '3d';
      const c = addCreature(meta, cv, false); c.dataURL = url;
    } catch (e) { /* skip a broken entry */ }
  }
}

// ---------- UI ----------
let toastT;
function toast(msg, ms = 3500) { $('toast').textContent = msg; $('toast').hidden = false; clearTimeout(toastT); if (ms) toastT = setTimeout(() => ($('toast').hidden = true), ms); }

let busy = false;
async function submit(blob) {
  if (busy) return; busy = true;
  audio();
  for (const b of document.querySelectorAll('.btn')) b.setAttribute('disabled', '');
  toast('✂️ Lifting your drawing off the paper…', 0);
  await new Promise((r) => setTimeout(r, 30));     // let the toast paint
  try {
    const full = await cutout(blob);
    const cut = thumb(full, 384);
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const meta = { id, created: Date.now(), ...persona(cut, id), stage: 'paper' };
    const c = addCreature(meta, cut, true); c.dataURL = cut.toDataURL('image/png');
    save();
    setTimeout(() => playSound(c), 500);
    toast(`👋 Meet ${meta.name} the ${meta.adjective} ${meta.kind}! Building a 3D body…`, 0);
    setTimeout(() => { if (creatures.has(id)) goPlush(c, true); }, 2600);
  } catch (e) { toast('😕 ' + (e.message || 'Something went wrong'), 5000); }
  for (const b of document.querySelectorAll('.btn')) b.removeAttribute('disabled');
  busy = false;
}
$('file').addEventListener('change', (e) => { const f = e.target.files && e.target.files[0]; if (f) submit(f); e.target.value = ''; });
let sampleN = 0;
$('sample').addEventListener('click', async () => {
  unlockSpeech();
  const r = await fetch(`assets/sample${sampleN++ % 3}.png`); submit(await r.blob());
});
$('reset').addEventListener('click', () => {
  if (!confirm('Send every creature home and start a fresh island?')) return;
  for (const c of creatures.values()) scene.remove(c.root);
  creatures.clear(); localStorage.removeItem(KEY); updateCount(); toast('🏝️ Fresh island! Snap a drawing.');
});

// ---------- loop ----------
function resize() { renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); }
addEventListener('resize', resize); resize();
if (innerWidth < innerHeight) camera.position.set(0, 5.5, 10.5);   // phones in portrait: start closer
const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05);
  for (const c of creatures.values()) step(c, dt);
  clouds.rotation.y += dt * 0.01;
  controls.update(); renderer.render(scene, camera); placeBubble();
});
restore().then(() => { if (!creatures.size) toast('🖍️ Draw a creature on paper, then tap 📷 to bring it to life!', 6000); });
window.__world = { creatures, boop, camera, controls, toast, pick };
