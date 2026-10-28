import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// What If? shared engine: embodied player, representative crowd,
// effects library, orbit view, adaptive quality. English-only UI.

const IS_MOBILE = matchMedia('(pointer: coarse)').matches || /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
const TIERS = [{ count: 1600, pr: 1.25 }, { count: 4000, pr: 1.5 }, { count: 9000, pr: 2 }];
const tier = IS_MOBILE ? 0 : 2;

const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !IS_MOBILE, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, TIERS[tier].pr));
renderer.setSize(innerWidth, innerHeight);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(68, innerWidth / innerHeight, 0.1, 9000);

const $ = id => document.getElementById(id);
const ui = {
  titleB: $('title-b'), titleS: $('title-s'),
  time: $('r-time'), timeL: $('r-time-l'), stat: $('r-stat'), statL: $('r-stat-l'), pov: $('r-pov'),
  meterLabel: $('dblabel'), fill: $('dbfill'), meterVal: $('dbval'),
  count: $('count'), start: $('start'), slow: $('slow'), again: $('again'),
  sliders: $('sliders'), panelNote: $('panel-note'), whatnot: $('whatnot'),
  results: $('results'), resRows: $('res-rows'), resNotes: $('res-notes'),
  picker: $('picker'), qbadge: $('qbadge'),
};

export { THREE, scene, camera, renderer, IS_MOBILE, tier };

// ---------- audio ----------
let AC = null, master = null, murmurG = null;
function audio() {
  if (!AC) {
    AC = new (window.AudioContext || window.webkitAudioContext)();
    master = AC.createGain(); master.gain.value = 0.5;
    const comp = AC.createDynamicsCompressor();
    comp.threshold.value = -18; comp.ratio.value = 6; comp.attack.value = 0.002; comp.release.value = 0.12;
    master.connect(comp).connect(AC.destination);
  }
  if (AC.state === 'suspended') AC.resume();
}
function beep(f, when, dur = 0.18, gain = 0.15) {
  if (!AC) return;
  const o = AC.createOscillator(), g = AC.createGain();
  o.frequency.value = f; g.gain.setValueAtTime(gain, when); g.gain.exponentialRampToValueAtTime(0.001, when + dur);
  o.connect(g).connect(master); o.start(when); o.stop(when + dur + 0.02);
}
function noiseBurst(when, gain, { dur = 0.12, type = 'bandpass', freq = 1400, q = 0.9, pan = 0 } = {}) {
  if (!AC) return;
  const sr = AC.sampleRate, buf = AC.createBuffer(1, sr * dur, sr), d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) {
    const t = i / sr * 1000;
    const env = Math.max(Math.exp(-t / 3.5), 0.6 * Math.exp(-Math.abs(t - 12) / 2.5), 0.4 * Math.exp(-Math.abs(t - 26) / 3));
    d[i] = (Math.random() * 2 - 1) * env;
  }
  const src = AC.createBufferSource(); src.buffer = buf;
  const flt = AC.createBiquadFilter(); flt.type = type; flt.frequency.value = freq; flt.Q.value = q;
  const g = AC.createGain(); g.gain.value = gain;
  const p = AC.createStereoPanner(); p.pan.value = pan;
  src.connect(flt).connect(g).connect(p).connect(master); src.start(when);
}
function rumble(when, gain, dur = 1.4) {
  if (!AC) return;
  const sr = AC.sampleRate, buf = AC.createBuffer(1, sr * dur, sr), d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) { const t = i / d.length; d[i] = (Math.random() * 2 - 1) * Math.sin(Math.PI * t); }
  const src = AC.createBufferSource(); src.buffer = buf;
  const lp = AC.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 160;
  const g = AC.createGain(); g.gain.value = gain;
  src.connect(lp).connect(g).connect(master); src.start(when);
}
function startMurmur(level = 0.05, settle = 30) {
  if (!AC) return;
  stopMurmur();
  const len = 2 * AC.sampleRate, buf = AC.createBuffer(1, len, AC.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * 0.5;
  const src = AC.createBufferSource(); src.buffer = buf; src.loop = true;
  const lp = AC.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 380;
  murmurG = AC.createGain(); murmurG.gain.value = 0;
  src.connect(lp).connect(murmurG).connect(master); src.start();
  const t0 = AC.currentTime;
  murmurG.gain.linearRampToValueAtTime(level, t0 + 3);
  murmurG.gain.linearRampToValueAtTime(level * 0.12, t0 + settle);
}
function stopMurmur() {
  if (murmurG && AC) { try { murmurG.gain.cancelScheduledValues(AC.currentTime); murmurG.gain.setValueAtTime(0, AC.currentTime); } catch (e) {} }
}

// ---------- environment builders ----------
function skyTexture(night) {
  const c = document.createElement('canvas'); c.width = 4; c.height = 512;
  const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, 512);
  if (night) { gr.addColorStop(0, '#030510'); gr.addColorStop(0.6, '#0a1024'); gr.addColorStop(1, '#1a2030'); }
  else { gr.addColorStop(0, '#a9c4d8'); gr.addColorStop(0.55, '#dfe4e0'); gr.addColorStop(0.8, '#f2e6d0'); gr.addColorStop(1, '#f6ead6'); }
  g.fillStyle = gr; g.fillRect(0, 0, 4, 512);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
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
function crowdDiscTexture() {
  const s = 1024, cv = document.createElement('canvas'); cv.width = cv.height = s;
  const g = cv.getContext('2d');
  const tones = ['#5b5350', '#6b5d52', '#4a4a4e', '#74665a', '#585254', '#6e5a4e'];
  for (let i = 0; i < 26000; i++) {
    const r = Math.pow(Math.random(), 0.62), a = Math.random() * Math.PI * 2;
    const x = s / 2 + Math.cos(a) * r * s / 2, y = s / 2 + Math.sin(a) * r * s / 2;
    const d = 1.1 + (1 - r) * 2.2;
    g.fillStyle = tones[(Math.random() * tones.length) | 0];
    g.globalAlpha = 0.5 + (1 - r) * 0.5;
    g.fillRect(x, y, d, d * 1.6);
  }
  return new THREE.CanvasTexture(cv);
}
function dustSprite() {
  const s = 128, cv = document.createElement('canvas'); cv.width = cv.height = s;
  const g = cv.getContext('2d');
  const gr = g.createRadialGradient(s / 2, s / 2, s * 0.08, s / 2, s / 2, s / 2);
  gr.addColorStop(0, 'rgba(216,201,168,0)');
  gr.addColorStop(0.72, 'rgba(216,201,168,0.8)');
  gr.addColorStop(1, 'rgba(216,201,168,0)');
  g.fillStyle = gr; g.fillRect(0, 0, s, s);
  return new THREE.CanvasTexture(cv);
}
function buildSaltFlat({ night = false } = {}) {
  scene.background = skyTexture(night);
  scene.fog = new THREE.Fog(night ? 0x0a1020 : 0xf0e6d2, 250, 2400);
  const sun = new THREE.DirectionalLight(night ? 0x8fa3cc : 0xfff2dd, night ? 0.35 : 1.35);
  sun.position.set(-0.5, 1, 0.35).multiplyScalar(100);
  scene.add(sun, new THREE.AmbientLight(0xffffff, night ? 0.25 : 0.85));
  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(3000, 48),
    new THREE.MeshLambertMaterial({ map: saltTexture(), color: night ? 0x5a5f6e : 0xffffff })
  );
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);
  const farDisc = new THREE.Mesh(
    new THREE.RingGeometry(700, 2800, 48, 1),
    new THREE.MeshBasicMaterial({ map: crowdDiscTexture(), transparent: true, depthWrite: false, color: night ? 0x777788 : 0xffffff })
  );
  farDisc.rotation.x = -Math.PI / 2; farDisc.position.y = 0.6;
  scene.add(farDisc);
  if (night) buildStars(1500, 6000);
  return { ground, farDisc, sun };
}
function buildStars(n = 1800, dist = 6500) {
  const pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const v = new THREE.Vector3().randomDirection().multiplyScalar(dist);
    if (v.y < 200) v.y = 200 + Math.random() * dist * 0.7;
    pos.set([v.x, v.y, v.z], i * 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const stars = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xbdc8e0, size: 2.2, sizeAttenuation: true, transparent: true, opacity: 0.9, depthWrite: false, fog: false }));
  scene.add(stars);
  return stars;
}
function buildMoon(r = 120, dist = 5200) {
  const g = new THREE.Group();
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 18), new THREE.MeshBasicMaterial({ color: 0xe8e4d8, fog: false }));
  m.position.set(dist * 0.45, dist * 0.55, -dist * 0.7);
  g.add(m);
  scene.add(g);
  return { group: g, mesh: m };
}
function buildEarth() {
  const grp = new THREE.Group();
  const R = 100;
  const SUN_DIR = new THREE.Vector3(1, 0.28, 0.38).normalize();
  const globe = new THREE.Mesh(new THREE.SphereGeometry(R, 72, 48), new THREE.MeshStandardMaterial({ color: 0x24466e, roughness: 0.95, metalness: 0 }));
  grp.add(globe);
  const atmo = new THREE.Mesh(
    new THREE.SphereGeometry(R * 1.035, 72, 48),
    new THREE.ShaderMaterial({
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.BackSide,
      uniforms: { c: { value: new THREE.Color(0x3a6bd8) } },
      vertexShader: 'varying float vF; void main(){ vec3 n = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position,1.0); vF = pow(1.0 - abs(dot(n, normalize(-mv.xyz))), 3.0); gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'uniform vec3 c; varying float vF; void main(){ gl_FragColor = vec4(c, vF * 0.9); }'
    })
  );
  grp.add(atmo);
  scene.add(grp);
  return { group: grp, globe, R, SUN_DIR, ll2v: (lat, lon, r) => {
    const phi = THREE.MathUtils.degToRad(lat), lam = THREE.MathUtils.degToRad(lon);
    return new THREE.Vector3(r * Math.cos(phi) * Math.cos(lam), r * Math.sin(phi), -r * Math.cos(phi) * Math.sin(lam));
  }};
}

// ---------- crowd (instanced, GPU-animated: zero per-frame matrix uploads) ----------
const TONES = [0x5b5350, 0x6b5d52, 0x4a4a4e, 0x74665a, 0x585254, 0x6e5a4e, 0x4e5a66, 0x715a5a];
const SKIN = [0xc9a186, 0xa87a5f, 0x8a5f45, 0xdbb293, 0x6e4a33];
function bodyGeo() {
  const legL = new THREE.BoxGeometry(0.13, 0.72, 0.15); legL.translate(-0.09, 0.36, 0);
  const legR = new THREE.BoxGeometry(0.13, 0.72, 0.15); legR.translate(0.09, 0.36, 0);
  const torso = new THREE.CapsuleGeometry(0.21, 0.55, 2, 6); torso.translate(0, 1.02, 0);
  const armL = new THREE.BoxGeometry(0.08, 0.5, 0.1); armL.translate(-0.27, 1.0, 0);
  const armR = new THREE.BoxGeometry(0.08, 0.5, 0.1); armR.translate(0.27, 1.0, 0);
  return mergeGeometries([legL, legR, torso, armL, armR]);
}
function headGeo() {
  const h = new THREE.SphereGeometry(0.14, 6, 5);
  h.scale(1, 1.15, 1); h.translate(0, 1.52, 0);
  return h;
}
// crowdFx: uT = seconds since action (<-500 idle), uMode 0=bump 1=ballistic 2=run-east
function makeCrowdMaterial(color) {
  const mat = new THREE.MeshLambertMaterial({ color });
  return mat;
}
function buildCrowd({ count = TIERS[tier].count, maxR = 700, centerX = 0, centerZ = 0 } = {}) {
  const fx = {
    uT: { value: -1000 }, uSpread: { value: 0 }, uDur: { value: 0.45 },
    uMode: { value: 0 }, uV: { value: 0 },
  };
  function inject(mat) {
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, fx);
      sh.vertexShader = ('attribute float aJit;\nattribute float aScl;\nuniform float uT;\nuniform float uSpread;\nuniform float uDur;\nuniform float uMode;\nuniform float uV;\n' + sh.vertexShader)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
{
  float lt = uT - aJit * uSpread;
  if (uMode < 0.5) {
    if (lt > 0.0 && lt < uDur) transformed.y += sin(lt / uDur * 3.14159265) * 0.22 / max(aScl, 0.01);
  } else if (uMode < 1.5) {
    if (lt > 0.0 && lt < uDur) transformed.y += max(0.0, uV * lt - 4.905 * lt * lt) / max(aScl, 0.01);
  } else {
    float rt = clamp(lt, 0.0, uDur);
    if (rt > 0.0) { transformed.x += rt * uV / max(aScl, 0.01); transformed.y += abs(sin(rt * 9.0)) * 0.12 / max(aScl, 0.01); }
  }
}`);
    };
  }
  const pGeo = bodyGeo(), hGeo = headGeo();
  const pMat = makeCrowdMaterial(0xffffff), hMat = makeCrowdMaterial(0xffffff);
  inject(pMat); inject(hMat);
  const crowd = new THREE.InstancedMesh(pGeo, pMat, count);
  const heads = new THREE.InstancedMesh(hGeo, hMat, count);
  const base = new Float32Array(count * 3), scalesA = new Float32Array(count), dists = new Float32Array(count);
  {
    const m = new THREE.Matrix4(), col = new THREE.Color(), vs = new THREE.Vector3();
    let i = 0, r = 2.6;
    while (i < count && r < maxR) {
      const spacing = 0.48 * (1 + Math.pow(r / 55, 1.6));
      const n = Math.max(8, Math.floor((Math.PI * 2 * r) / spacing));
      for (let k = 0; k < n && i < count; k++, i++) {
        const a = (k / n) * Math.PI * 2 + Math.random() * 0.3;
        const rr = r + (Math.random() - .5) * spacing * 0.8;
        const x = centerX + Math.cos(a) * rr, z = centerZ + Math.sin(a) * rr;
        base[i * 3] = x; base[i * 3 + 1] = 0; base[i * 3 + 2] = z;
        dists[i] = Math.hypot(x - centerX, z - centerZ);
        const sc = 0.92 + Math.random() * 0.16;
        scalesA[i] = sc;
        m.makeRotationY(Math.random() * Math.PI * 2);
        m.scale(vs.set(sc, sc, sc));
        m.setPosition(x, 0, z);
        crowd.setMatrixAt(i, m); heads.setMatrixAt(i, m);
        col.setHex(TONES[(Math.random() * TONES.length) | 0]);
        col.offsetHSL(0, 0, (Math.random() - .5) * 0.12);
        crowd.setColorAt(i, col);
        col.setHex(SKIN[(Math.random() * SKIN.length) | 0]);
        heads.setColorAt(i, col);
      }
      r += spacing;
    }
    crowd.count = i; heads.count = i;
  }
  const jit = new Float32Array(count);
  for (let i = 0; i < count; i++) jit[i] = Math.random();
  pGeo.setAttribute('aJit', new THREE.InstancedBufferAttribute(jit, 1));
  hGeo.setAttribute('aJit', new THREE.InstancedBufferAttribute(jit, 1));
  pGeo.setAttribute('aScl', new THREE.InstancedBufferAttribute(scalesA, 1));
  hGeo.setAttribute('aScl', new THREE.InstancedBufferAttribute(scalesA, 1));
  scene.add(crowd, heads);
  return { crowd, heads, base, dists, scalesA, fx };
}

// ---------- near articulated agents + player ----------
function makeAgent(x, z) {
  const g = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color: TONES[(Math.random() * TONES.length) | 0] });
  const skin = new THREE.MeshLambertMaterial({ color: SKIN[(Math.random() * SKIN.length) | 0] });
  const legGeo = new THREE.BoxGeometry(0.13, 0.72, 0.15);
  const legL = new THREE.Mesh(legGeo, mat); legL.position.set(-0.09, 0.36, 0);
  const legR = new THREE.Mesh(legGeo, mat); legR.position.set(0.09, 0.36, 0);
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.21, 0.55, 2, 8), mat); body.position.y = 1.02;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), skin);
  head.scale.y = 1.15; head.position.y = 1.52;
  const armGeo = new THREE.BoxGeometry(0.09, 0.52, 0.09); armGeo.translate(0, 0.22, 0);
  const armL = new THREE.Mesh(armGeo, mat), armR = new THREE.Mesh(armGeo, mat);
  armL.position.set(-0.27, 1.22, 0); armR.position.set(0.27, 1.22, 0);
  armL.rotation.z = 0.15; armR.rotation.z = -0.15;
  g.add(legL, legR, body, head, armL, armR);
  g.position.set(x, 0, z);
  g.rotation.y = Math.random() * Math.PI * 2;
  scene.add(g);
  return { g, armL, armR, legL, legR, dist: Math.hypot(x, z), anim: 'idle', t: 0, jitter: 0, celebrate: undefined, sway: 0 };
}
function buildAgents(n = 48, cx = 0, cz = 0, rMin = 2.2, rMax = 25) {
  const agents = [];
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, r = rMin + Math.random() * (rMax - rMin);
    agents.push(makeAgent(cx + Math.cos(a) * r, cz + Math.sin(a) * r));
  }
  return agents;
}
function buildPlayer() {
  const p = makeAgent(0, 0);
  p.g.children.forEach(m => { if (m.material) m.material = m.material.clone(); });
  [0, 1, 2, 4, 5].forEach(i => p.g.children[i].material.color.setHex(0xc76b1d));
  return { g: p.g, parts: p, x: 0, z: 0, yaw: 0, pitch: -0.05, py: 0 };
}
function resetAgent(a) {
  a.anim = 'idle'; a.t = 0; a.celebrate = undefined;
  a.armL.rotation.set(0, 0, 0.15); a.armR.rotation.set(0, 0, -0.15);
  a.legL.rotation.set(0, 0, 0); a.legR.rotation.set(0, 0, 0);
  a.g.position.y = 0;
}
function tickAgent(a, dtSim) {
  if (a.anim === 'idle') return;
  a.t += dtSim;
  const t = a.t - a.jitter;
  if (a.anim === 'clap') {
    if (t < 0) return;
    if (t > 1.2) { a.anim = 'idle'; a.armL.rotation.x = a.armR.rotation.x = 0; return; }
    const cyc = (t % 0.4) / 0.4, ang = Math.sin(cyc * Math.PI) * -1.9;
    a.armL.rotation.x = ang; a.armR.rotation.x = ang;
    a.armL.rotation.z = 0.15 + Math.sin(cyc * Math.PI) * 0.5;
    a.armR.rotation.z = -0.15 - Math.sin(cyc * Math.PI) * 0.5;
  } else if (a.anim === 'ears') { // hands over ears (very loud near field)
    if (t < 0) return;
    const up = Math.min(t / 0.3, 1) * Math.max(0, 1 - Math.max(0, t - 2.5) / 0.6);
    a.armL.rotation.x = -2.6 * up; a.armR.rotation.x = -2.6 * up;
    a.armL.rotation.z = 0.9 * up + 0.15; a.armR.rotation.z = -0.9 * up - 0.15;
    if (t > 3.2) { a.anim = 'idle'; a.armL.rotation.set(0, 0, 0.15); a.armR.rotation.set(0, 0, -0.15); }
  } else if (a.anim === 'jump') {
    if (t < 0) { a.g.position.y = -0.06; a.armL.rotation.x = a.armR.rotation.x = 0.5; return; }
    const ft = a.ft || 0.53;
    if (t >= ft) { a.anim = 'idle'; a.g.position.y = 0; a.armL.rotation.x = a.armR.rotation.x = 0; return; }
    a.g.position.y = Math.max(0, (a.v || 2.6) * t - 4.905 * t * t);
    a.armL.rotation.x = -1.2 * Math.sin(Math.PI * Math.min(t / ft, 1));
    a.armR.rotation.x = a.armL.rotation.x;
  } else if (a.anim === 'run') {
    if (t < 0) return;
    const rt = Math.min(t, a.runDur || 12);
    a.g.position.x += (a.v || 4) * dtSim;
    a.g.position.y = Math.abs(Math.sin(rt * 9)) * 0.12;
    a.legL.rotation.x = Math.sin(rt * 9) * 0.7; a.legR.rotation.x = -Math.sin(rt * 9) * 0.7;
    a.armL.rotation.x = -Math.sin(rt * 9) * 0.5; a.armR.rotation.x = Math.sin(rt * 9) * 0.5;
    a.g.rotation.y = -Math.PI / 2; // face +x (east)
    if (t > (a.runDur || 12)) { a.anim = 'idle'; a.g.position.y = 0; a.legL.rotation.x = a.legR.rotation.x = 0; }
  } else if (a.anim === 'celebrate') {
    if (a.celebrate === undefined) return;
    const ct = Math.min(a.t / a.celebrate, 1), up = Math.sin(ct * Math.PI);
    a.armL.rotation.x = -2.5 * up + Math.sin(a.t * 1.3 + a.sway) * 0.06 * ct;
    a.armR.rotation.x = -2.5 * up + Math.cos(a.t * 1.1 + a.sway) * 0.06 * ct;
    a.armL.rotation.z = 0.4 * up + 0.15; a.armR.rotation.z = -0.4 * up - 0.15;
    a.g.position.y = Math.max(0, Math.sin(ct * Math.PI * 3)) * 0.05;
  }
}

// ---------- input + cameras ----------
const keys = {};
addEventListener('keydown', e => keys[e.code] = true);
addEventListener('keyup', e => keys[e.code] = false);
let pov = 'fp';
const POV_LABEL = { fp: 'First person', tp: 'Third person', aerial: 'Aerial' };
let aerialH = 130;
const look = { active: false, id: -1, x: 0, y: 0 };
const move = { active: false, id: -1, sx: 0, sy: 0, dx: 0, dy: 0 };
const orbit = { theta: -2.78, phi: 1.83, dist: 260, mode: 'orbit' }; // orbit|iss|moon

// ---------- effects ----------
const fxState = { shake: 0 };
const waveRing = new THREE.Mesh(
  new THREE.RingGeometry(0.97, 1, 64),
  new THREE.MeshBasicMaterial({ color: 0xc76b1d, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false })
);
waveRing.rotation.x = -Math.PI / 2; waveRing.position.y = 0.4; waveRing.visible = false;
const dustRing = new THREE.Mesh(
  new THREE.RingGeometry(0.88, 1, 64),
  new THREE.MeshBasicMaterial({ map: dustSprite(), transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false })
);
dustRing.rotation.x = -Math.PI / 2; dustRing.position.y = 1.1; dustRing.visible = false;
const haze = new THREE.Mesh(
  new THREE.CircleGeometry(1600, 40),
  new THREE.MeshBasicMaterial({ color: 0xd8c9a8, transparent: true, opacity: 0, depthWrite: false })
);
haze.rotation.x = -Math.PI / 2; haze.position.y = 1.4; haze.visible = false;
function addGroundFx() { scene.add(waveRing, dustRing, haze); }
function flashScreen(op = 0.85) {
  const f = document.createElement('div');
  f.style.cssText = `position:fixed;inset:0;background:#fff;opacity:${op};pointer-events:none;transition:opacity .45s`;
  document.body.appendChild(f);
  requestAnimationFrame(() => f.style.opacity = 0);
  setTimeout(() => f.remove(), 600);
}
function shakeCam(amt) { fxState.shake = Math.max(fxState.shake, amt); }
function fovPunch(to = 76) { camera.fov = to; camera.updateProjectionMatrix(); }
let hazeT = -1, hazePeak = 0.3;
function triggerHaze(peak = 0.3) { hazePeak = peak; hazeT = 0; haze.visible = true; }
function tickFx(dt) {
  if (fxState.shake > 0.002) {
    camera.position.x += (Math.random() - 0.5) * fxState.shake;
    camera.position.y += (Math.random() - 0.5) * fxState.shake * 0.6;
    camera.position.z += (Math.random() - 0.5) * fxState.shake;
    fxState.shake *= Math.pow(0.03, dt);
  }
  if (camera.fov !== 68 && !orbiting()) {
    camera.fov += (68 - camera.fov) * Math.min(1, dt * 4);
    if (Math.abs(camera.fov - 68) < 0.3) camera.fov = 68;
    camera.updateProjectionMatrix();
  }
  if (hazeT >= 0) {
    hazeT += dt;
    const o = hazeT < 1.2 ? hazeT / 1.2 * hazePeak : Math.max(0, hazePeak - (hazeT - 1.2) * 0.035);
    haze.material.opacity = o;
    if (o <= 0) { hazeT = -1; haze.visible = false; }
  }
}
function makeRain(count = 1200, area = 260) {
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = (Math.random() - 0.5) * area;
    pos[i * 3 + 1] = Math.random() * 80;
    pos[i * 3 + 2] = (Math.random() - 0.5) * area;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const pts = new THREE.Points(g, new THREE.PointsMaterial({ color: 0x9db4c8, size: 0.55, transparent: true, opacity: 0.75, depthWrite: false }));
  pts.visible = false;
  scene.add(pts);
  return {
    mesh: pts,
    tick(dt, cx, cz) {
      if (!pts.visible) return;
      const a = g.attributes.position.array;
      for (let i = 0; i < count; i++) {
        a[i * 3 + 1] -= 42 * dt;
        if (a[i * 3 + 1] < 0) {
          a[i * 3] = cx + (Math.random() - 0.5) * area;
          a[i * 3 + 1] = 60 + Math.random() * 20;
          a[i * 3 + 2] = cz + (Math.random() - 0.5) * area;
        }
      }
      g.attributes.position.needsUpdate = true;
    },
  };
}
function makeWind(count = 700, area = 300) {
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = (Math.random() - 0.5) * area;
    pos[i * 3 + 1] = 0.3 + Math.random() * 6;
    pos[i * 3 + 2] = (Math.random() - 0.5) * area;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const pts = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xe8e2d2, size: 0.4, transparent: true, opacity: 0.5, depthWrite: false }));
  pts.visible = false;
  scene.add(pts);
  return {
    mesh: pts, speed: 0,
    tick(dt, cx, cz) {
      if (!pts.visible) return;
      const a = g.attributes.position.array;
      for (let i = 0; i < count; i++) {
        a[i * 3] += this.speed * dt;
        if (a[i * 3] > cx + area / 2) {
          a[i * 3] = cx - area / 2;
          a[i * 3 + 1] = 0.3 + Math.random() * 6;
          a[i * 3 + 2] = cz + (Math.random() - 0.5) * area;
        }
      }
      g.attributes.position.needsUpdate = true;
    },
  };
}

// ---------- UI helpers ----------
function setMeter(label, val, frac, hot) {
  if (label !== undefined) ui.meterLabel.textContent = label;
  ui.fill.style.width = Math.min(100, Math.max(0, frac * 100)) + '%';
  ui.fill.classList.toggle('hot', !!hot);
  ui.meterVal.textContent = val;
}
function setStat(label, val) { ui.statL.textContent = label; ui.stat.textContent = val; }
function setTime(label, val) { ui.timeL.textContent = label; ui.time.textContent = val; }
function showResults(rows, notes) {
  ui.resRows.innerHTML = rows.map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('');
  ui.resNotes.innerHTML = (notes || []).map(n => `<div class="note" style="margin-top:8px">${n}</div>`).join('');
  ui.results.style.display = 'block';
}
function bindControls(defs, settings, onChange) {
  ui.sliders.innerHTML = '';
  for (const d of defs) {
    const row = document.createElement('div');
    row.className = 'row';
    row.innerHTML = `${d.label} <input id="sl-${d.id}" type="range" min="${d.min}" max="${d.max}" step="${d.step}" value="${d.value}"><span id="sl-${d.id}-v"></span>`;
    ui.sliders.appendChild(row);
    const el = row.querySelector('input'), lab = row.querySelector('span');
    const render = () => lab.textContent = d.fmt(settings[d.id]);
    el.addEventListener('input', () => { settings[d.id] = parseFloat(el.value); render(); if (onChange) onChange(); });
    render();
  }
}

// ---------- sequence driver ----------
const S = { phase: 'idle', t: 0, slow: false };
let SC = null; // active scenario
let ctx = null;
let countTimeout = 0;
function showCount(txt) {
  ui.count.textContent = txt; ui.count.style.opacity = 1;
  clearTimeout(countTimeout);
  countTimeout = setTimeout(() => ui.count.style.opacity = 0, txt.length > 3 ? 800 : 650);
}
function resetSim() {
  S.phase = 'idle'; S.t = 0; S.slow = false;
  stopMurmur();
  ui.slow.classList.remove('on'); ui.count.style.opacity = 0;
  setTime('Time', '-'); ui.results.style.display = 'none';
  waveRing.visible = false; dustRing.visible = false; haze.visible = false; hazeT = -1;
  fxState.shake = 0; camera.fov = 68; camera.updateProjectionMatrix();
  if (SC && SC.onReset) SC.onReset(ctx);
}
ui.slow.onclick = () => { S.slow = !S.slow; ui.slow.classList.toggle('on', S.slow); };
ui.again.onclick = () => { audio(); resetSim(); };
ui.start.onclick = () => {
  audio(); resetSim(); S.phase = 'countdown'; S.t = 0;
  showCount(3); beep(880, AC.currentTime);
};
$('close-res').onclick = () => ui.results.style.display = 'none';
const panelEl = $('panel');
$('ctl').onclick = () => { panelEl.style.display = panelEl.style.display === 'none' ? 'block' : 'none'; };
if (matchMedia('(max-width: 760px)').matches) panelEl.style.display = 'none';

// ---------- POV / camera ----------
function orbiting() { return SC && SC.view === 'orbit'; }
function setPov(p, player) {
  pov = p;
  ui.pov.textContent = orbiting() ? (orbit.mode === 'iss' ? 'ISS view' : orbit.mode === 'moon' ? 'Moon view' : 'Orbit') : POV_LABEL[p];
  document.querySelectorAll('#povbar .btn[data-pov]').forEach(x => x.classList.toggle('on', x.dataset.pov === p));
  if (orbiting()) { orbit.mode = p; if (p === 'iss') orbit.dist = 107; else if (p === 'moon') orbit.dist = 23000; else orbit.dist = 260; }
  else if (player) player.g.visible = p !== 'fp';
}
function tickGroundCamera(player, dt) {
  const sp = keys['ShiftLeft'] ? 10 : 5.5;
  let mx = 0, mz = 0;
  if (keys['KeyW'] || keys['ArrowUp']) mz -= 1;
  if (keys['KeyS'] || keys['ArrowDown']) mz += 1;
  if (keys['KeyA'] || keys['ArrowLeft']) mx -= 1;
  if (keys['KeyD'] || keys['ArrowRight']) mx += 1;
  mx += move.dx; mz += move.dy;
  const len = Math.hypot(mx, mz);
  if (len > 0.01) {
    mx /= Math.max(1, len); mz /= Math.max(1, len);
    const sin = Math.sin(player.yaw), cos = Math.cos(player.yaw);
    const v = pov === 'aerial' ? aerialH * 0.5 : sp;
    player.x += (mx * cos - mz * sin) * v * dt;
    player.z += (mz * cos + mx * sin) * v * dt;
  }
  const lim = 2600;
  player.x = THREE.MathUtils.clamp(player.x, -lim, lim);
  player.z = THREE.MathUtils.clamp(player.z, -lim, lim);
  player.g.position.set(player.x, player.py || 0, player.z);
  player.g.rotation.y = player.yaw;
  if (pov === 'fp') {
    camera.position.set(player.x, 1.68 + (player.py || 0), player.z);
    camera.rotation.set(0, 0, 0, 'YXZ');
    camera.rotation.y = player.yaw; camera.rotation.x = player.pitch;
  } else if (pov === 'tp') {
    camera.position.set(player.x + Math.sin(player.yaw) * 4.2, 2.6 + (player.py || 0), player.z + Math.cos(player.yaw) * 4.2);
    camera.lookAt(player.x, 1.3 + (player.py || 0), player.z);
  } else {
    camera.position.set(player.x, aerialH, player.z + aerialH * 0.55);
    camera.lookAt(player.x, 0, player.z);
  }
}
function tickOrbitCamera() {
  if (orbit.mode === 'moon') { camera.position.set(0, 0, orbit.dist); camera.lookAt(0, 0, 0); }
  else if (orbit.mode === 'iss') {
    const a = performance.now() * 0.00012;
    camera.position.set(Math.cos(a) * orbit.dist, 8, Math.sin(a) * orbit.dist);
    camera.lookAt(Math.cos(a + 0.35) * 100, -6, Math.sin(a + 0.35) * 100);
  } else {
    camera.position.set(
      orbit.dist * Math.sin(orbit.phi) * Math.cos(orbit.theta),
      orbit.dist * Math.cos(orbit.phi),
      orbit.dist * Math.sin(orbit.phi) * Math.sin(orbit.theta));
    camera.lookAt(0, 0, 0);
  }
}
canvas.addEventListener('pointerdown', e => {
  if (orbiting()) { look.active = true; look.id = e.pointerId; look.x = e.clientX; look.y = e.clientY; return; }
  if (e.clientX < innerWidth * 0.45 && !move.active) {
    move.active = true; move.id = e.pointerId; move.sx = e.clientX; move.sy = e.clientY; move.dx = move.dy = 0;
    const stick = $('stick');
    stick.style.display = 'block';
    stick.style.left = (e.clientX - 55) + 'px'; stick.style.top = (e.clientY - 55) + 'px';
  } else if (!look.active) { look.active = true; look.id = e.pointerId; look.x = e.clientX; look.y = e.clientY; }
});
addEventListener('pointermove', e => {
  if (orbiting()) {
    if (look.active && e.pointerId === look.id) {
      orbit.theta += (e.clientX - look.x) * 0.005;
      orbit.phi = THREE.MathUtils.clamp(orbit.phi + (e.clientY - look.y) * 0.005, 0.15, Math.PI - 0.15);
      look.x = e.clientX; look.y = e.clientY;
    }
    return;
  }
  if (move.active && e.pointerId === move.id) {
    move.dx = THREE.MathUtils.clamp((e.clientX - move.sx) / 45, -1, 1);
    move.dy = THREE.MathUtils.clamp((e.clientY - move.sy) / 45, -1, 1);
    const knob = $('knob');
    knob.style.left = (33 + move.dx * 30) + 'px'; knob.style.top = (33 + move.dy * 30) + 'px';
  } else if (look.active && e.pointerId === look.id && ctx) {
    ctx.player.yaw -= (e.clientX - look.x) * 0.0042;
    ctx.player.pitch = THREE.MathUtils.clamp(ctx.player.pitch - (e.clientY - look.y) * 0.0042, -1.4, 1.4);
    look.x = e.clientX; look.y = e.clientY;
  }
});
addEventListener('pointerup', e => {
  if (e.pointerId === move.id) { move.active = false; move.dx = move.dy = 0; $('stick').style.display = 'none'; $('knob').style.left = '33px'; $('knob').style.top = '33px'; }
  if (e.pointerId === look.id) look.active = false;
});
addEventListener('wheel', e => {
  if (orbiting() && orbit.mode === 'orbit') orbit.dist = THREE.MathUtils.clamp(orbit.dist * (1 + Math.sign(e.deltaY) * 0.12), 120, 1200);
  else if (pov === 'aerial') aerialH = THREE.MathUtils.clamp(aerialH * (1 + Math.sign(e.deltaY) * 0.12), 40, 600);
});

// ---------- adaptive quality ----------
let emaFps = 60, badT = 0, degStep = 0;
function degradeQuality() {
  degStep++;
  const cr = ctx && ctx.crowdPack;
  if (cr) {
    const n = degStep === 1 ? Math.max(800, Math.floor(cr.crowd.count * 0.55)) : degStep === 2 ? Math.max(600, Math.floor(cr.crowd.count * 0.6)) : 500;
    cr.crowd.count = n; cr.heads.count = n;
    if (degStep >= 2) renderer.setPixelRatio(1);
    ui.qbadge.style.display = 'block';
    ui.qbadge.textContent = 'Performance mode - crowd ' + n.toLocaleString('en-IN');
  } else {
    renderer.setPixelRatio(1);
    ui.qbadge.style.display = 'block';
    ui.qbadge.textContent = 'Performance mode - lower resolution';
  }
  badT = 0;
}
function tickQuality(dt) {
  const fps = 1 / Math.max(dt, 1e-4);
  emaFps += (fps - emaFps) * 0.04;
  if (emaFps < 27 && degStep < 3) { badT += dt; if (badT > 2.5) degradeQuality(); }
  else badT = Math.max(0, badT - dt * 0.5);
}

// ---------- picker ----------
export const SCENARIOS = {
  claps:      { file: './scenarios/claps.js',      name: '8 Billion Claps' },
  jump:       { file: './scenarios/jump.js',       name: '8 Billion Jumps' },
  lights:     { file: './scenarios/lights.js',     name: 'World Lights Off' },
  flash:      { file: './scenarios/flash.js',      name: 'Flash from Space' },
  flashlights:{ file: './scenarios/flashlights.js',name: 'Flashlights at the Moon' },
  lasers:     { file: './scenarios/lasers.js',     name: 'Lasers at the Moon' },
  run:        { file: './scenarios/run.js',        name: 'Everyone Runs East' },
  drive:      { file: './scenarios/drive.js',      name: 'Everyone Drives at Once' },
  fans:       { file: './scenarios/fans.js',       name: '8 Billion Fans' },
  kettles:    { file: './scenarios/kettles.js',    name: '8 Billion Kettles' },
  campfire:   { file: './scenarios/campfire.js',   name: '8 Billion Campfires' },
  umbrellas:  { file: './scenarios/umbrellas.js',  name: '8 Billion Umbrellas' },
  balls:      { file: './scenarios/balls.js',      name: '8 Billion Balls' },
  trees:      { file: './scenarios/trees.js',      name: '8 Billion Trees' },
  ocean:      { file: './scenarios/ocean.js',      name: 'Everyone Into the Ocean' },
};
function buildPicker() {
  ui.picker.innerHTML = '<b>WHAT IF?</b><span>Pick a scenario</span><div id="pick-grid"></div>';
  const grid = ui.picker.querySelector('#pick-grid');
  for (const [id, s] of Object.entries(SCENARIOS)) {
    const b = document.createElement('button');
    b.className = 'pick';
    b.textContent = s.name;
    b.onclick = () => { location.hash = id; };
    grid.appendChild(b);
  }
}
addEventListener('hashchange', () => location.reload());

// ---------- boot ----------
async function boot() {
  buildPicker();
  const id = (location.hash || '').replace('#', '');
  if (!id || !SCENARIOS[id]) { ui.picker.style.display = 'flex'; ui.start.disabled = true; return; }
  ui.picker.style.display = 'none';
  const mod = await import(SCENARIOS[id].file);
  SC = mod.default;
  ui.titleB.textContent = 'WHAT IF? - ' + SC.title;
  document.title = 'What If? - ' + SC.title;
  ui.titleS.textContent = SC.subtitle || '';
  ui.meterLabel.textContent = SC.meterLabel || '';
  ui.panelNote.textContent = SC.note || '';
  ui.whatnot.innerHTML = '<b>What will NOT happen:</b> ' + SC.whatnot;
  // POV buttons
  const bar = $('povbar');
  bar.querySelectorAll('.btn[data-pov]').forEach(b => b.remove());
  const povs = SC.view === 'orbit' ? [['orbit', 'Orbit'], ['iss', 'ISS view'], ['moon', 'Moon view']] : [['fp', 'First person'], ['tp', 'Third person'], ['aerial', 'Aerial']];
  for (const [p, label] of povs) {
    const b = document.createElement('button');
    b.className = 'btn'; b.dataset.pov = p; b.textContent = label;
    b.onclick = () => setPov(p, ctx && ctx.player);
    bar.appendChild(b);
  }
  bindControls(SC.controls || [], SC.settings, SC.onSettingsChange ? () => SC.onSettingsChange(ctx) : null);
  ctx = SC.setup({ THREE, scene, camera, renderer, IS_MOBILE, tierCount: TIERS[tier].count });
  ctx.settings = SC.settings;
  ctx.S = S;
  ctx.fx = { waveRing, dustRing, flashScreen, shakeCam, fovPunch, triggerHaze, haze };
  ctx.audio = { beep, noiseBurst, rumble, startMurmur, stopMurmur, now: () => AC ? AC.currentTime : 0 };
  ctx.ui = { setMeter, setStat, setTime };
  ctx.finish = (rows, notes) => {
    showResults(rows, (notes || []).concat(SC.notes || []));
    S.phase = 'aftermath'; S.t = 0;
    if (SC.onAftermath) SC.onAftermath(ctx);
  };
  setPov(SC.defaultPov && povs.some(p => p[0] === SC.defaultPov) ? SC.defaultPov : povs[0][0], ctx.player);
  ui.start.disabled = false;
}
const clock = new THREE.Clock();
// Simulation runs on its own clock: fixed 1/60 s steps drained from real elapsed
// time (max 8 steps per frame). At 60/30 fps the sim keeps wall-clock pace; below
// ~7.5 fps it slows down gracefully instead of taking unstable large steps.
const SIM_STEP = 1 / 60, SIM_MAX_STEPS = 8;
let simAcc = 0;
function stepSim(h) {
  const hSim = h * (S.slow ? 0.1 : 1);
  if (S.phase === 'countdown') {
    const prev = Math.ceil(3 - S.t);
    S.t += hSim;
    const cur = Math.ceil(3 - S.t);
    if (cur !== prev && cur > 0) { showCount(cur); beep(880, AC ? AC.currentTime : 0); }
    if (S.t >= 3) {
      S.phase = 'action'; S.t = 0;
      showCount(SC.actionWord || 'GO');
      beep(1320, AC ? AC.currentTime : 0);
      SC.onAction(ctx);
    }
  } else if (S.phase === 'action' || S.phase === 'aftermath') {
    S.t += hSim;
    SC.tick(ctx, hSim);
  }
}
function loop() {
  const rawDt = clock.getDelta();
  const dt = Math.min(rawDt, 0.25); // render-side effects clamp; sim clock gets true elapsed
  tickQuality(dt);
  if (SC && ctx) {
    simAcc = Math.min(simAcc + rawDt, SIM_STEP * SIM_MAX_STEPS);
    while (simAcc >= SIM_STEP) { stepSim(SIM_STEP); simAcc -= SIM_STEP; }
    if (orbiting()) tickOrbitCamera();
    else { tickGroundCamera(ctx.player, dt); if (SC.tickPlayer) SC.tickPlayer(ctx, dt); }
    tickFx(dt);
  }
  renderer.render(scene, camera);
  requestAnimationFrame(loop);
}
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
boot();
loop();

// shared exports for scenarios
export { buildSaltFlat, buildStars, buildMoon, buildEarth, buildCrowd, buildAgents, buildPlayer, resetAgent, tickAgent, makeRain, makeWind, showCount, addGroundFx };
