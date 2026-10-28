import { THREE, scene, camera, buildEarth } from '../engine.js';

const CLUSTERS = [
  [28.6,77.2,9],[19.1,72.9,7],[12.97,77.6,4],[22.6,88.4,5],[23.8,90.4,6],[39.9,116.4,8],[31.2,121.5,8],[35.7,139.7,9],
  [37.6,127.0,7],[-6.2,106.8,6],[6.5,3.4,5],[30.0,31.2,5],[55.8,37.6,5],[51.5,-0.1,5],[48.9,2.4,5],
  [40.7,-74.0,8],[34.1,-118.2,5],[41.9,-87.6,5],[19.4,-99.1,6],[-23.6,-46.6,6],[-34.6,-58.4,4],[-33.9,151.2,3],[24.7,46.7,3]
];
function gauss() { return (Math.random() + Math.random() + Math.random()) / 1.5 - 1; }

export default {
  id: 'flash',
  title: 'FLASH FROM SPACE',
  subtitle: 'Everyone on Earth fires a camera flash at the sky at once - can space see it?',
  view: 'orbit',
  actionWord: 'FLASH',
  meterLabel: 'Flash energy released',
  settings: { joules: 4, spread: 3 },
  controls: [
    { id: 'joules', label: 'Joules per flash', min: 1, max: 10, step: 1, value: 4, fmt: v => v + ' J' },
    { id: 'spread', label: 'Flash spread', min: 0, max: 8, step: 1, value: 3, fmt: v => v === 0 ? 'perfect sync' : v + ' s' },
  ],
  note: 'Watch the night side of Earth. A wave of flashes sweeps the metro clusters. The brightness here is enhanced so the wave is visible - the results table gives the honest verdict on whether space could actually see it.',
  whatnot: 'Earth does not light up like a beacon and satellites are not blinded. Each flash is a few joules - city lights outshine the whole event by orders of magnitude.',
  notes: ['Phone flash ~4 J per pulse (order of magnitude). Total 8 billion flashes ≈ 32 GJ ≈ 9 MWh - the energy of ~7 lightning bolts, spread over the planet and several seconds. Scene brightness is enhanced; labelled as such.'],
  setup() {
    scene.background = new THREE.Color(0x05070d);
    camera.near = 0.5; camera.far = 100000; camera.updateProjectionMatrix();
    const earth = buildEarth();
    const { R, SUN_DIR, ll2v } = earth;
    { // stars
      const n = 2200, pos = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) pos.set(new THREE.Vector3().randomDirection().multiplyScalar(40000).toArray(), i * 3);
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      scene.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0xbdc8e0, size: 60, sizeAttenuation: true, transparent: true, opacity: 0.85, depthWrite: false })));
    }
    const sun = new THREE.DirectionalLight(0xfff4e0, 2.2);
    sun.position.copy(SUN_DIR).multiplyScalar(1000);
    scene.add(sun, new THREE.AmbientLight(0x101a2a, 0.35));
    // base city lights (dim, steady)
    const CITY = [];
    for (const [lat, lon, w] of CLUSTERS) {
      const count = w * 45, sigma = 1.2 + w * 0.18;
      for (let i = 0; i < count; i++) {
        const v = ll2v(lat + gauss() * sigma, lon + gauss() * sigma, R * 1.004);
        if (v.clone().normalize().dot(SUN_DIR) > -0.02) continue;
        CITY.push({ v, b: (0.22 + Math.random() * 0.26) * (3 / (2 + w)), flash: 0 });
      }
    }
    const lGeo = new THREE.BufferGeometry();
    const pos = new Float32Array(CITY.length * 3), col = new Float32Array(CITY.length * 3);
    CITY.forEach((L, i) => {
      pos.set([L.v.x, L.v.y, L.v.z], i * 3);
      const c = new THREE.Color(0xffc37a).multiplyScalar(L.b);
      col.set([c.r, c.g, c.b], i * 3);
    });
    lGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    lGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    scene.add(new THREE.Points(lGeo, new THREE.PointsMaterial({ size: 0.6, vertexColors: true, sizeAttenuation: true, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false })));
    // flash points (bright white, off until fired)
    const F = [];
    for (const [lat, lon, w] of CLUSTERS) {
      const count = w * 30, sigma = 1.4 + w * 0.2;
      for (let i = 0; i < count; i++) {
        const v = ll2v(lat + gauss() * sigma, lon + gauss() * sigma, R * 1.006);
        if (v.clone().normalize().dot(SUN_DIR) > -0.02) continue;
        F.push({ v, t: -1 });
      }
    }
    const fGeo = new THREE.BufferGeometry();
    const fpos = new Float32Array(F.length * 3), fcol = new Float32Array(F.length * 3);
    F.forEach((p, i) => fpos.set([p.v.x, p.v.y, p.v.z], i * 3));
    fGeo.setAttribute('position', new THREE.BufferAttribute(fpos, 3));
    fGeo.setAttribute('color', new THREE.BufferAttribute(fcol, 3));
    const flashes = new THREE.Points(fGeo, new THREE.PointsMaterial({ size: 1.1, vertexColors: true, sizeAttenuation: true, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }));
    flashes.frustumCulled = false;
    scene.add(flashes);
    return { earth, CITY, F, fGeo, simT: 0, done: false, fired: 0 };
  },
  onReset(ctx) {
    ctx.simT = 0; ctx.done = false; ctx.fired = 0;
    ctx.F.forEach(p => p.t = -1);
    const c = ctx.fGeo.attributes.color;
    for (let i = 0; i < c.count; i++) c.setXYZ(i, 0, 0, 0);
    c.needsUpdate = true;
    ctx.ui.setMeter('Flash energy released', '0 J', 0, false);
    ctx.ui.setStat('Flashes fired', '0%');
    ctx.ui.setTime('Time', '-');
  },
  onAction(ctx) {
    ctx.F.forEach(p => p.t = Math.random() * Math.max(ctx.settings.spread, 0.3));
    ctx.audio.noiseBurst(ctx.audio.now(), 0.2, { dur: 0.2, freq: 3000 });
    ctx.simT = 0;
  },
  tick(ctx, dt) {
    const s = ctx.settings, S = ctx.S;
    if (S.phase === 'action' || S.phase === 'aftermath') {
      ctx.simT += dt;
      const t = ctx.simT;
      ctx.ui.setTime('Time', t.toFixed(1) + ' s');
      const c = ctx.fGeo.attributes.color;
      let fired = 0;
      ctx.F.forEach((p, i) => {
        const dtF = t - p.t;
        if (p.t >= 0 && dtF > 0 && dtF < 0.6) {
          const k = Math.sin(Math.PI * dtF / 0.6);
          c.setXYZ(i, k * 3.2, k * 3.0, k * 2.8); // enhanced brightness, labelled
        } else if (p.t >= 0 && dtF >= 0.6) {
          c.setXYZ(i, 0, 0, 0);
          fired++;
        }
      });
      c.needsUpdate = true;
      const frac = ctx.F.length ? fired / ctx.F.length : 1;
      ctx.ui.setStat('Flashes fired', Math.round(frac * 100) + '%');
      const E = 8e9 * s.joules * frac;
      ctx.ui.setMeter(undefined, '≈ ' + (E / 3.6e9).toFixed(1) + ' MWh so far', frac, false);
      if (frac >= 1 && !ctx.done) {
        ctx.done = true;
        const E = 8e9 * s.joules;
        ctx.finish([
          ['Flashes', '8 billion'],
          ['Total light energy', '≈ ' + (E / 3.6e9).toFixed(0) + ' MWh ≈ ' + Math.round(E / 4.2e9) + ' lightning bolts of energy'],
          ['Duration', '~0.5 s each, spread over ' + Math.max(s.spread, 0.3).toFixed(1) + ' s'],
          ['Vs city lights', 'city lighting runs ~hundreds of GW continuously - flashes lose by ~1000x'],
          ['From low orbit?', 'flashes run ~1000x below the continuous city lighting they would compete with; the enhanced pulse you saw marks the locations'],
        ], ['Scene flash brightness is enhanced so the wave is visible; the table gives the physical estimate.']);
      }
    }
  },
};
