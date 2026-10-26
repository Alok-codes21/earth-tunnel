import * as THREE from 'three';

// ---------- basics ----------
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05070d);
const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.5, 80000);

const R = 100; // Earth radius units
const SUN_DIR = new THREE.Vector3(1, 0.28, 0.38).normalize();

// ---------- earth ----------
const earth = new THREE.Group();
scene.add(earth);
const globe = new THREE.Mesh(
  new THREE.SphereGeometry(R, 96, 64),
  new THREE.MeshStandardMaterial({ color: 0x24466e, roughness: 0.95, metalness: 0 })
);
earth.add(globe);
// atmosphere rim (fresnel, additive)
const atmo = new THREE.Mesh(
  new THREE.SphereGeometry(R * 1.035, 96, 64),
  new THREE.ShaderMaterial({
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.BackSide,
    uniforms: { c: { value: new THREE.Color(0x3a6bd8) } },
    vertexShader: 'varying float vF; void main(){ vec3 n = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position,1.0); vF = pow(1.0 - abs(dot(n, normalize(-mv.xyz))), 3.0); gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'uniform vec3 c; varying float vF; void main(){ gl_FragColor = vec4(c, vF * 0.9); }'
  })
);
earth.add(atmo);
const sunLight = new THREE.DirectionalLight(0xfff4e0, 2.2);
sunLight.position.copy(SUN_DIR).multiplyScalar(1000);
scene.add(sunLight, new THREE.AmbientLight(0x101a2a, 0.35));

// ---------- stars ----------
{
  const n = 2200, pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const v = new THREE.Vector3().randomDirection().multiplyScalar(40000);
    pos.set([v.x, v.y, v.z], i * 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  scene.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0xbdc8e0, size: 60, sizeAttenuation: true, transparent: true, opacity: 0.85, depthWrite: false })));
}

// ---------- city lights ----------
// major metro clusters [lat, lon, weight]
const CLUSTERS = [
  [28.6,77.2,9],[19.1,72.9,7],[12.97,77.6,4],[13.1,80.3,3],[17.4,78.5,3],[22.6,88.4,5],[24.9,67.0,5],[23.8,90.4,6],
  [39.9,116.4,8],[31.2,121.5,8],[35.7,139.7,9],[34.7,135.5,4],[37.6,127.0,7],[25.0,121.6,3],[22.3,114.2,3],[1.35,103.8,3],
  [-6.2,106.8,6],[14.6,121.0,4],[13.8,100.5,4],
  [6.5,3.4,5],[30.0,31.2,5],[-4.3,15.3,3],[-26.2,28.0,3],
  [55.8,37.6,5],[41.0,28.9,4],[51.5,-0.1,5],[48.9,2.4,5],[51.4,6.9,5],[40.4,-3.7,3],
  [40.7,-74.0,8],[34.1,-118.2,5],[41.9,-87.6,5],[29.8,-95.4,4],[43.7,-79.4,4],[19.4,-99.1,6],
  [-23.6,-46.6,6],[-34.6,-58.4,4],[-12.0,-77.0,3],[4.7,-74.1,3],[-33.4,-70.7,3],
  [-33.9,151.2,3],[-37.8,145.0,3],[24.7,46.7,3],[35.7,51.4,4],[33.3,44.4,2]
];
function ll2v(lat, lon, r) {
  const phi = THREE.MathUtils.degToRad(lat), lam = THREE.MathUtils.degToRad(lon);
  return new THREE.Vector3(r * Math.cos(phi) * Math.cos(lam), r * Math.sin(phi), -r * Math.cos(phi) * Math.sin(lam));
}
function gauss() { return (Math.random() + Math.random() + Math.random()) / 1.5 - 1; }
const LIGHTS = [];
for (const [lat, lon, w] of CLUSTERS) {
  const count = w * 45, sigma = 1.2 + w * 0.18;
  for (let i = 0; i < count; i++) {
    const la = lat + gauss() * sigma, lo = lon + gauss() * sigma;
    const v = ll2v(la, lo, R * 1.004);
    if (v.clone().normalize().dot(SUN_DIR) > -0.02) continue; // night side only
    LIGHTS.push({ v, b: (0.22 + Math.random() * 0.26) * (3 / (2 + w)), off: 0 }); // per-point dimmed so integrated cluster brightness stays constant
  }
}
for (let i = 0; i < 2500; i++) { // faint background scatter
  const v = new THREE.Vector3().randomDirection().multiplyScalar(R * 1.003);
  if (v.clone().normalize().dot(SUN_DIR) > -0.02) continue;
  LIGHTS.push({ v, b: 0.05 + Math.random() * 0.12, off: 0 });
}
const lGeo = new THREE.BufferGeometry();
{
  const pos = new Float32Array(LIGHTS.length * 3), col = new Float32Array(LIGHTS.length * 3);
  LIGHTS.forEach((L, i) => {
    pos.set([L.v.x, L.v.y, L.v.z], i * 3);
    const warm = new THREE.Color(0xffc37a).multiplyScalar(L.b);
    col.set([warm.r, warm.g, warm.b], i * 3);
  });
  lGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  lGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
}
const lMat = new THREE.PointsMaterial({ size: 0.6, vertexColors: true, sizeAttenuation: true, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false });
const lightPoints = new THREE.Points(lGeo, lMat);
earth.add(lightPoints);
function setLightBrightness(idx, k) {
  const L = LIGHTS[idx], warm = new THREE.Color(0xffc37a).multiplyScalar(L.b * k);
  lGeo.attributes.color.setXYZ(idx, warm.r, warm.g, warm.b);
}

// ---------- physics (illustrative swing model) ----------
const F0 = 50, AVG_GEN_GW = 3300; // ~29,000 TWh/yr
const settings = { share: 15, inertia: 4, spread: 2 };
const shedGW = () => AVG_GEN_GW * settings.share / 100;
const S = { phase: 'idle', t: 0, absT: 0, freq: F0, offFrac: 0, tripped: false, tripAbs: 0, peak: F0, rocof: 0, resultsShown: false };

// ---------- UI ----------
const $ = id => document.getElementById(id);
const ui = { time: $('r-time'), lights: $('r-lights'), pov: $('r-pov'), fill: $('freqfill'), fval: $('freqval'), count: $('count'), results: $('results'), loadv: $('loadv') };
function fmtLoad() { ui.loadv.textContent = '~' + Math.round(shedGW()) + ' GW'; }
fmtLoad();
function bindSlider(id, key, fmt) {
  const el = $(id), lab = $(id + '-v');
  el.addEventListener('input', () => { settings[key] = parseFloat(el.value); lab.textContent = fmt(settings[key]); fmtLoad(); });
}
bindSlider('share', 'share', v => v + '%');
bindSlider('inertia', 'inertia', v => v + ' s');
bindSlider('spread', 'spread', v => v === 0 ? 'perfect sync' : v + ' s');

// ---------- POV ----------
let pov = 'orbit';
const camS = { dist: 260, theta: -2.78, phi: 1.83 }; // night-side view (opposite SUN_DIR)
const POVS = { orbit: 'Orbit', iss: 'ISS view', moon: 'Moon view' };
function setPov(p) {
  pov = p; ui.pov.textContent = POVS[p];
  document.querySelectorAll('#povbar .btn[data-pov]').forEach(b => b.classList.toggle('on', b.dataset.pov === p));
  if (p === 'iss') camS.dist = 107; else if (p === 'moon') camS.dist = 23000; else camS.dist = 260;
}
document.querySelectorAll('#povbar .btn[data-pov]').forEach(b => b.addEventListener('click', () => setPov(b.dataset.pov)));
let dragging = false, px = 0, py = 0;
canvas.addEventListener('pointerdown', e => { dragging = true; px = e.clientX; py = e.clientY; });
addEventListener('pointermove', e => {
  if (!dragging || pov !== 'orbit') return;
  camS.theta += (e.clientX - px) * 0.005; camS.phi = THREE.MathUtils.clamp(camS.phi + (e.clientY - py) * 0.005, 0.15, Math.PI - 0.15);
  px = e.clientX; py = e.clientY;
});
addEventListener('pointerup', () => dragging = false);
addEventListener('wheel', e => { if (pov === 'orbit') camS.dist = THREE.MathUtils.clamp(camS.dist * (1 + Math.sign(e.deltaY) * 0.12), 120, 1200); });

// ---------- sequence ----------
let AC = null, master = null;
function audio() {
  if (!AC) { AC = new (window.AudioContext || window.webkitAudioContext)(); master = AC.createGain(); master.gain.value = 0.4; master.connect(AC.destination); }
  if (AC.state === 'suspended') AC.resume();
}
function beep(freq, when, dur = 0.12, type = 'sine', gain = 0.5) {
  if (!AC) return;
  const o = AC.createOscillator(), g = AC.createGain();
  o.type = type; o.frequency.value = freq;
  g.gain.setValueAtTime(gain, when); g.gain.exponentialRampToValueAtTime(0.001, when + dur);
  o.connect(g).connect(master); o.start(when); o.stop(when + dur + 0.02);
}
function showCount(txt) { ui.count.textContent = txt; ui.count.style.opacity = 1; setTimeout(() => ui.count.style.opacity = 0, 650); }

function startSeq() {
  audio(); resetSim(); S.phase = 'countdown'; S.t = 0; showCount(3); beep(880, AC.currentTime);
}
function resetSim() {
  S.phase = 'idle'; S.t = 0; S.absT = 0; S.freq = F0; S.offFrac = 0; S.tripped = false; S.tripAbs = 0; S.peak = F0; S.rocof = 0; S.resultsShown = false;
  LIGHTS.forEach((L, i) => { L.off = 0; setLightBrightness(i, 1); });
  lGeo.attributes.color.needsUpdate = true;
  ui.results.style.display = 'none'; ui.count.style.opacity = 0;
}
$('start').onclick = startSeq;
$('again').onclick = () => { audio(); resetSim(); };
$('close-res').onclick = () => ui.results.style.display = 'none';
const panelEl = $('panel');
$('ctl').onclick = () => { panelEl.style.display = panelEl.style.display === 'none' ? 'block' : 'none'; };
if (matchMedia('(max-width: 760px)').matches) panelEl.style.display = 'none';

function tickSequence(dt) {
  if (S.phase === 'idle') return;
  if (S.phase === 'countdown') {
    const prev = Math.ceil(3 - S.t); S.t += dt;
    const cur = Math.ceil(3 - S.t);
    if (cur !== prev && cur > 0) { showCount(cur); beep(880, AC.currentTime); }
    if (S.t >= 3) {
      S.phase = 'switching'; S.t = 0;
      showCount('LIGHTS OFF'); beep(320, AC.currentTime, 0.4, 'sine', 0.6);
      // assign per-light off times within spread
      LIGHTS.forEach(L => L.off = Math.random() * Math.max(settings.spread, 0.2));
    }
    return;
  }
  if (S.phase === 'switching' || S.phase === 'after') {
    S.t += dt; S.absT += dt;
    // lights fade
    let offCount = 0;
    if (S.phase === 'switching') {
      LIGHTS.forEach((L, i) => {
        const k = THREE.MathUtils.clamp((S.t - L.off) / 0.5, 0, 1);
        if (k > 0 && k <= 1) setLightBrightness(i, 1 - k);
        if (k >= 1) offCount++;
      });
      lGeo.attributes.color.needsUpdate = true;
      S.offFrac = offCount / LIGHTS.length;
      if (offCount >= LIGHTS.length) { S.phase = 'after'; S.t = 0; }
    } else S.offFrac = 1;
    // swing model: surplus generation = shed load x offFrac
    const surplus = shedGW() * S.offFrac; // GW
    let dp = surplus;
    if (S.tripped) dp = surplus - shedGW() * 0.95 * Math.min(Math.max((S.absT - S.tripAbs) / 4, 0), 1); // relays shed generation (authored simplification)
    const dfdt = F0 * dp / (2 * settings.inertia * AVG_GEN_GW);
    S.freq += dfdt * dt;
    S.rocof = Math.max(S.rocof, Math.abs(dfdt));
    S.peak = Math.max(S.peak, S.freq);
    if (!S.tripped && S.freq >= 50.8) {
      S.tripped = true; S.tripAbs = S.absT;
      ui.fval.textContent = S.freq.toFixed(2) + ' Hz - relays tripping (authored simplification)';
      beep(180, AC.currentTime, 0.5, 'sawtooth', 0.35);
    }
    if (S.tripped) {
      // authored damping back toward 50.1
      S.freq += (50.1 - S.freq) * 0.35 * dt;
    }
    // results after settling (10 s after full switch-off)
    if (S.phase === 'after' && S.t > 10 && !S.resultsShown) { S.resultsShown = true; showResults(); }
  }
}
function showResults() {
  $('res-load').textContent = '~' + Math.round(shedGW()) + ' GW (' + settings.share + '% of ~3,300 GW avg)';
  $('res-energy').textContent = '~' + Math.round(shedGW()) + ' GWh per hour';
  $('res-co2').textContent = '~' + Math.round(shedGW() * 0.5) + ' thousand tonnes/h';
  $('res-peak').textContent = S.peak.toFixed(2) + ' Hz (swing model, illustrative)';
  $('res-rocof').textContent = S.rocof.toFixed(2) + ' Hz/s (protection ~1 Hz/s)';
  ui.results.style.display = 'block';
}

// ---------- loop ----------
const clock = new THREE.Clock();
function loop() {
  const dtReal = Math.min(clock.getDelta(), 0.05);
  tickSequence(dtReal);
  // camera
  if (pov === 'moon') {
    camera.position.set(0, 0, camS.dist);
    camera.lookAt(0, 0, 0);
  } else if (pov === 'iss') {
    const a = performance.now() * 0.00012;
    camera.position.set(Math.cos(a) * camS.dist, 8, Math.sin(a) * camS.dist);
    camera.lookAt(Math.cos(a + 0.35) * R, -6, Math.sin(a + 0.35) * R);
  } else {
    camera.position.set(
      camS.dist * Math.sin(camS.phi) * Math.cos(camS.theta),
      camS.dist * Math.cos(camS.phi),
      camS.dist * Math.sin(camS.phi) * Math.sin(camS.theta)
    );
    camera.lookAt(0, 0, 0);
  }
  // HUD
  ui.time.textContent = (S.phase === 'idle' ? '-' : S.t.toFixed(2) + ' s');
  ui.lights.textContent = Math.round((1 - S.offFrac) * 100) + '%';
  const fPct = THREE.MathUtils.clamp((S.freq - 49.5) / 2 * 100, 0, 100);
  ui.fill.style.width = fPct.toFixed(0) + '%';
  ui.fill.classList.toggle('hot', Math.abs(S.freq - F0) > 0.5);
  ui.fval.textContent = S.freq.toFixed(2) + ' Hz' + (S.tripped ? ' - relays tripped (authored simplification)' : (S.phase === 'idle' ? ' - stable' : ''));
  renderer.render(scene, camera);
  requestAnimationFrame(loop);
}
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
setPov('orbit');
loop();
