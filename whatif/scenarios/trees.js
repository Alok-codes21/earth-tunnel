import { THREE, scene, buildSaltFlat, buildCrowd, buildAgents, buildPlayer, resetAgent, tickAgent, addGroundFx } from '../engine.js';

export default {
  id: 'trees',
  title: '8 BILLION TREES',
  subtitle: 'Everyone on Earth plants one tree today. What does that add up to?',
  view: 'ground',
  actionWord: 'PLANT',
  meterLabel: 'CO2 absorbed (at maturity)',
  settings: { spread: 5, years: 10, kgPerYear: 10 },
  controls: [
    { id: 'spread', label: 'Planting spread', min: 0, max: 10, step: 1, value: 5, fmt: v => v === 0 ? 'all at once' : v + ' s' },
    { id: 'years', label: 'Fast-forward', min: 5, max: 30, step: 5, value: 10, fmt: v => v + ' years' },
    { id: 'kgPerYear', label: 'CO2 per tree per year', min: 5, max: 25, step: 5, value: 10, fmt: v => v + ' kg' },
  ],
  note: 'Saplings pop up across the plain with the planting wave. Then the years fast-forward: watch them grow to maturity while the CO2 counter runs. The green tint spreading over the ground is the canopy closing.',
  whatnot: 'this does not cancel climate change. 8 billion mature trees absorb on the order of 0.2% of annual human CO2 per year - helpful, not a fix.',
  notes: ['Assumptions: 4 m² per tree (dense planting), survival ignored, CO2 uptake 5-25 kg/tree/year at maturity (species-dependent). Annual human CO2 ~37 Gt. Growth fast-forward is an authored time-lapse; uptake figure is the estimate.'],
  setup(api) {
    buildSaltFlat({});
    addGroundFx();
    const crowdPack = buildCrowd({ count: api.tierCount });
    const agents = buildAgents(48);
    const player = buildPlayer();
    const n = crowdPack.crowd.count;
    const geo = new THREE.ConeGeometry(0.5, 1.6, 6);
    geo.translate(0, 0.8, 0);
    const mat = new THREE.MeshLambertMaterial({ color: 0x2e6b34 });
    const fx = { uPlant: { value: -1000 }, uSpread: { value: 5 }, uGrow: { value: 1 } };
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, fx);
      sh.vertexShader = ('attribute float aJit;\nuniform float uPlant;\nuniform float uSpread;\nuniform float uGrow;\n' + sh.vertexShader)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
{ float k = clamp((uPlant - aJit * uSpread) / 0.5, 0.0, 1.0); k = k * k * (3.0 - 2.0 * k); transformed *= k * uGrow; }`);
    };
    const trees = new THREE.InstancedMesh(geo, mat, n);
    const jit = new Float32Array(n);
    const m = new THREE.Matrix4(), col = new THREE.Color();
    for (let i = 0; i < n; i++) {
      jit[i] = Math.random();
      m.setPosition(crowdPack.base[i * 3] + 0.6, 0, crowdPack.base[i * 3 + 2] + 0.6);
      trees.setMatrixAt(i, m);
      col.setHSL(0.33 + Math.random() * 0.04, 0.5, 0.28 + Math.random() * 0.1);
      trees.setColorAt(i, col);
    }
    geo.setAttribute('aJit', new THREE.InstancedBufferAttribute(jit, 1));
    scene.add(trees);
    const green = new THREE.Mesh(new THREE.CircleGeometry(240, 40), new THREE.MeshBasicMaterial({ color: 0x3f7a3a, transparent: true, opacity: 0, depthWrite: false }));
    green.rotation.x = -Math.PI / 2; green.position.y = 0.06;
    scene.add(green);
    return { player, crowdPack, agents, trees, treeFx: fx, green, simT: 0, growT: -1, done: false, co2: 0 };
  },
  onReset(ctx) {
    ctx.simT = 0; ctx.growT = -1; ctx.done = false; ctx.co2 = 0;
    ctx.treeFx.uPlant.value = -1000; ctx.treeFx.uGrow.value = 1;
    ctx.green.material.opacity = 0;
    ctx.agents.forEach(resetAgent);
    ctx.ui.setMeter('CO2 absorbed (at maturity)', '0 tonnes/yr', 0, false);
    ctx.ui.setStat('Trees planted', '0%');
    ctx.ui.setTime('Time', '-');
  },
  onAction(ctx) {
    ctx.treeFx.uSpread.value = ctx.settings.spread;
    ctx.treeFx.uPlant.value = 0;
    ctx.audio.noiseBurst(ctx.audio.now(), 0.2, { dur: 0.5, type: 'lowpass', freq: 600 });
    ctx.simT = 0;
  },
  tick(ctx, dt) {
    const s = ctx.settings, S = ctx.S;
    for (const a of ctx.agents) tickAgent(a, dt);
    if (S.phase === 'action') {
      ctx.simT += dt;
      const t = ctx.simT;
      ctx.ui.setTime('Time', t.toFixed(1) + ' s');
      ctx.treeFx.uPlant.value = t;
      const frac = s.spread === 0 ? (t > 0.5 ? 1 : Math.min(1, t / 0.5)) : THREE.MathUtils.clamp(t / s.spread, 0, 1);
      ctx.ui.setStat('Trees planted', Math.round(frac * 100) + '%');
      ctx.ui.setMeter(undefined, '0 tonnes/yr (saplings)', frac, false);
      if (frac >= 1 && ctx.growT < 0) {
        ctx.growT = 0;
        ctx.audio.beep(660, ctx.audio.now(), 0.3, 0.12);
      }
      if (ctx.growT >= 0) {
        ctx.growT += dt;
        const k = THREE.MathUtils.clamp(ctx.growT / 6, 0, 1); // 6 s time-lapse
        ctx.treeFx.uGrow.value = 1 + k * 5; // sapling -> mature canopy
        ctx.green.material.opacity = 0.4 * k;
        const co2yr = 8e9 * s.kgPerYear / 1000 * k; // tonnes/yr
        ctx.co2 = co2yr;
        ctx.ui.setMeter(undefined, '≈ ' + (co2yr / 1e6).toFixed(0) + ' million tonnes/yr', k, false);
        ctx.ui.setTime('Time-lapse', 'year ' + Math.round(k * s.years));
      }
      if (ctx.growT > 6.5 && !ctx.done) {
        ctx.done = true;
        const co2yr = 8e9 * s.kgPerYear / 1000;
        ctx.finish([
          ['Trees planted', '8 billion'],
          ['Land needed', '~' + Math.round(8e9 * 4 / 1e6).toLocaleString('en-IN') + ' km² (4 m² each - bigger than Belgium)'],
          ['CO2 at maturity', '≈ ' + (co2yr / 1e6).toFixed(0) + ' million tonnes/yr ≈ ' + (co2yr / 37e9 * 100).toFixed(2) + '% of annual human CO2'],
          ['Years to get there', '~' + s.years + ' years of growth (shown as time-lapse)'],
          ['Verdict', 'real help, small fraction - not a climate fix on its own'],
        ], ['Aftermath: the mature stand stays growing on the plain. The time-lapse is authored; the area and uptake figures are the estimate.']);
      }
    }
  },
  onAftermath(ctx) { ctx.audio.startMurmur(0.03, 40); },
};
