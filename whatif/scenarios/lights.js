import { THREE, scene, camera, buildEarth } from '../engine.js';

const F0 = 50, AVG_GEN_GW = 3300; // ~29,000 TWh/yr world generation
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
function gauss() { return (Math.random() + Math.random() + Math.random()) / 1.5 - 1; }

export default {
  id: 'lights',
  title: 'WORLD LIGHTS OFF',
  subtitle: 'Everyone switches their lights off at the same second - what does the grid feel?',
  view: 'orbit',
  actionWord: 'LIGHTS OFF',
  meterLabel: 'Grid frequency (swing model)',
  settings: { share: 15, inertia: 4, spread: 2 },
  controls: [
    { id: 'share', label: 'Lighting share of load', min: 5, max: 30, step: 1, value: 15, fmt: v => v + '%' },
    { id: 'inertia', label: 'Grid inertia', min: 2, max: 8, step: 0.5, value: 4, fmt: v => v + ' s' },
    { id: 'spread', label: 'Switch-off spread', min: 0, max: 10, step: 0.5, value: 2, fmt: v => v === 0 ? 'perfect sync' : v + ' s' },
  ],
  note: 'City lights on the night side fade out as the switch-off spreads. The grid suddenly has surplus generation, so its frequency rises - watch the meter. Relay tripping past 50.8 Hz is an authored simplification of real protection schemes.',
  whatnot: 'no permanent blackout from this alone, no exploding power plants. Real grids ride through demand drops; frequency control brings it back.',
  notes: ['Illustrative swing-equation model: df/dt = f0·ΔP / (2·H·S). World average generation ~3,300 GW (~29,000 TWh/yr, IEA order of magnitude). Lighting share of electricity demand varies by source; the slider exposes the assumption. Relay behaviour past +0.8 Hz is simplified, not a specific grid code.'],
  setup() {
    scene.background = new THREE.Color(0x05070d);
    camera.near = 0.5; camera.far = 100000; camera.updateProjectionMatrix();
    const earth = buildEarth();
    const { R, SUN_DIR, ll2v } = earth;
    // stars
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
    const sun = new THREE.DirectionalLight(0xfff4e0, 2.2);
    sun.position.copy(SUN_DIR).multiplyScalar(1000);
    scene.add(sun, new THREE.AmbientLight(0x101a2a, 0.35));
    // city lights
    const LIGHTS = [];
    for (const [lat, lon, w] of CLUSTERS) {
      const count = w * 45, sigma = 1.2 + w * 0.18;
      for (let i = 0; i < count; i++) {
        const v = ll2v(lat + gauss() * sigma, lon + gauss() * sigma, R * 1.004);
        if (v.clone().normalize().dot(SUN_DIR) > -0.02) continue;
        LIGHTS.push({ v, b: (0.22 + Math.random() * 0.26) * (3 / (2 + w)), off: 0 });
      }
    }
    for (let i = 0; i < 2500; i++) {
      const v = new THREE.Vector3().randomDirection().multiplyScalar(R * 1.003);
      if (v.clone().normalize().dot(SUN_DIR) > -0.02) continue;
      LIGHTS.push({ v, b: 0.05 + Math.random() * 0.12, off: 0 });
    }
    const lGeo = new THREE.BufferGeometry();
    const pos = new Float32Array(LIGHTS.length * 3), col = new Float32Array(LIGHTS.length * 3);
    LIGHTS.forEach((L, i) => {
      pos.set([L.v.x, L.v.y, L.v.z], i * 3);
      const warm = new THREE.Color(0xffc37a).multiplyScalar(L.b);
      col.set([warm.r, warm.g, warm.b], i * 3);
    });
    lGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    lGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const lightPoints = new THREE.Points(lGeo, new THREE.PointsMaterial({ size: 0.6, vertexColors: true, sizeAttenuation: true, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }));
    earth.group.add(lightPoints);
    return { earth, LIGHTS, lGeo, t: 0, absT: 0, freq: F0, offFrac: 0, tripped: false, tripAbs: 0, peak: F0, rocof: 0, done: false };
  },
  onReset(ctx) {
    ctx.t = 0; ctx.absT = 0; ctx.freq = F0; ctx.offFrac = 0; ctx.tripped = false; ctx.peak = F0; ctx.rocof = 0; ctx.done = false; ctx.allOff = false;
    ctx.LIGHTS.forEach((L, i) => { L.off = 0; setB(ctx, i, 1); });
    ctx.lGeo.attributes.color.needsUpdate = true;
    ctx.ui.setMeter('Grid frequency (swing model)', F0.toFixed(2) + ' Hz - stable', 0.25, false);
    ctx.ui.setStat('Lights on', '100%');
    ctx.ui.setTime('Time', '-');
  },
  onAction(ctx) {
    ctx.LIGHTS.forEach(L => L.off = Math.random() * Math.max(ctx.settings.spread, 0.2));
    ctx.audio.beep(320, ctx.audio.now(), 0.4, 0.5);
    ctx.t = 0; ctx.done = false;
  },
  tick(ctx, dt) {
    const s = ctx.settings;
    ctx.t += dt; ctx.absT += dt;
    ctx.ui.setTime('Time', ctx.t.toFixed(1) + ' s');
    let offCount = 0;
    if (!ctx.allOff) {
      ctx.LIGHTS.forEach((L, i) => {
        const k = THREE.MathUtils.clamp((ctx.t - L.off) / 0.5, 0, 1);
        if (k > 0 && k <= 1) setB(ctx, i, 1 - k);
        if (k >= 1) offCount++;
      });
      ctx.lGeo.attributes.color.needsUpdate = true;
      ctx.offFrac = offCount / ctx.LIGHTS.length;
      if (offCount >= ctx.LIGHTS.length) ctx.allOff = true;
    } else ctx.offFrac = 1;
    ctx.ui.setStat('Lights on', Math.round((1 - ctx.offFrac) * 100) + '%');
    const shedGW = AVG_GEN_GW * s.share / 100;
    const surplus = shedGW * ctx.offFrac;
    let dp = surplus;
    if (ctx.tripped) dp = surplus - shedGW * 0.95 * Math.min(Math.max((ctx.absT - ctx.tripAbs) / 4, 0), 1);
    const dfdt = F0 * dp / (2 * s.inertia * AVG_GEN_GW);
    ctx.freq += dfdt * dt;
    ctx.rocof = Math.max(ctx.rocof, Math.abs(dfdt));
    ctx.peak = Math.max(ctx.peak, ctx.freq);
    if (!ctx.tripped && ctx.freq >= 50.8) {
      ctx.tripped = true; ctx.tripAbs = ctx.absT;
      ctx.audio.beep(180, ctx.audio.now(), 0.5, 0.35);
    }
    if (ctx.tripped) ctx.freq += (50.1 - ctx.freq) * 0.35 * dt;
    const fPct = THREE.MathUtils.clamp((ctx.freq - 49.5) / 2, 0, 1);
    ctx.ui.setMeter(undefined, ctx.freq.toFixed(2) + ' Hz' + (ctx.tripped ? ' - relays tripping (simplified)' : ''), fPct, Math.abs(ctx.freq - F0) > 0.5);
    if (ctx.allOff && ctx.t > 10 + s.spread && !ctx.done) {
      ctx.done = true;
      const shed = AVG_GEN_GW * s.share / 100;
      ctx.finish([
        ['Load shed', '~' + Math.round(shed) + ' GW (' + s.share + '% of ~3,300 GW average)'],
        ['Energy saved', '~' + Math.round(shed) + ' GWh per hour'],
        ['CO2 avoided (rough)', '~' + Math.round(shed * 0.5) + ' thousand tonnes/h (grid-average intensity)'],
        ['Peak grid frequency', ctx.peak.toFixed(2) + ' Hz (swing model, illustrative)'],
        ['Max rate of change', ctx.rocof.toFixed(2) + ' Hz/s (protection typically acts near 1 Hz/s)'],
      ], ['Aftermath: frequency settling back toward 50.1 Hz is the authored damping of the simplified model.']);
    }
  },
};
function setB(ctx, i, k) {
  const L = ctx.LIGHTS[i];
  const warm = new THREE.Color(0xffc37a).multiplyScalar(L.b * k);
  ctx.lGeo.attributes.color.setXYZ(i, warm.r, warm.g, warm.b);
}
