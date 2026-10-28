import { THREE, scene, buildSaltFlat, buildCrowd, buildAgents, buildPlayer, resetAgent, tickAgent, addGroundFx, buildMoon } from '../engine.js';

export default {
  id: 'flashlights',
  title: 'FLASHLIGHTS AT THE MOON',
  subtitle: 'Night. Everyone on Earth points their phone flashlight at the Moon.',
  view: 'ground',
  actionWord: 'LIGHTS UP',
  meterLabel: 'Total light output',
  settings: { spread: 2, lumens: 50 },
  controls: [
    { id: 'spread', label: 'Switch-on spread', min: 0, max: 6, step: 0.5, value: 2, fmt: v => v === 0 ? 'perfect sync' : v + ' s' },
    { id: 'lumens', label: 'Lumens per phone', min: 20, max: 120, step: 10, value: 50, fmt: v => v + ' lm' },
  ],
  note: 'When the countdown ends, 8 billion phone lights come on above the crowd and the plain itself starts to glow. Then look at the Moon - that is the honest part of the experiment.',
  whatnot: 'we do not claim anyone would see a brightening - the visual effect is not simulated; the numerical estimate is the honest output: 8 billion phones deliver ~2e-7 lux at the Moon in a simplified isotropic-source calculation, about 2 millionths of the ~0.1 lux the full Moon sends back. The comparison, not any visible change, is the point of the experiment.',
  notes: ['Phone flashlight ~50 lumens typical (20-120 range). Lux at the Moon ≈ total lumens ÷ (4π·d²) - a simplified isotropic-source calculation that ignores beaming - with d = 384,400 km, before atmospheric loss. A full moon gives ~0.1 lux on Earth - roughly 460,000x more than the return signal here.'],
  setup(api) {
    buildSaltFlat({ night: true });
    addGroundFx();
    const moon = buildMoon();
    const crowdPack = buildCrowd({ count: api.tierCount });
    const agents = buildAgents(48);
    const player = buildPlayer();
    const n = crowdPack.crowd.count;
    // phone glow points above heads
    const pos = new Float32Array(n * 3), jit = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = crowdPack.base[i * 3];
      pos[i * 3 + 1] = 1.9;
      pos[i * 3 + 2] = crowdPack.base[i * 3 + 2];
      jit[i] = Math.random();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aJit', new THREE.BufferAttribute(jit, 1));
    const fx = { uT: { value: -1000 }, uSpread: { value: 2 } };
    const pmat = new THREE.PointsMaterial({ color: 0xfff2cc, size: 0.12, sizeAttenuation: true, transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false });
    pmat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, fx);
      sh.vertexShader = ('attribute float aJit;\nuniform float uT;\nuniform float uSpread;\nvarying float vOn;\n' + sh.vertexShader)
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvOn = step(aJit * uSpread, uT) * step(uT, 9000.0);')
        .replace('#include <fog_vertex>', '#include <fog_vertex>\ngl_PointSize = max(gl_PointSize, 3.0);');
      sh.fragmentShader = ('varying float vOn;\n' + sh.fragmentShader)
        .replace('#include <color_fragment>', '#include <color_fragment>\nif (vOn < 0.5) discard;');
    };
    const glow = new THREE.Points(g, pmat);
    glow.frustumCulled = false;
    scene.add(glow);
    // ground glow layer
    const glowDisc = new THREE.Mesh(new THREE.CircleGeometry(260, 40), new THREE.MeshBasicMaterial({ color: 0xffe9b8, transparent: true, opacity: 0, depthWrite: false }));
    glowDisc.rotation.x = -Math.PI / 2; glowDisc.position.y = 0.08;
    scene.add(glowDisc);
    const amb = new THREE.AmbientLight(0xffe9b8, 0);
    scene.add(amb);
    return { player, crowdPack, agents, moon, glow, glowFx: fx, glowDisc, amb, simT: 0, done: false };
  },
  onReset(ctx) {
    ctx.simT = 0; ctx.done = false;
    ctx.glowFx.uT.value = -1000;
    ctx.glowDisc.material.opacity = 0;
    ctx.amb.intensity = 0;
    ctx.agents.forEach(resetAgent);
    ctx.ui.setMeter('Total light output', '0 lm', 0, false);
    ctx.ui.setStat('Lux at the Moon', '0');
    ctx.ui.setTime('Time', '-');
  },
  onAction(ctx) {
    ctx.glowFx.uSpread.value = ctx.settings.spread;
    ctx.glowFx.uT.value = 0;
    ctx.audio.noiseBurst(ctx.audio.now(), 0.2, { dur: 0.3, freq: 2400 });
    ctx.simT = 0;
  },
  tick(ctx, dt) {
    const s = ctx.settings, S = ctx.S;
    for (const a of ctx.agents) tickAgent(a, dt);
    if (S.phase === 'action') {
      ctx.simT += dt;
      const t = ctx.simT;
      ctx.ui.setTime('Time', t.toFixed(1) + ' s');
      ctx.glowFx.uT.value = t;
      const frac = s.spread === 0 ? (t > 0 ? 1 : 0) : THREE.MathUtils.clamp(t / s.spread, 0, 1);
      const totalLm = 8e9 * s.lumens * frac;
      ctx.ui.setMeter(undefined, '≈ ' + totalLm.toExponential(1) + ' lm', frac, false);
      const d = 384400e3;
      const lux = totalLm / (4 * Math.PI * d * d);
      ctx.ui.setStat('Lux at the Moon', lux.toExponential(1) + ' lx');
      ctx.glowDisc.material.opacity = 0.12 * frac;
      ctx.amb.intensity = 0.25 * frac;
      if (t > s.spread + 5 && !ctx.done) {
        ctx.done = true;
        const lm = 8e9 * s.lumens;
        const luxFull = lm / (4 * Math.PI * d * d);
        ctx.finish([
          ['Phones on', '8 billion'],
          ['Total output', '≈ ' + lm.toExponential(1) + ' lumens'],
          ['Light reaching the Moon', '≈ ' + luxFull.toExponential(1) + ' lux (before atmospheric loss)'],
          ['Comparison', 'a full moon lights Earth at ~0.1 lux - about ' + (Math.round(0.1 / luxFull / 10000) * 10000).toLocaleString('en-US') + 'x brighter than this simplified estimate'],
          ['Added light vs moonlight', '~2 millionths of the ~0.1 lux the full Moon reflects toward Earth'],
        ], ['Aftermath: the plain keeps glowing as long as the phones stay on. The Moon in the sky is unchanged - that non-change is the real result.']);
      }
    }
  },
  onAftermath(ctx) { ctx.audio.startMurmur(0.03, 40); },
};
