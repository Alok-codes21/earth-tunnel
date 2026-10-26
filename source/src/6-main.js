import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { R_EARTH, layerAt, EARTH_MASS_MODEL } from './prem.js';
import { tunnelGeometry, step, run, accel } from './sim.js';

const $ = (id) => document.getElementById(id);
const U = 1e6; // 1 scene unit = 1000 km
const tv = (p) => new THREE.Vector3(p[0] / U, p[2] / U, -p[1] / U);
const RE = R_EARTH / U;

// ---------- state ----------
const LEVELS = [
  { name: '1. The Drop (vacuum)', lat: 28.6, az: 0, arc: 180, p: -9, cda: 0.7, v0: 0, rot: false, uni: false,
    goal: 'Drop through the centre in a perfect vacuum. Where does the PREM Earth let you out, and how long does it take?' },
  { name: '2. Textbook vs real Earth', lat: 28.6, az: 0, arc: 180, p: -9, cda: 0.7, v0: 0, rot: false, uni: true,
    goal: 'Same drop with a uniform-density Earth (the textbook 42 min). Then untick it and compare: the dense core makes the real fall quicker.' },
  { name: '3. Spinning Earth', lat: 28.6, az: 0, arc: 180, p: -9, cda: 0.7, v0: 0, rot: true, uni: false,
    goal: 'Turn Earth rotation on. Off the poles, Coriolis pushes you sideways into the wall. Watch the wall push meter.' },
  { name: '4. Air in the shaft', lat: 28.6, az: 0, arc: 180, p: -6, cda: 0.1, v0: 0, rot: false, uni: false,
    goal: 'Air drag steals energy. Pick a shaft vacuum and a launch speed so the capsule arrives at the far end slow enough (under 20 m/s) to grab the ledge.' },
  { name: '5. Shortcut chord', lat: 28.6, az: 60, arc: 90, p: -9, cda: 0.7, v0: 0, rot: false, uni: false,
    goal: 'A tunnel that does not pass through the centre. With uniform density every chord takes the same time. In the real Earth it does not. Compare.' },
];
const opt = { lvl: 0, lat: 28.6, az: 0, arc: 180, p: -9, cda: 0.7, v0: 0, rot: false, uni: false, ts: 50 };
let geo = null;
let st = { s: 0, v: 0, t: 0 };
let status = 'idle'; // idle | running | done
let viewFP = false;
let predicted = null;
let hmax = 0, wallMax = 0;

// ---------- three setup ----------
const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.localClippingEnabled = true;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x02030a);
const camera = new THREE.PerspectiveCamera(45, 1, 0.0005, 400);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.minDistance = RE * 1.15; controls.maxDistance = 90;

// stars
{
  const n = 2500, pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const v = new THREE.Vector3().randomDirection().multiplyScalar(150 + Math.random() * 40);
    pos.set([v.x, v.y, v.z], i * 3);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  scene.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 0.35, sizeAttenuation: true, transparent: true, opacity: 0.8 })));
}
const sun = new THREE.DirectionalLight(0xfff2dd, 3.2); scene.add(sun);
scene.add(new THREE.AmbientLight(0x6a7aa8, 0.9));

const earthGroup = new THREE.Group(); scene.add(earthGroup);
const clipPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
const tex = new THREE.TextureLoader().load('earth.jpg'); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
const earth = new THREE.Mesh(new THREE.SphereGeometry(RE, 96, 64),
  new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9, metalness: 0, clippingPlanes: [clipPlane], side: THREE.FrontSide }));
earth.rotation.y = -Math.PI / 2; // lon 0 faces +X (scene)
earthGroup.add(earth);
// inside of the shell (so the cut edge looks closed)
const shellInner = new THREE.Mesh(new THREE.SphereGeometry(RE * 0.999, 64, 48), new THREE.MeshBasicMaterial({ color: 0x1a0d08, side: THREE.BackSide, clippingPlanes: [clipPlane] }));
earthGroup.add(shellInner);
const atmo = new THREE.Mesh(new THREE.SphereGeometry(RE * 1.035, 64, 48), new THREE.ShaderMaterial({
  transparent: true, side: THREE.BackSide, blending: THREE.AdditiveBlending, depthWrite: false,
  uniforms: {}, vertexShader: 'varying vec3 n;varying vec3 vp;void main(){n=normalize(normalMatrix*normal);vec4 mv=modelViewMatrix*vec4(position,1.);vp=mv.xyz;gl_Position=projectionMatrix*mv;}',
  fragmentShader: 'varying vec3 n;varying vec3 vp;void main(){float i=pow(0.62-dot(n,normalize(-vp)),3.0);gl_FragColor=vec4(0.25,0.55,1.0,1.0)*i*0.3;}' }));
earthGroup.add(atmo);

// cross-section disc, PREM layer colours (boundaries from PREM)
const discMat = new THREE.ShaderMaterial({
  uniforms: { RE: { value: RE } }, side: THREE.DoubleSide,
  vertexShader: 'varying vec3 p;void main(){p=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
  fragmentShader: `varying vec3 p;uniform float RE;
  float h(vec2 x){return fract(sin(dot(x,vec2(12.9898,78.233)))*43758.5453);}
  float n(vec2 x){vec2 i=floor(x),f=fract(x);f=f*f*(3.-2.*f);return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y);}
  void main(){float r=length(p.xy)/RE*6371.;
   vec3 c; float e=0.;
   if(r<1221.5){c=vec3(1.0,0.93,0.62);} else if(r<3480.){c=mix(vec3(1.0,0.62,0.12),vec3(0.95,0.42,0.06),(r-1221.5)/2258.);}
   else if(r<5701.){c=mix(vec3(0.86,0.24,0.1),vec3(0.62,0.15,0.08),(r-3480.)/2221.);} else if(r<6346.6){c=vec3(0.42,0.2,0.12);} else {c=vec3(0.27,0.2,0.16);}
   float g=n(p.xy*18.)*0.5+n(p.xy*47.)*0.25; c*=0.82+0.35*g;
   float b=0.;
   float bs[5]=float[5](1221.5,3480.,5701.,6346.6,6371.);
   for(int i=0;i<5;i++){b=max(b,1.-smoothstep(0.,14.,abs(r-bs[i])));}
   c=mix(c,vec3(1.),b*0.55);
   gl_FragColor=vec4(c,1.);}`,
});
const disc = new THREE.Mesh(new THREE.CircleGeometry(RE, 192), discMat); earthGroup.add(disc);

// tunnel, tube interior shader (layer colour + stripes along s)
let tunnelMesh = null, tunnelCore = null, capsule = null, trail = null, markers = [];
const capsuleGroup = new THREE.Group(); scene.add(capsuleGroup);
{
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.07, 24, 16), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  const glow = new THREE.Mesh(new THREE.SphereGeometry(0.16, 24, 16), new THREE.MeshBasicMaterial({ color: 0x66ddff, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }));
  capsuleGroup.add(cap, glow);
}
const mkTunnelMat = () => new THREE.ShaderMaterial({
  side: THREE.BackSide, uniforms: { RE: { value: RE }, tNow: { value: 0 }, uDir: { value: new THREE.Vector3(0,1,0) } },
  vertexShader: 'varying vec3 wp;void main(){vec4 w=modelMatrix*vec4(position,1.);wp=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}',
  fragmentShader: `varying vec3 wp;uniform float RE;uniform vec3 uDir;
  vec3 lc(float r){ if(r<1221.5)return vec3(1.,.93,.62); if(r<3480.)return vec3(1.,.55,.1); if(r<5701.)return vec3(.9,.25,.1); if(r<6346.6)return vec3(.5,.24,.14); return vec3(.4,.34,.3);}
  void main(){float r=length(wp)/RE*6371.; vec3 c=lc(r);
   float st=0.5+0.5*sin(dot(wp,uDir)*90.); c*=0.55+0.6*st; gl_FragColor=vec4(c,1.);}`,
});
function buildTunnel() {
  [tunnelMesh, tunnelCore, trail, ...markers].forEach((o) => o && scene.remove(o));
  markers = [];
  const a = tv(geo.P1), b = tv(geo.P2);
  const len = a.distanceTo(b);
  const tube = new THREE.CylinderGeometry(0.035, 0.035, len, 20, 1, true);
  tunnelMesh = new THREE.Mesh(tube, mkTunnelMat());
  tunnelMesh.position.copy(a.clone().add(b).multiplyScalar(0.5));
  tunnelMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  scene.add(tunnelMesh);
  tunnelCore = new THREE.Line(new THREE.BufferGeometry().setFromPoints([a, b]), new THREE.LineBasicMaterial({ color: 0x66ddff }));
  scene.add(tunnelCore);
  for (const [p, col] of [[a, 0x4dff9d], [b, 0xff5d73]]) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.05, 16, 12), new THREE.MeshBasicMaterial({ color: col }));
    m.position.copy(p); scene.add(m); markers.push(m);
  }
  trail = new THREE.Line(new THREE.BufferGeometry().setFromPoints([a, a]), new THREE.LineBasicMaterial({ color: 0xffd38a }));
  scene.add(trail);
  // cut plane through the tunnel and Earth's centre
  const u = new THREE.Vector3(...[geo.u[0], geo.u[2], -geo.u[1]]);
  const p1 = a.clone().normalize();
  let nrm = new THREE.Vector3().crossVectors(p1, u);
  if (nrm.length() < 1e-4) nrm = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), u);
  if (nrm.length() < 1e-4) nrm = new THREE.Vector3(1, 0, 0);
  nrm.normalize();
  clipPlane.normal.copy(nrm.clone().negate()); // keep the half with dot(p,n) <= 0
  clipPlane.constant = 0;
  disc.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), nrm);
  geo.n = nrm; geo.uT = u; geo.aT = a;
  tunnelMesh.material.uniforms.uDir.value.copy(u);
  // sun direction fixed relative to the view side
  sun.position.copy(nrm.clone().multiplyScalar(-6).add(new THREE.Vector3(9, 4, 3)));
  resetCamera();
}
function resetCamera() {
  const n = geo.n;
  const side=new THREE.Vector3().crossVectors(n,new THREE.Vector3(0,1,0)).normalize();
  if(side.length()<0.1)side.set(1,0,0);
  const k = Math.max(1, 0.9 / (innerWidth / innerHeight));
  camera.position.copy(n.clone().multiplyScalar(15).add(side.multiplyScalar(11)).add(new THREE.Vector3(0,5,0)).multiplyScalar(k));
  camera.up.set(0, 1, 0);
  controls.target.set(0, 0, 0);
  controls.update();
}

// ---------- UI ----------
function fmtT(t) { const m = Math.floor(t / 60), s = Math.floor(t % 60); return `${m}:${String(s).padStart(2, '0')}`; }
function applyLevel(i) {
  const L = LEVELS[i]; opt.lvl = i;
  for (const k of ['lat', 'az', 'arc', 'p', 'cda', 'v0', 'rot', 'uni']) opt[k] = L[k];
  $('goal').textContent = L.goal;
  [...$('levels').children].forEach((b, j) => b.classList.toggle('on', j === i));
  syncUI(); resetRun();
}
function syncUI() {
  $('lat').value = opt.lat; $('az').value = opt.az; $('arc').value = opt.arc; $('p').value = opt.p; $('cda').value = opt.cda; $('v0').value = opt.v0;
  $('rot').checked = opt.rot; $('uni').checked = opt.uni; $('ts').value = Math.log10(opt.ts) ;
  labels();
}
const pAtm = () => Math.pow(10, opt.p);
function labels() {
  $('v-lat').textContent = `${opt.lat.toFixed(1)}°`;
  $('v-az').textContent = `${opt.az}°`;
  $('v-arc').textContent = `${opt.arc}° (${(2 * RE * Math.sin((opt.arc * Math.PI) / 360) * 1000).toFixed(0)} km)`;
  $('v-p').textContent = opt.p <= -9 ? 'near perfect vacuum' : `${pAtm().toExponential(0)} atm`;
  $('v-cda').textContent = `${opt.cda.toFixed(2)} m²`;
  $('v-v0').textContent = `${opt.v0} m/s`;
  $('v-ts').textContent = `${opt.ts.toFixed(0)}x`;
}
function hook(id, key, conv = (x) => x) {
  $(id).addEventListener('input', () => { opt[key] = conv(parseFloat($(id).value)); labels(); if (status !== 'running') resetRun(); });
}
hook('lat', 'lat'); hook('az', 'az'); hook('arc', 'arc'); hook('p', 'p'); hook('cda', 'cda'); hook('v0', 'v0');
$('rot').addEventListener('change', () => { opt.rot = $('rot').checked; resetRun(); });
$('uni').addEventListener('change', () => { opt.uni = $('uni').checked; resetRun(); });
$('ts').addEventListener('input', () => { opt.ts = Math.pow(10, parseFloat($('ts').value)); labels(); });
LEVELS.forEach((L, i) => { const b = document.createElement('button'); b.textContent = L.name; b.onclick = () => applyLevel(i); $('levels').appendChild(b); });
$('go').onclick = () => { if (status === 'done') resetRun(); startRun(); };
$('reset').onclick = () => resetRun();
function toggleView() { viewFP = !viewFP; $('view').textContent = `View: ${viewFP ? 'Inside' : 'Outside'} (V)`; earthGroup.visible = !viewFP; scene.fog = viewFP ? new THREE.FogExp2(0x02030a, 6) : null; if (!viewFP) resetCamera(); }
$('view').onclick = toggleView;
addEventListener('keydown', (e) => { if (e.key === 'v' || e.key === 'V') toggleView(); if (e.key === ' ') { e.preventDefault(); $('go').click(); } });

function simOpts() {
  return { uniform: opt.uni, rotation: opt.rot, rho: 1.225 * pAtm() * (opt.p <= -9 ? 0 : 1), cdaOverM: opt.cda / 100 };
}
function resetRun() {
  status = 'idle'; st = { s: 0, v: opt.v0, t: 0 }; hmax = 0; wallMax = 0;
  geo = tunnelGeometry(opt.lat, opt.az, opt.arc);
  buildTunnel();
  $('result').classList.add('hidden');
  $('go').textContent = 'Drop';
  readouts(0);
  placeCapsule();
}
function startRun() { if (status === 'idle') { acc = 0; status = 'running'; $('go').textContent = 'Running…'; } }
const CATCH_SPEED = 20, CATCH_M = 100;
function finish(o) {
  status = 'done'; $('go').textContent = 'Again';
  let title, main = '', more = '';
  const t = fmtT(st.t);
  if (o.kind === 'catch') {
    title = 'Ledge grabbed (game rule)';
    main = o.turned ? `Time ${t} - stopped ${(o.short).toFixed(1)} m before the end - peak ${(o.vmax / 1000).toFixed(2)} km/s` : `Time ${t} - arrival ${Math.abs(st.v).toFixed(1)} m/s - peak ${(o.vmax / 1000).toFixed(2)} km/s`;
    more = `The ledge is a game rule (arrive under ${CATCH_SPEED} m/s, or turn around within ${CATCH_M} m of the end). The physics only gives arrival speed and time.`;
  } else if (o.kind === 'ejected') {
    const h = (st.v * st.v) / (2 * 9.82) / 1000;
    title = 'Shot out of the far end';
    main = `Time ${t} - exit speed ${(st.v / 1000).toFixed(2)} km/s`;
    more = `In vacuum that would carry you about ${h.toFixed(0)} km up (constant-g estimate). Too fast for the ledge rule (limit ${CATCH_SPEED} m/s).`;
  } else {
    title = 'Fell short of the exit';
    main = `Time ${t} - ${(o.short / 1000).toFixed(1)} km short`;
    more = 'Drag used up the energy. Lower the pressure, streamline the capsule, or launch faster.';
  }
  if (opt.rot) more += ` Peak sideways wall push (Coriolis + gravity): ${wallMax.toFixed(2)} N per kg.`;
  more += opt.uni ? ' Model: uniform density Earth (textbook).' : ' Model: PREM layered Earth.';
  more += ' Result is a model output, not a measurement. No heat or rock pressure modelled.';
  const R = $('result'); R.innerHTML = `<h4>${title}</h4><div>${main}</div><details><summary>Model and rules</summary><div>${more}</div></details>`; R.classList.remove('hidden');
}
function readouts() {
  const r = Math.hypot(geo.P1[0] + st.s * geo.u[0], geo.P1[1] + st.s * geo.u[1], geo.P1[2] + st.s * geo.u[2]);
  $('r-time').textContent = fmtT(st.t);
  $('r-depth').textContent = `${((R_EARTH - r) / 1000).toFixed(0)} km`;
  $('r-speed').textContent = `${Math.abs(st.v).toFixed(0)} m/s`;
  $('r-layer').textContent = layerAt(r / 1000).name;
}

function placeCapsule() {
  const p = [geo.P1[0] + st.s * geo.u[0], geo.P1[1] + st.s * geo.u[1], geo.P1[2] + st.s * geo.u[2]];
  const v = tv(p);
  capsuleGroup.position.copy(v);
  const pts = [geo.aT, v];
  trail.geometry.setFromPoints(pts);
  if (viewFP) {
    const dir = st.v >= 0 || status === 'idle' ? geo.uT : geo.uT.clone().negate();
    camera.position.copy(v);
    camera.up.copy(geo.n);
    camera.lookAt(v.clone().add(dir));
    capsuleGroup.visible = false;
  } else capsuleGroup.visible = true;
}
const A = { a: 0 };
let last = performance.now();
const FIXED_DT = 0.1; // s; fixed physics step, independent of frame rate
let acc = 0;
function frame(now) {
  const dtReal = Math.min((now - last) / 1000, 0.05); last = now;
  if (status === 'running') {
    acc += dtReal * opt.ts;
    let vmax = 0, n = 0;
    while (acc >= FIXED_DT && status === 'running' && n++ < 20000) {
      acc -= FIXED_DT;
      const prev = { ...st };
      step(geo, st, FIXED_DT, simOpts());
      vmax = Math.max(vmax, Math.abs(st.v)); hmax = Math.max(hmax, vmax);
      if (st.s >= geo.L) {
        const f = (geo.L - prev.s) / (st.s - prev.s); st.s = geo.L; st.v = prev.v + f * (st.v - prev.v); st.t = prev.t + f * FIXED_DT;
        finish({ kind: Math.abs(st.v) <= CATCH_SPEED ? 'catch' : 'ejected', vmax: hmax }); break;
      }
      if (st.v < 0 && prev.v >= 0 && st.t > 1) {
        // interpolate the turning point (v = 0) so the reported values do not depend on step size
        const f = prev.v / (prev.v - st.v); st.s = prev.s + f * (st.s - prev.s); st.v = 0; st.t = prev.t + f * FIXED_DT;
        const sh = geo.L - st.s;
        finish({ kind: sh <= CATCH_M ? 'catch' : 'short', short: sh, vmax: hmax, turned: true }); break;
      }
    }
    const a = accel(geo, st.s, st.v, simOpts());
    wallMax = Math.max(wallMax, a.wall);
    $('r-g').textContent = `${a.g.toFixed(2)} m/s²`;
    $('r-wall').textContent = `${a.wall.toFixed(3)} N/kg`;
    readouts();
  }
  placeCapsule();
  if (!viewFP) controls.update();
  tunnelMesh.material.uniforms.tNow.value = now / 1000;
  resize();
  { const w = innerWidth, h = innerHeight; if (w < 800 && !viewFP) camera.setViewOffset(w, h, 0, h * 0.16, w, h); else camera.clearViewOffset(); }
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
function resize() {
  const w = innerWidth, h = innerHeight;
  if (canvas.width !== Math.floor(w * renderer.getPixelRatio()) || canvas.height !== Math.floor(h * renderer.getPixelRatio())) {
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.fov = viewFP ? 80 : 45;
    camera.updateProjectionMatrix();
  }
}
applyLevel(0);
requestAnimationFrame(frame);
window.__game = { opt, get st() { return st; }, get status() { return status; }, startRun, toggleView, applyLevel };
