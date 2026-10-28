import { THREE, scene, buildSaltFlat, buildCrowd, buildAgents, buildPlayer, resetAgent, tickAgent, addGroundFx } from '../engine.js';

export default {
  id: 'campfire',
  title: '8 BILLION CAMPFIRES',
  subtitle: 'Night falls and everyone on Earth lights a campfire at the same moment.',
  view: 'ground',
  actionWord: 'LIGHT FIRES',
  meterLabel: 'CO2 release rate',
  settings: { spread: 4, woodKg: 2 },
  controls: [
    { id: 'spread', label: 'Lighting spread', min: 0, max: 10, step: 1, value: 4, fmt: v => v === 0 ? 'perfect sync' : v + ' s' },
    { id: 'woodKg', label: 'Wood per fire', min: 1, max: 5, step: 0.5, value: 2, fmt: v => v.toFixed(1) + ' kg' },
  ],
  note: 'A wave of firelight races across the dark plain, smoke columns rise, and the horizon itself starts to glow orange. Then the numbers tell you what that means for the atmosphere.',
  whatnot: 'no runaway warming, no global smoke apocalypse. One evening of fires is a rounding error next to annual emissions - but the local air would be genuinely unpleasant.',
  notes: ['Assumptions: dry wood ~50% carbon, complete combustion to CO2 (real fires also emit CO, methane and particulates - so this underestimates pollution). Annual human CO2 ~37 Gt for comparison. Smoke rise is an authored visualization.'],
  setup(api) {
    buildSaltFlat({ night: true });
    addGroundFx();
    const crowdPack = buildCrowd({ count: api.tierCount });
    const agents = buildAgents(48);
    const player = buildPlayer();
    const n = crowdPack.crowd.count;
    // fire glow points
    const pos = new Float32Array(n * 3), jit = new Float32Array(n), seed = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = crowdPack.base[i * 3] + 0.5;
      pos[i * 3 + 1] = 0.25;
      pos[i * 3 + 2] = crowdPack.base[i * 3 + 2] + 0.5;
      jit[i] = Math.random(); seed[i] = Math.random() * 10;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aJit', new THREE.BufferAttribute(jit, 1));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    const fx = { uT: { value: -1000 }, uSpread: { value: 4 } };
    const pmat = new THREE.PointsMaterial({ color: 0xff9a3c, size: 1.6, sizeAttenuation: true, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false });
    pmat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, fx);
      sh.vertexShader = ('attribute float aJit;\nattribute float aSeed;\nuniform float uT;\nuniform float uSpread;\nvarying float vK;\n' + sh.vertexShader)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
{ float k = clamp((uT - aJit * uSpread) / 0.8, 0.0, 1.0); vK = k * (0.75 + 0.25 * sin(uT * 11.0 + aSeed * 40.0)); }`);
      sh.fragmentShader = ('varying float vK;\n' + sh.fragmentShader)
        .replace('#include <color_fragment>', '#include <color_fragment>\nif (vK <= 0.01) discard;\ndiffuseColor.a *= vK;');
    };
    const fires = new THREE.Points(g, pmat);
    fires.frustumCulled = false;
    scene.add(fires);
    // smoke columns
    const sN = Math.min(900, n), spos = new Float32Array(sN * 3);
    for (let i = 0; i < sN; i++) {
      const j = (Math.random() * n) | 0;
      spos[i * 3] = pos[j * 3]; spos[i * 3 + 1] = Math.random() * 30; spos[i * 3 + 2] = pos[j * 3 + 2];
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(spos, 3));
    const smoke = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0x555058, size: 4.5, transparent: true, opacity: 0, depthWrite: false }));
    smoke.frustumCulled = false;
    scene.add(smoke);
    // horizon glow
    const glow = new THREE.Mesh(new THREE.RingGeometry(400, 2800, 48), new THREE.MeshBasicMaterial({ color: 0xff7a26, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }));
    glow.rotation.x = -Math.PI / 2; glow.position.y = 3;
    scene.add(glow);
    const amb = new THREE.AmbientLight(0xff9a50, 0);
    scene.add(amb);
    return { player, crowdPack, agents, fires, fireFx: fx, smoke, glow, amb, simT: 0, done: false };
  },
  onReset(ctx) {
    ctx.simT = 0; ctx.done = false;
    ctx.fireFx.uT.value = -1000;
    ctx.smoke.material.opacity = 0;
    ctx.glow.material.opacity = 0;
    ctx.amb.intensity = 0;
    ctx.agents.forEach(resetAgent);
    ctx.ui.setMeter('CO2 release rate', '0 kg/s', 0, false);
    ctx.ui.setStat('Fires lit', '0%');
    ctx.ui.setTime('Time', '-');
  },
  onAction(ctx) {
    ctx.fireFx.uSpread.value = ctx.settings.spread;
    ctx.fireFx.uT.value = 0;
    ctx.audio.noiseBurst(ctx.audio.now(), 0.35, { dur: 0.8, type: 'lowpass', freq: 500 });
    ctx.fx.shakeCam(0.08);
    ctx.simT = 0;
  },
  tick(ctx, dt) {
    const s = ctx.settings, S = ctx.S;
    for (const a of ctx.agents) tickAgent(a, dt);
    if (S.phase === 'action' || S.phase === 'aftermath') {
      ctx.simT += dt;
      const t = ctx.simT;
      ctx.ui.setTime('Time', t.toFixed(1) + ' s');
      ctx.fireFx.uT.value = t;
      const frac = s.spread === 0 ? (t > 0 ? 1 : 0) : THREE.MathUtils.clamp(t / s.spread, 0, 1);
      ctx.ui.setStat('Fires lit', Math.round(frac * 100) + '%');
      // wood burns over ~2 hours: rate = total / 7200 s
      const kgS = 8e9 * s.woodKg / 7200 * frac;
      const co2S = kgS * 0.5 * 3.67;
      ctx.ui.setMeter(undefined, '≈ ' + (co2S / 1000).toFixed(1) + ' tonnes/s', Math.min(1, co2S / 5e6), false);
      ctx.smoke.material.opacity = 0.25 * frac;
      ctx.glow.material.opacity = 0.06 * frac;
      ctx.amb.intensity = 0.2 * frac;
      // smoke rises
      if (ctx.smoke.material.opacity > 0.01) {
        const a = ctx.smoke.geometry.attributes.position.array;
        for (let i = 0; i < a.length / 3; i++) {
          a[i * 3 + 1] += dt * 2.2;
          if (a[i * 3 + 1] > 60) a[i * 3 + 1] = 0.5;
        }
        ctx.smoke.geometry.attributes.position.needsUpdate = true;
      }
      if (t > s.spread + 6 && !ctx.done) {
        ctx.done = true;
        const wood = 8e9 * s.woodKg;
        const co2 = wood * 0.5 * 3.67;
        ctx.finish([
          ['Fires lit', '8 billion'],
          ['Wood burned (one evening)', '~' + (wood / 1e9).toFixed(0) + ' million tonnes'],
          ['CO2 released', '~' + (co2 / 1e9).toFixed(0) + ' million tonnes ≈ ' + (co2 / 37e12 * 100).toFixed(2) + '% of a year of human emissions'],
          ['Local air', 'heavy smoke for kilometres downwind - genuinely unpleasant'],
          ['Global climate effect', 'negligible for a single evening'],
        ], ['Aftermath: the fires keep burning low while the smoke spreads. Embers and fading glow are authored; the CO2 arithmetic is the estimate.']);
      }
    }
  },
  onAftermath(ctx) { ctx.audio.startMurmur(0.04, 50); },
};
