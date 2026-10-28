import { THREE, scene, buildSaltFlat, buildCrowd, buildAgents, buildPlayer, resetAgent, tickAgent, addGroundFx } from '../engine.js';

export default {
  id: 'ocean',
  title: 'EVERYONE INTO THE OCEAN',
  subtitle: 'All 8 billion people wade into the sea at once. Does the water level move?',
  view: 'ground',
  defaultPov: 'tp',
  actionWord: 'WADE IN',
  meterLabel: 'Sea level change',
  settings: { depth: 0.8, spread: 3 },
  controls: [
    { id: 'depth', label: 'Wading depth', min: 0.5, max: 1.5, step: 0.1, value: 0.8, fmt: v => v.toFixed(1) + ' m' },
    { id: 'spread', label: 'Entry spread', min: 0, max: 8, step: 1, value: 3, fmt: v => v === 0 ? 'perfect sync' : v + ' s' },
  ],
  note: 'The crowd runs into the water and splash rings spread across the surface. Displacement is real physics: people in water push the sea level up. The meter shows by how much.',
  whatnot: 'no tsunami, no coastal flooding anywhere. 8 billion people displace a lot of water, but the ocean is unimaginably bigger.',
  notes: ['Assumptions: submerged volume per person = depth fraction of a ~70 L body (depth 0.8 m ≈ half the body ≈ 35 L). Ocean surface area 3.62×10¹⁴ m². Splash rings are an authored visualization at the rendered shoreline.'],
  setup(api) {
    buildSaltFlat({});
    // ocean to the east (+x)
    const water = new THREE.Mesh(new THREE.CircleGeometry(2800, 48), new THREE.MeshLambertMaterial({ color: 0x2e6f9e, transparent: true, opacity: 0.92 }));
    water.rotation.x = -Math.PI / 2; water.position.set(2600, 0.02, 0);
    scene.add(water);
    addGroundFx();
    const crowdPack = buildCrowd({ count: api.tierCount, centerX: -80, centerZ: 0 });
    const agents = buildAgents(48, -80, 0);
    agents.forEach(a => { a.homeX = a.g.position.x; a.homeZ = a.g.position.z; });
    const player = buildPlayer();
    player.x = -80; player.z = 0;
    // splash rings on the water
    const nS = 400;
    const rGeo = new THREE.RingGeometry(0.85, 1, 20);
    const rMat = new THREE.MeshBasicMaterial({ color: 0xdff2ff, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false });
    const sfx = { uT: { value: -1000 }, uSpread: { value: 3 } };
    rMat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, sfx);
      sh.vertexShader = ('attribute float aJit;\nuniform float uT;\nuniform float uSpread;\nvarying float vK;\n' + sh.vertexShader)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
{ float lt = uT - aJit * uSpread - 2.0; float k = clamp(lt / 1.6, 0.0, 1.0); vK = (lt > 0.0) ? (1.0 - k) : 0.0; transformed *= (0.2 + 3.0 * k); }`);
      sh.fragmentShader = ('varying float vK;\n' + sh.fragmentShader)
        .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.a *= vK;');
    };
    const splashes = new THREE.InstancedMesh(rGeo, rMat, nS);
    const jit = new Float32Array(nS);
    const m = new THREE.Matrix4();
    for (let i = 0; i < nS; i++) {
      jit[i] = Math.random();
      const x = 6 + Math.random() * 30, z = (Math.random() - 0.5) * 120;
      m.makeRotationX(-Math.PI / 2); m.setPosition(x, 0.06, z);
      splashes.setMatrixAt(i, m);
    }
    rGeo.setAttribute('aJit', new THREE.InstancedBufferAttribute(jit, 1));
    splashes.frustumCulled = false;
    scene.add(splashes);
    return { player, crowdPack, agents, water, splashes, splashFx: sfx, simT: 0, done: false };
  },
  onReset(ctx) {
    ctx.simT = 0; ctx.done = false;
    ctx.crowdPack.fx.uT.value = -1000;
    ctx.splashFx.uT.value = -1000;
    ctx.water.position.y = 0.02;
    ctx.agents.forEach(a => { resetAgent(a); a.g.position.set(a.homeX, 0, a.homeZ); });
    ctx.ui.setMeter('Sea level change', '0 µm', 0, false);
    ctx.ui.setStat('In the water', '0%');
    ctx.ui.setTime('Time', '-');
  },
  onAction(ctx) {
    const s = ctx.settings, fx = ctx.crowdPack.fx;
    fx.uMode.value = 2; fx.uV.value = 5; fx.uDur.value = 3.5; fx.uSpread.value = s.spread; fx.uT.value = 0;
    ctx.splashFx.uSpread.value = s.spread; ctx.splashFx.uT.value = 0;
    ctx.agents.forEach(a => { a.jitter = Math.random() * s.spread; a.anim = 'run'; a.t = 0; a.v = 5; a.runDur = 3.5; });
    ctx.audio.noiseBurst(ctx.audio.now() + 1.6, 0.5, { dur: 1.2, type: 'lowpass', freq: 800 });
    ctx.simT = 0;
  },
  tick(ctx, dt) {
    const s = ctx.settings, S = ctx.S;
    for (const a of ctx.agents) tickAgent(a, dt);
    if (S.phase === 'action') {
      ctx.simT += dt;
      const t = ctx.simT;
      ctx.ui.setTime('Time', t.toFixed(1) + ' s');
      ctx.crowdPack.fx.uT.value = t;
      ctx.splashFx.uT.value = t;
      let inWater;
      if (s.spread === 0) inWater = (t > 2 ? 1 : 0);
      else inWater = THREE.MathUtils.clamp((t - 2) / s.spread, 0, 1);
      ctx.ui.setStat('In the water', Math.round(inWater * 100) + '%');
      const volEach = 70 * (s.depth / 1.7); // litres submerged
      const rise = 8e9 * volEach / 1000 / 3.62e14 * inWater; // metres
      ctx.ui.setMeter(undefined, '+' + (rise * 1e6).toFixed(2) + ' µm', Math.min(1, rise / 2e-6), false);
      ctx.water.position.y = 0.02 + Math.min(0.35, rise * 2e5); // visually amplified rise, labelled in results
      if (t > s.spread + 5 && !ctx.done) {
        ctx.done = true;
        const vol = 8e9 * volEach / 1000;
        const riseFull = vol / 3.62e14;
        ctx.finish([
          ['People in the sea', '8 billion'],
          ['Water displaced', '~' + (vol / 1e6).toFixed(0) + ' million m³ (' + Math.round(volEach) + ' L each at ' + s.depth.toFixed(1) + ' m depth)'],
          ['Sea level rise', '≈ ' + (riseFull * 1e6).toFixed(1) + ' micrometres - thinner than a human hair'],
          ['Comparison', 'global sea level rises ~3.6 mm/yr - this event is thousands of times smaller than ONE year of that'],
          ['The splash', 'spectacular locally, nothing globally'],
        ], ['The visible water lift in the scene is amplified ~200,000x so it can be seen at all; the meter and this table give the honest figure. Splashes are authored.']);
      }
    }
  },
  onAftermath(ctx) { ctx.audio.startMurmur(0.04, 40); },
};
