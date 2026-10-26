import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// ---------- basics ----------
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
const scene = new THREE.Scene();
function skyTexture() {
  const c = document.createElement('canvas'); c.width = 4; c.height = 512;
  const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, 512);
  gr.addColorStop(0, '#a9c4d8'); gr.addColorStop(0.55, '#dfe4e0'); gr.addColorStop(0.8, '#f2e6d0'); gr.addColorStop(1, '#f6ead6');
  g.fillStyle = gr; g.fillRect(0, 0, 4, 512);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
scene.background = skyTexture();
scene.fog = new THREE.Fog(0xf0e6d2, 250, 2400);
const camera = new THREE.PerspectiveCamera(68, innerWidth / innerHeight, 0.1, 6000);

const sun = new THREE.DirectionalLight(0xfff2dd, 1.35);
sun.position.set(-0.5, 1, 0.35).multiplyScalar(100);
scene.add(sun, new THREE.AmbientLight(0xffffff, 0.85));

// ---------- ground: white salt flat with cracks ----------
function saltTexture() {
  const s = 512, cv = document.createElement('canvas'); cv.width = cv.height = s;
  const g = cv.getContext('2d');
  g.fillStyle = '#f4f1ea'; g.fillRect(0, 0, s, s);
  g.strokeStyle = 'rgba(190,180,165,0.55)'; g.lineWidth = 1.1;
  for (let i = 0; i < 90; i++) {
    let x = Math.random() * s, y = Math.random() * s;
    g.beginPath(); g.moveTo(x, y);
    const n = 4 + (Math.random() * 4 | 0);
    for (let j = 0; j < n; j++) { x += (Math.random() - .5) * 90; y += (Math.random() - .5) * 90; g.lineTo(x, y); }
    g.stroke();
  }
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(60, 60);
  return t;
}
const ground = new THREE.Mesh(
  new THREE.CircleGeometry(3000, 64),
  new THREE.MeshLambertMaterial({ map: saltTexture(), color: 0xffffff })
);
ground.rotation.x = -Math.PI / 2;
scene.add(ground);

// ---------- far crowd disc (represents the billions to the horizon) ----------
function crowdDiscTexture() {
  const s = 1024, cv = document.createElement('canvas'); cv.width = cv.height = s;
  const g = cv.getContext('2d');
  g.clearRect(0, 0, s, s);
  const tones = ['#5b5350', '#6b5d52', '#4a4a4e', '#74665a', '#585254', '#6e5a4e'];
  for (let i = 0; i < 26000; i++) {
    const r = Math.pow(Math.random(), 0.62); // denser near inner edge
    const a = Math.random() * Math.PI * 2;
    const x = s / 2 + Math.cos(a) * r * s / 2, y = s / 2 + Math.sin(a) * r * s / 2;
    const d = 1.1 + (1 - r) * 2.2;
    g.fillStyle = tones[(Math.random() * tones.length) | 0];
    g.globalAlpha = 0.5 + (1 - r) * 0.5;
    g.fillRect(x, y, d, d * 1.6);
  }
  return new THREE.CanvasTexture(cv);
}
const farDisc = new THREE.Mesh(
  new THREE.RingGeometry(700, 2800, 64, 1),
  new THREE.MeshBasicMaterial({ map: crowdDiscTexture(), transparent: true, depthWrite: false })
);
farDisc.rotation.x = -Math.PI / 2; farDisc.position.y = 0.6;
scene.add(farDisc);

// ---------- person geometry ----------
function bodyGeometry() {
  const legL = new THREE.BoxGeometry(0.13, 0.72, 0.15); legL.translate(-0.09, 0.36, 0);
  const legR = new THREE.BoxGeometry(0.13, 0.72, 0.15); legR.translate(0.09, 0.36, 0);
  const torso = new THREE.CapsuleGeometry(0.21, 0.55, 3, 8); torso.translate(0, 1.02, 0);
  const armL = new THREE.BoxGeometry(0.08, 0.5, 0.1); armL.translate(-0.27, 1.0, 0);
  const armR = new THREE.BoxGeometry(0.08, 0.5, 0.1); armR.translate(0.27, 1.0, 0);
  return mergeGeometries([legL, legR, torso, armL, armR]);
}
function headGeometry() {
  const head = new THREE.SphereGeometry(0.14, 8, 7);
  head.scale(1, 1.15, 1); head.translate(0, 1.52, 0);
  return head;
}
const personGeo = bodyGeometry();
const personMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
const TONES = [0x5b5350, 0x6b5d52, 0x4a4a4e, 0x74665a, 0x585254, 0x6e5a4e, 0x4e5a66, 0x715a5a];
const SKIN = [0xc9a186, 0xa87a5f, 0x8a5f45, 0xdbb293, 0x6e4a33];

// ---------- instanced mid crowd ----------
const COUNT = 9000;
const crowd = new THREE.InstancedMesh(personGeo, personMat, COUNT);
crowd.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
const heads = new THREE.InstancedMesh(headGeometry(), new THREE.MeshLambertMaterial({ color: 0xffffff }), COUNT);
heads.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
const base = new Float32Array(COUNT * 3); // x, y, z
const dists = new Float32Array(COUNT);
const scalesA = new Float32Array(COUNT);
const _vs = new THREE.Vector3();
{
  const m = new THREE.Matrix4(), col = new THREE.Color();
  let i = 0, r = 2.6;
  while (i < COUNT && r < 700) {
    const spacing = 0.48 * (1 + Math.pow(r / 55, 1.6));
    const n = Math.max(8, Math.floor((Math.PI * 2 * r) / spacing));
    for (let k = 0; k < n && i < COUNT; k++, i++) {
      const a = (k / n) * Math.PI * 2 + Math.random() * 0.3;
      const rr = r + (Math.random() - .5) * spacing * 0.8;
      const x = Math.cos(a) * rr, z = Math.sin(a) * rr;
      base[i * 3] = x; base[i * 3 + 1] = 0; base[i * 3 + 2] = z;
      dists[i] = Math.hypot(x, z);
      const sc = 0.92 + Math.random() * 0.16;
      scalesA[i] = sc;
      m.makeRotationY(Math.random() * Math.PI * 2);
      m.scale(_vs.set(sc, sc, sc));
      m.setPosition(x, 0, z);
      crowd.setMatrixAt(i, m);
      heads.setMatrixAt(i, m);
      col.setHex(TONES[(Math.random() * TONES.length) | 0]);
      col.offsetHSL(0, 0, (Math.random() - .5) * 0.12);
      crowd.setColorAt(i, col);
      col.setHex(SKIN[(Math.random() * SKIN.length) | 0]);
      heads.setColorAt(i, col);
    }
    r += spacing;
  }
  crowd.count = i;
}
scene.add(crowd); scene.add(heads);
const order = new Uint32Array(crowd.count);
for (let i = 0; i < crowd.count; i++) order[i] = i;
order.sort((a, b) => dists[a] - dists[b]);

// ---------- near articulated agents (visible clap) ----------
const agents = [];
function makeAgent(x, z) {
  const g = new THREE.Group();
  const tone = TONES[(Math.random() * TONES.length) | 0];
  const mat = new THREE.MeshLambertMaterial({ color: tone });
  const skin = new THREE.MeshLambertMaterial({ color: SKIN[(Math.random() * SKIN.length) | 0] });
  const legGeo = new THREE.BoxGeometry(0.13, 0.72, 0.15);
  const legL = new THREE.Mesh(legGeo, mat); legL.position.set(-0.09, 0.36, 0);
  const legR = new THREE.Mesh(legGeo, mat); legR.position.set(0.09, 0.36, 0);
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.21, 0.55, 3, 10), mat);
  body.position.y = 1.02;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8), skin);
  head.scale.y = 1.15; head.position.y = 1.52;
  const armGeo = new THREE.BoxGeometry(0.09, 0.52, 0.09);
  armGeo.translate(0, 0.22, 0);
  const armL = new THREE.Mesh(armGeo, mat), armR = new THREE.Mesh(armGeo, mat);
  armL.position.set(-0.27, 1.22, 0); armR.position.set(0.27, 1.22, 0);
  armL.rotation.z = 0.15; armR.rotation.z = -0.15;
  g.add(legL, legR, body, head, armL, armR);
  g.position.set(x, 0, z);
  g.rotation.y = Math.random() * Math.PI * 2;
  scene.add(g);
  return { g, armL, armR, dist: Math.hypot(x, z), clapT: -1, jitter: 0 };
}
for (let i = 0; i < 48; i++) {
  const a = Math.random() * Math.PI * 2, r = 2.2 + Math.random() * 23;
  agents.push(makeAgent(Math.cos(a) * r, Math.sin(a) * r));
}

// ---------- player ----------
const player = makeAgent(0, 0);
player.g.children.forEach(m => { if (m.material) m.material = m.material.clone(); });
[0, 1, 2, 4, 5].forEach(i => player.g.children[i].material.color.setHex(0xc76b1d)); // legs, torso, arms amber; head keeps skin
const playerState = { x: 0, z: 0, yaw: 0, pitch: -0.05 };

// ---------- input ----------
const keys = {};
addEventListener('keydown', e => keys[e.code] = true);
addEventListener('keyup', e => keys[e.code] = false);
let pov = 'fp';
const povLabel = { fp: 'First person', tp: 'Third person', aerial: 'Aerial' };
document.querySelectorAll('#povbar .btn').forEach(b => b.addEventListener('click', () => {
  if (!b.dataset.pov) return; // Controls toggle is not a POV button
  pov = b.dataset.pov;
  document.querySelectorAll('#povbar .btn').forEach(x => x.classList.toggle('on', x === b));
  document.getElementById('r-pov').textContent = povLabel[pov];
  player.g.visible = pov !== 'fp';
}));
player.g.visible = false;
document.getElementById('r-pov').textContent = povLabel[pov];

let look = { active: false, id: -1, x: 0, y: 0 };
let move = { active: false, id: -1, sx: 0, sy: 0, dx: 0, dy: 0 };
const stick = document.getElementById('stick'), knob = document.getElementById('knob');
canvas.addEventListener('pointerdown', e => {
  if (e.clientX < innerWidth * 0.45 && !move.active) {
    move = { active: true, id: e.pointerId, sx: e.clientX, sy: e.clientY, dx: 0, dy: 0 };
    stick.style.display = 'block';
    stick.style.left = (e.clientX - 55) + 'px'; stick.style.top = (e.clientY - 55) + 'px';
  } else if (!look.active) {
    look = { active: true, id: e.pointerId, x: e.clientX, y: e.clientY };
  }
});
addEventListener('pointermove', e => {
  if (move.active && e.pointerId === move.id) {
    move.dx = THREE.MathUtils.clamp((e.clientX - move.sx) / 45, -1, 1);
    move.dy = THREE.MathUtils.clamp((e.clientY - move.sy) / 45, -1, 1);
    knob.style.left = (33 + move.dx * 30) + 'px'; knob.style.top = (33 + move.dy * 30) + 'px';
  } else if (look.active && e.pointerId === look.id) {
    playerState.yaw -= (e.clientX - look.x) * 0.0042;
    playerState.pitch = THREE.MathUtils.clamp(playerState.pitch - (e.clientY - look.y) * 0.0042, -1.4, 1.4);
    look.x = e.clientX; look.y = e.clientY;
  }
});
addEventListener('pointerup', e => {
  if (e.pointerId === move.id) { move.active = false; move.dx = move.dy = 0; stick.style.display = 'none'; knob.style.left = '33px'; knob.style.top = '33px'; }
  if (e.pointerId === look.id) look.active = false;
});
let aerialH = 130;
addEventListener('wheel', e => { if (pov === 'aerial') aerialH = THREE.MathUtils.clamp(aerialH * (1 + Math.sign(e.deltaY) * 0.12), 40, 600); });

// ---------- audio ----------
let AC = null, master = null;
function audio() {
  if (!AC) {
    AC = new (window.AudioContext || window.webkitAudioContext)();
    master = AC.createGain(); master.gain.value = 0.55;
    const comp = AC.createDynamicsCompressor();
    comp.threshold.value = -18; comp.ratio.value = 6; comp.attack.value = 0.002; comp.release.value = 0.12;
    master.connect(comp).connect(AC.destination);
  }
  if (AC.state === 'suspended') AC.resume();
}
function clapSound(when, gain, pan) {
  const dur = 0.12, sr = AC.sampleRate;
  const buf = AC.createBuffer(1, sr * dur, sr);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) {
    const t = i / sr * 1000;
    const env = Math.max(Math.exp(-t / 3.5), 0.6 * Math.exp(-Math.abs(t - 12) / 2.5), 0.4 * Math.exp(-Math.abs(t - 26) / 3));
    d[i] = (Math.random() * 2 - 1) * env;
  }
  const src = AC.createBufferSource(); src.buffer = buf;
  const bp = AC.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1400 + Math.random() * 900; bp.Q.value = 0.9;
  const g = AC.createGain(); g.gain.value = gain;
  const p = AC.createStereoPanner(); p.pan.value = pan || 0;
  src.connect(bp).connect(g).connect(p).connect(master);
  src.start(when);
}
function rumble(when, gain, dur) {
  const sr = AC.sampleRate, buf = AC.createBuffer(1, sr * dur, sr), d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) { const t = i / d.length; d[i] = (Math.random() * 2 - 1) * Math.sin(Math.PI * t); }
  const src = AC.createBufferSource(); src.buffer = buf;
  const lp = AC.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 160;
  const g = AC.createGain(); g.gain.value = gain;
  src.connect(lp).connect(g).connect(master); src.start(when);
}
function beep(f, when) {
  const o = AC.createOscillator(), g = AC.createGain();
  o.frequency.value = f; g.gain.setValueAtTime(0.15, when); g.gain.exponentialRampToValueAtTime(0.001, when + 0.18);
  o.connect(g).connect(master); o.start(when); o.stop(when + 0.2);
}

// ---------- acoustics model (educational estimate; assumptions configurable) ----------
// Sources: clap duration ~7 ms for 15 dB decay, anechoic (Halmrast, tor.halmrast.no);
// per-clap level varies a lot between people/clap styles (MDPI Acoustics 2020 review:
// >15 dB directivity, 0.7-5.2 dB spread) -> exposed as the clapDb assumption slider.
const I0 = 1e-12;
const T_CLAP = 0.01; // s, effective clap duration (~10 ms order, per Halmrast)
function clapEnergyJ(L1m) { return Math.pow(10, (L1m - 120) / 10) * 4 * Math.PI * T_CLAP; }
// fraction of the arrival circle (radius d around listener at offset x from crowd centre) inside the crowd disc (radius R)
function annulusCoverage(d, x, R) {
  if (d <= 0) return 0;
  if (x + d <= R) return 1;
  if (d >= x + R || d <= Math.abs(x - R) && x > R) return 0;
  const c = (x * x + d * d - R * R) / (2 * x * d || 1);
  return Math.acos(Math.min(1, Math.max(-1, c))) / Math.PI;
}
// continuum arrival intensity at the listener at sim time t (free-field 1/r^2, incoherent impulses, no absorption)
function arrivalDb(t, density, R, x, spread, L1m) {
  if (t <= 0) return 30;
  const d = V_SOUND * t;
  const tMax = (R + x) / V_SOUND;
  const cov = annulusCoverage(d, x, R);
  const teff = Math.max(t, 0.02, spread * 0.35); // near-field + timing-spread smear
  const I = cov * density * clapEnergyJ(L1m) / (2 * teff);
  let db = 10 * Math.log10(Math.max(I, 1e-13) / I0);
  if (t > tMax) db -= 12 * (t - tMax); // tail after farthest source
  return Math.max(30, Math.min(140, db));
}
function crowdGeometry(density) {
  const areaKm2 = 8e9 / density / 1e6;
  return { areaKm2, radiusM: Math.sqrt(areaKm2 * 1e6 / Math.PI) };
}

// ---------- UI ----------
const $ = id => document.getElementById(id);
const ui = {
  time: $('r-time'), km: $('r-km'), fill: $('dbfill'), dbval: $('dbval'),
  count: $('count'), start: $('start'), slow: $('slow'), again: $('again'),
  density: $('density'), spread: $('spread'), tscale: $('tscale'), clapdb: $('clapdb'), clapdbV: $('clapdb-v'),
  densityV: $('density-v'), spreadV: $('spread-v'), tscaleV: $('tscale-v'),
  results: $('results'),
};
const settings = { density: 4.5, spread: 0, tscale: 30, clapDb: 90 };
ui.density.oninput = () => { settings.density = +ui.density.value; ui.densityV.textContent = settings.density + '/m²'; };
ui.spread.oninput = () => { settings.spread = +ui.spread.value; ui.spreadV.textContent = settings.spread === 0 ? 'perfect sync' : '±' + settings.spread + ' s'; };
ui.tscale.oninput = () => { settings.tscale = +ui.tscale.value; ui.tscaleV.textContent = settings.tscale + 'x'; };
ui.clapdb.oninput = () => { settings.clapDb = +ui.clapdb.value; ui.clapdbV.textContent = settings.clapDb + ' dB @ 1 m'; };

// ---------- sequence ----------
const S = { phase: 'idle', t: 0, slow: false, waveR: 0, peakSeen: 30, listenX: 0, listenZ: 0 }; // listenX/Z frozen at clap: arrival field is exact for a stationary listener
function resetSim() {
  S.phase = 'idle'; S.t = 0; S.waveR = 0; S.peakSeen = 30; S.slow = false;
  distantDone.clear();
  for (const a of agents) { a.armL.rotation.set(0, 0, 0.15); a.armR.rotation.set(0, 0, -0.15); a.g.position.y = 0; a.celebrate = undefined; }
  if (murmurG && AC) { murmurG.gain.cancelScheduledValues(AC.currentTime); murmurG.gain.setValueAtTime(0, AC.currentTime); }
  ui.slow.classList.remove('on'); ui.count.style.opacity = 0;
  ui.time.textContent = '-'; ui.km.textContent = '0 km';
  agents.forEach(a => a.clapT = -1);
  const m = new THREE.Matrix4();
  for (let i = 0; i < crowd.count; i++) {
    m.makeRotationY(0); m.setPosition(base[i * 3], 0, base[i * 3 + 2]);
    crowd.setMatrixAt(i, m);
  }
  crowd.instanceMatrix.needsUpdate = true;
  waveRing.visible = false; ui.results.style.display = 'none';
}
ui.again.onclick = () => { audio(); resetSim(); };
ui.slow.onclick = () => { S.slow = !S.slow; ui.slow.classList.toggle('on', S.slow); };
ui.start.onclick = () => {
  audio(); resetSim(); S.phase = 'countdown'; S.t = 0;
  showCount(3); beep(880, AC.currentTime);
};
$('close-res').onclick = () => ui.results.style.display = 'none';
const panelEl = document.getElementById('panel');
$('ctl').onclick = () => { panelEl.style.display = panelEl.style.display === 'none' ? 'block' : 'none'; };
if (matchMedia('(max-width: 760px)').matches) panelEl.style.display = 'none';

// ---------- wave ring ----------
const waveRing = new THREE.Mesh(
  new THREE.RingGeometry(0.97, 1, 96),
  new THREE.MeshBasicMaterial({ color: 0xc76b1d, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false })
);
waveRing.rotation.x = -Math.PI / 2; waveRing.position.y = 0.4; waveRing.visible = false;
scene.add(waveRing);

// ---------- countdown + clap ----------
const V_SOUND = 343;
function tickSequence(dtReal) {
  if (S.phase === 'idle') return;
  const scale = S.slow ? 0.1 : 1;
  if (S.phase === 'countdown') {
    const prev = Math.ceil(3 - S.t);
    S.t += dtReal * scale;
    const cur = Math.ceil(3 - S.t);
    if (cur !== prev && cur > 0) { showCount(cur); beep(880, AC.currentTime); }
    if (S.t >= 3) {
      S.phase = 'clap'; S.t = 0;
      showCount('CLAP'); beep(1320, AC.currentTime);
      const now = AC.currentTime;
      agents.forEach(a => { a.jitter = (Math.random() * 2 - 1) * settings.spread; a.clapT = 0; });
      startBounce();
      S.listenX = playerState.x; S.listenZ = playerState.z; // stationary-listener experiment: field computed for the clap-time position
      { const xOff0 = Math.hypot(S.listenX, S.listenZ);
        const { radiusM: R0 } = crowdGeometry(settings.density);
        S.peakSeen = arrivalDb(0.02, settings.density, R0, xOff0, settings.spread, settings.clapDb); } // model peak at the 20 ms near-field clamp, not frame-sampled
      { const xOff = Math.hypot(S.listenX, S.listenZ);
        const { radiusM } = crowdGeometry(settings.density);
        distantMarks = [2000, 8000, 15000, radiusM + xOff]; } // distances FROM the clap-time listener position
      for (let i = 0; i < 14; i++) clapSound(now + Math.random() * 0.09, 0.5 + Math.random() * 0.4, Math.random() * 1.6 - 0.8);
      flash();
      waveRing.visible = true;
    }
    return;
  }
  if (S.phase === 'clap' || S.phase === 'after') {
    const dtSim = dtReal * scale * settings.tscale;
    S.t += dtSim;
    S.waveR = S.t * V_SOUND;
    ui.time.textContent = S.t.toFixed(1) + ' s';
    ui.km.textContent = (S.waveR / 1000).toFixed(1) + ' km';
    // wave ring visuals (compressed so it stays visible)
    const visR = Math.min(S.waveR, 1400);
    waveRing.position.set(S.listenX, 0.4, S.listenZ); // arrival field centred on the frozen clap-time listener position
    waveRing.scale.set(visR, visR, 1);
    waveRing.material.opacity = Math.max(0.06, 0.5 - S.t * 0.03);
    // instanced bounce where wavefront passes (only window near front)
    updateBounce();
    // near agents clap
    for (const a of agents) if (a.clapT >= 0) animateAgentClap(a, dtSim);
    // distant arrivals (real delays, played at compressed time)
    scheduleDistant();
    // meter
    const { radiusM } = crowdGeometry(settings.density);
    const xOff = Math.hypot(S.listenX, S.listenZ);
    const shown = arrivalDb(S.t, settings.density, radiusM, xOff, settings.spread, settings.clapDb);
    S.peakSeen = Math.max(S.peakSeen, shown);
    ui.fill.style.width = Math.min(100, (shown / 130) * 100) + '%';
    ui.fill.classList.toggle('hot', shown > 105);
    ui.dbval.textContent = '~' + shown.toFixed(0) + ' dB (estimate)';
    if (S.phase === 'clap' && S.t > 1.2) S.phase = 'after';
    if (S.phase === 'after' && S.t > Math.max(8, (radiusM + xOff) / V_SOUND * 1.05)) showResults(radiusM);
  }
  if (S.phase === 'aftermath') {
    S.t += dtReal;
    for (const a of agents) {
      if (a.celebrate === undefined) continue;
      const ct = Math.min(S.t / a.celebrate, 1);
      const up = Math.sin(ct * Math.PI);
      a.armL.rotation.x = -2.5 * up + Math.sin(S.t * 1.3 + a.sway) * 0.06 * ct;
      a.armR.rotation.x = -2.5 * up + Math.cos(S.t * 1.1 + a.sway) * 0.06 * ct;
      a.armL.rotation.z = 0.4 * up + 0.15; a.armR.rotation.z = -0.4 * up - 0.15;
      a.g.position.y = Math.max(0, Math.sin(ct * Math.PI * 3)) * 0.05; // small hops while cheering
    }
    const settle = Math.max(30, 45 - S.t * 0.5); // murmur settles toward desert quiet
    ui.dbval.textContent = '~' + settle.toFixed(0) + ' dB (estimate)';
    ui.fill.style.width = Math.min(100, (settle / 130) * 100) + '%';
    ui.fill.classList.remove('hot');
  }
}
let countTimeout = 0;
function showCount(txt) {
  ui.count.textContent = txt; ui.count.style.opacity = 1;
  clearTimeout(countTimeout);
  countTimeout = setTimeout(() => ui.count.style.opacity = 0, txt === 'CLAP' ? 700 : 650);
}
let murmurG = null;
function startMurmur() {
  if (!AC) return;
  const len = 2 * AC.sampleRate;
  const buf = AC.createBuffer(1, len, AC.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * 0.5;
  const src = AC.createBufferSource(); src.buffer = buf; src.loop = true;
  const lp = AC.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 380;
  murmurG = AC.createGain(); murmurG.gain.value = 0;
  src.connect(lp).connect(murmurG).connect(master);
  src.start();
  const t0 = AC.currentTime;
  murmurG.gain.linearRampToValueAtTime(0.05, t0 + 3);
  murmurG.gain.linearRampToValueAtTime(0.006, t0 + 30);
}
function flash() {
  const f = document.createElement('div');
  f.style.cssText = 'position:fixed;inset:0;background:#fff;opacity:.85;pointer-events:none;transition:opacity .45s';
  document.body.appendChild(f);
  requestAnimationFrame(() => f.style.opacity = 0);
  setTimeout(() => f.remove(), 600);
}
let distantMarks = [2000, 8000, 15000, 23800]; // metres FROM the listener; recomputed at clap
let distantDone = new Set();
function scheduleDistant() {
  for (const d of distantMarks) {
    const key = d;
    if (!distantDone.has(key) && S.waveR >= d) {
      distantDone.add(key);
      rumble(AC.currentTime, Math.max(0.04, 0.5 - d / 60000), 1.6);
    }
  }
}
const _m4 = new THREE.Matrix4();
let bounceJit = null;
function startBounce() {
  bounceJit = new Float32Array(crowd.count);
  for (let i = 0; i < crowd.count; i++) bounceJit[i] = Math.random() * settings.spread;
}
function updateBounce() {
  if (!bounceJit) return;
  const DUR = 0.45; // s sim, single clap motion; everyone claps together at t=0 (+timing spread)
  let active = false;
  for (let i = 0; i < crowd.count; i++) {
    const lt = S.t - bounceJit[i];
    let y = 0;
    if (lt > 0 && lt < DUR) { y = Math.sin((lt / DUR) * Math.PI) * 0.22; active = true; }
    _m4.makeRotationY(0); _m4.scale(_vs.set(scalesA[i], scalesA[i], scalesA[i]));
    _m4.setPosition(base[i * 3], y, base[i * 3 + 2]);
    crowd.setMatrixAt(i, _m4);
    heads.setMatrixAt(i, _m4);
  }
  crowd.instanceMatrix.needsUpdate = true;
  heads.instanceMatrix.needsUpdate = true;
  if (!active && S.t > DUR + settings.spread + 0.1) bounceJit = null;
}
function animateAgentClap(a, dtSim) {
  a.clapT += dtSim;
  const t = a.clapT;
  if (t > 1.2) { a.clapT = -1; a.armL.rotation.x = a.armR.rotation.x = 0; return; }
  const cyc = (t % 0.4) / 0.4;
  const ang = Math.sin(cyc * Math.PI) * -1.9;
  a.armL.rotation.x = ang; a.armR.rotation.x = ang;
  a.armL.rotation.z = 0.15 + Math.sin(cyc * Math.PI) * 0.5;
  a.armR.rotation.z = -0.15 - Math.sin(cyc * Math.PI) * 0.5;
}
function showResults(radiusM) {
  S.phase = 'done';
  const { areaKm2 } = crowdGeometry(settings.density);
  const xOff = Math.hypot(S.listenX, S.listenZ);
  const edge = radiusM + xOff;
  $('res-density').textContent = settings.density + ' log/m²';
  $('res-footprint').textContent = Math.round(areaKm2).toLocaleString('en-IN') + ' km² (disc ~' + Math.round(radiusM * 2 / 1000) + ' km wide)';
  $('res-peak').textContent = '~' + S.peakSeen.toFixed(0) + ' dB brief (estimate; clap ' + settings.clapDb + ' dB @ 1 m maan ke)';
  $('res-delay').textContent = '~' + Math.round(edge / V_SOUND) + ' s (farthest edge ' + (edge / 1000).toFixed(0) + ' km)';
  ui.results.style.display = 'block';
  // aftermath: authored crowd reaction (celebration/murmur), labelled not-prediction on the panel
  S.phase = 'aftermath'; S.t = 0;
  for (const a of agents) { a.celebrate = 0.3 + Math.random() * 2.4; a.sway = Math.random() * Math.PI * 2; }
  startMurmur();
}

// ---------- camera + movement ----------
function tickPlayer(dtReal) {
  const sp = (keys['ShiftLeft'] ? 10 : 5.5);
  let mx = 0, mz = 0;
  if (keys['KeyW'] || keys['ArrowUp']) mz -= 1;
  if (keys['KeyS'] || keys['ArrowDown']) mz += 1;
  if (keys['KeyA'] || keys['ArrowLeft']) mx -= 1;
  if (keys['KeyD'] || keys['ArrowRight']) mx += 1;
  mx += move.dx; mz += move.dy;
  const len = Math.hypot(mx, mz);
  if (len > 0.01 && pov !== 'aerial') {
    mx /= Math.max(1, len); mz /= Math.max(1, len);
    const sin = Math.sin(playerState.yaw), cos = Math.cos(playerState.yaw);
    playerState.x += (mx * cos - mz * sin) * sp * dtReal;
    playerState.z += (mz * cos + mx * sin) * sp * dtReal;
  } else if (len > 0.01 && pov === 'aerial') {
    const sin = Math.sin(playerState.yaw), cos = Math.cos(playerState.yaw);
    playerState.x += (mx * cos - mz * sin) * aerialH * 0.5 * dtReal;
    playerState.z += (mz * cos + mx * sin) * aerialH * 0.5 * dtReal;
  }
  const lim = 2600;
  playerState.x = THREE.MathUtils.clamp(playerState.x, -lim, lim);
  playerState.z = THREE.MathUtils.clamp(playerState.z, -lim, lim);
  player.g.position.set(playerState.x, 0, playerState.z);
  player.g.rotation.y = playerState.yaw;
  if (pov === 'fp') {
    camera.position.set(playerState.x, 1.68, playerState.z);
    camera.rotation.set(0, 0, 0, 'YXZ');
    camera.rotation.y = playerState.yaw; camera.rotation.x = playerState.pitch;
  } else if (pov === 'tp') {
    const back = new THREE.Vector3(Math.sin(playerState.yaw), 0, Math.cos(playerState.yaw));
    camera.position.set(playerState.x + back.x * 4.2, 2.6, playerState.z + back.z * 4.2);
    camera.lookAt(playerState.x, 1.3, playerState.z);
  } else {
    camera.position.set(playerState.x, aerialH, playerState.z + aerialH * 0.55);
    camera.lookAt(playerState.x, 0, playerState.z);
  }
}

// ---------- loop ----------
const clock = new THREE.Clock();
function loop() {
  const dtReal = Math.min(clock.getDelta(), 0.05);
  tickPlayer(dtReal);
  tickSequence(dtReal);
  renderer.render(scene, camera);
  requestAnimationFrame(loop);
}
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
resetSim();
loop();
