import { THREE, scene, buildSaltFlat, buildCrowd, buildAgents, buildPlayer, resetAgent, tickAgent, addGroundFx, makeRain } from '../engine.js';

export default {
  id: 'umbrellas',
  title: '8 BILLION UMBRELLAS',
  subtitle: 'It starts raining and everyone on Earth opens an umbrella at once.',
  view: 'ground',
  actionWord: 'OPEN',
  meterLabel: 'Umbrellas open',
  settings: { spread: 3, rain: 25 },
  controls: [
    { id: 'spread', label: 'Opening spread', min: 0, max: 8, step: 0.5, value: 3, fmt: v => v === 0 ? 'perfect sync' : v + ' s' },
    { id: 'rain', label: 'Rain rate', min: 5, max: 80, step: 5, value: 25, fmt: v => v + ' mm/h' },
  ],
  note: 'It is already raining. When the countdown ends, every umbrella blooms open within the spread window - watch the canopy wave ripple out and the ground shade over. The rain itself does not stop.',
  whatnot: 'the rain does not stop, the weather does not change. Umbrellas only redirect the last two metres of falling water.',
  notes: ['Assumptions: canopy 0.8 m² per umbrella (typical hand umbrella), canopies treated as non-overlapping - overlap is ignored, so the interception figure is the simple sum over all umbrellas, not a physical total for a dense crowd. Uniform rain rate over the crowd area. Intercepted water runs off the canopies and still reaches the ground nearby.'],
  setup(api) {
    buildSaltFlat({});
    addGroundFx();
    const crowdPack = buildCrowd({ count: api.tierCount });
    const agents = buildAgents(48);
    const player = buildPlayer();
    const rain = makeRain(1200, 260);
    rain.mesh.visible = true;
    // umbrella canopies: instanced cones over every crowd member
    const n = crowdPack.crowd.count;
    const geo = new THREE.ConeGeometry(0.55, 0.22, 7);
    const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    const fx = { uT: { value: -1000 }, uSpread: { value: 3 } };
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, fx);
      sh.vertexShader = ('attribute float aJit;\nuniform float uT;\nuniform float uSpread;\n' + sh.vertexShader)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
{ float k = clamp((uT - aJit * uSpread) / 0.35, 0.0, 1.0); k = k * k * (3.0 - 2.0 * k); transformed *= k; }`);
    };
    const canopy = new THREE.InstancedMesh(geo, mat, n);
    const jit = new Float32Array(n);
    const m = new THREE.Matrix4(), col = new THREE.Color();
    const UCOLORS = [0xc76b1d, 0x2e5d8c, 0x8c2e4a, 0x2e8c5d, 0x6b3fa0, 0xb8a11a];
    for (let i = 0; i < n; i++) {
      jit[i] = Math.random();
      m.makeRotationY(Math.random() * Math.PI * 2);
      m.setPosition(crowdPack.base[i * 3], 1.92, crowdPack.base[i * 3 + 2]);
      canopy.setMatrixAt(i, m);
      col.setHex(UCOLORS[(Math.random() * UCOLORS.length) | 0]);
      canopy.setColorAt(i, col);
    }
    geo.setAttribute('aJit', new THREE.InstancedBufferAttribute(jit, 1));
    scene.add(canopy);
    // shade disc (ground tint appears as canopies open)
    const shade = new THREE.Mesh(new THREE.CircleGeometry(240, 40), new THREE.MeshBasicMaterial({ color: 0x4a4640, transparent: true, opacity: 0, depthWrite: false }));
    shade.rotation.x = -Math.PI / 2; shade.position.y = 0.05;
    scene.add(shade);
    return { player, crowdPack, agents, rain, canopy, canopyFx: fx, shade, simT: 0, done: false };
  },
  onReset(ctx) {
    ctx.simT = 0; ctx.done = false;
    ctx.canopyFx.uT.value = -1000;
    ctx.shade.material.opacity = 0;
    ctx.agents.forEach(resetAgent);
    ctx.ui.setMeter('Umbrellas open', '0%', 0, false);
    ctx.ui.setStat('Rain rate', ctx.settings.rain + ' mm/h');
    ctx.ui.setTime('Time', '-');
  },
  onAction(ctx) {
    ctx.canopyFx.uSpread.value = ctx.settings.spread;
    ctx.canopyFx.uT.value = 0;
    ctx.audio.noiseBurst(ctx.audio.now(), 0.3, { dur: 0.6, type: 'lowpass', freq: 900 });
    ctx.simT = 0;
  },
  tick(ctx, dt) {
    const s = ctx.settings, S = ctx.S;
    for (const a of ctx.agents) tickAgent(a, dt);
    ctx.rain.tick(dt, ctx.player.x, ctx.player.z);
    if (S.phase === 'action') {
      ctx.simT += dt;
      const t = ctx.simT;
      ctx.ui.setTime('Time', t.toFixed(1) + ' s');
      ctx.canopyFx.uT.value = t;
      const frac = s.spread === 0 ? (t > 0.35 ? 1 : Math.min(1, t / 0.35)) : THREE.MathUtils.clamp((t - 0.35) / s.spread, 0, 1);
      ctx.ui.setMeter(undefined, Math.round(frac * 100) + '%', frac, false);
      ctx.shade.material.opacity = 0.35 * frac;
      if (t > s.spread + 4 && !ctx.done) {
        ctx.done = true;
        const areaKm2 = 8e9 * 0.8 / 1e6;
        const litresMin = 8e9 * 0.8 * (s.rain / 1000) / 60 * 1000; // m³/min × 1000 = L/min
        ctx.finish([
          ['Umbrellas', '8 billion'],
          ['Shaded area', '~' + Math.round(areaKm2).toLocaleString('en-IN') + ' km² (0.8 m² each)'],
          ['Rain intercepted', '~' + (litresMin / 1e9).toFixed(1) + ' billion litres per minute at ' + s.rain + ' mm/h'],
          ['Effect on the rain', 'none - it runs off the canopies'],
        ], ['Aftermath: the rain keeps falling; the canopies stay open because it is still raining. The shade tint is an authored visualization of cover, not a lighting simulation.']);
      }
    }
  },
  onAftermath(ctx) { ctx.audio.startMurmur(0.03, 40); },
};
