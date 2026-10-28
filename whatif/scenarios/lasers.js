import { THREE, scene, buildSaltFlat, buildCrowd, buildAgents, buildPlayer, resetAgent, tickAgent, addGroundFx, buildMoon } from '../engine.js';

export default {
  id: 'lasers',
  title: 'LASERS AT THE MOON',
  subtitle: 'Everyone on Earth points a red laser pointer at the Moon at once.',
  view: 'ground',
  actionWord: 'LASERS ON',
  meterLabel: 'Total laser power',
  settings: { spread: 2, powerMw: 5 },
  controls: [
    { id: 'spread', label: 'Switch-on spread', min: 0, max: 6, step: 0.5, value: 2, fmt: v => v === 0 ? 'perfect sync' : v + ' s' },
    { id: 'powerMw', label: 'Power per laser', min: 1, max: 50, step: 1, value: 5, fmt: v => v + ' mW' },
  ],
  note: 'A red lattice of beams rises toward the Moon as 8 billion pointers switch on. Watch the Moon disc: the landing spot is shown greatly enhanced so you can see where the light lands - the meter gives the honest numbers.',
  whatnot: 'we do not claim the Moon would look any different - the visual effect is not simulated; the numerical estimate is the honest output: the added illumination is millions of times below ordinary moonlight. Beam spread over 384,400 km makes the spot kilometres wide, and nobody on the Moon gets hurt.',
  notes: ['Class IIIA pointer ~5 mW, divergence ~1 mrad: at the Moon the spot is ~380 km across. The visible red dot in this scene is artificially enhanced (labelled) - the real illumination is under a millionth of a lux.'],
  setup(api) {
    buildSaltFlat({ night: true });
    addGroundFx();
    const moon = buildMoon();
    const crowdPack = buildCrowd({ count: api.tierCount });
    const agents = buildAgents(48);
    const player = buildPlayer();
    const n = crowdPack.crowd.count;
    // beams: thin tall boxes tilted toward the moon
    const dir = moon.mesh.position.clone().normalize();
    const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    const geo = new THREE.BoxGeometry(0.03, 80, 0.03);
    geo.translate(0, 40 + 1.5, 0); // base at hand height
    const mat = new THREE.MeshBasicMaterial({ color: 0xff2a1a, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false });
    const fx = { uT: { value: -1000 }, uSpread: { value: 2 } };
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, fx);
      sh.vertexShader = ('attribute float aJit;\nuniform float uT;\nuniform float uSpread;\n' + sh.vertexShader)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
{ float k = clamp((uT - aJit * uSpread) / 0.25, 0.0, 1.0); transformed.xz *= k; transformed.y = transformed.y * k - (1.0 - k) * 40.0 * k; }`);
    };
    const bN = Math.min(n, 800); // representative subset - all 8 billion is a whiteout
    const beams = new THREE.InstancedMesh(geo, mat, bN);
    const jit = new Float32Array(bN);
    const m = new THREE.Matrix4();
    for (let i = 0; i < bN; i++) {
      jit[i] = Math.random();
      m.makeRotationFromQuaternion(quat);
      m.setPosition(crowdPack.base[i * 3], 0, crowdPack.base[i * 3 + 2]);
      beams.setMatrixAt(i, m);
    }
    geo.setAttribute('aJit', new THREE.InstancedBufferAttribute(jit, 1));
    beams.frustumCulled = false;
    scene.add(beams);
    // enhanced landing dot on the moon
    const dot = new THREE.Mesh(new THREE.CircleGeometry(7, 16), new THREE.MeshBasicMaterial({ color: 0xff3020, transparent: true, opacity: 0, fog: false }));
    dot.position.copy(moon.mesh.position).multiplyScalar(0.985);
    dot.lookAt(0, 0, 0);
    scene.add(dot);
    return { player, crowdPack, agents, moon, beams, beamFx: fx, dot, simT: 0, done: false };
  },
  onReset(ctx) {
    ctx.simT = 0; ctx.done = false;
    ctx.beamFx.uT.value = -1000;
    ctx.dot.material.opacity = 0;
    ctx.agents.forEach(resetAgent);
    ctx.ui.setMeter('Total laser power', '0 W', 0, false);
    ctx.ui.setStat('Lux at the Moon', '0');
    ctx.ui.setTime('Time', '-');
  },
  onAction(ctx) {
    ctx.beamFx.uSpread.value = ctx.settings.spread;
    ctx.beamFx.uT.value = 0;
    ctx.audio.beep(1560, ctx.audio.now(), 0.25, 0.1);
    ctx.simT = 0;
  },
  tick(ctx, dt) {
    const s = ctx.settings, S = ctx.S;
    for (const a of ctx.agents) tickAgent(a, dt);
    if (S.phase === 'action') {
      ctx.simT += dt;
      const t = ctx.simT;
      ctx.ui.setTime('Time', t.toFixed(1) + ' s');
      ctx.beamFx.uT.value = t;
      const frac = s.spread === 0 ? (t > 0 ? 1 : 0) : THREE.MathUtils.clamp(t / s.spread, 0, 1);
      const watts = 8e9 * s.powerMw / 1000 * frac;
      ctx.ui.setMeter(undefined, '≈ ' + (watts / 1e6).toFixed(1) + ' MW', frac, watts > 3e7);
      // lux at moon: P/(spot area), spot radius ~190 km at 1 mrad half-angle
      const spotR = 190e3;
      const lux = watts * 0.7 / (Math.PI * spotR * spotR) / 683; // rough: 683 lm/W photopic, 70% transmission
      ctx.ui.setStat('Lux at the Moon', lux.toExponential(1) + ' lx');
      ctx.dot.material.opacity = 0.5 * frac; // labelled enhancement, not physical brightness
      if (t > s.spread + 5 && !ctx.done) {
        ctx.done = true;
        const W = 8e9 * s.powerMw / 1000;
        ctx.finish([
          ['Lasers on', '8 billion'],
          ['Total power', '≈ ' + (W / 1e6).toFixed(0) + ' MW (about 40 city blocks of electricity)'],
          ['Spot size on the Moon', '~380 km wide (1 mrad divergence)'],
          ['Light on the Moon', '≈ ' + (W * 0.7 / (Math.PI * 190e3 * 190e3) / 683).toExponential(1) + ' lux (vs ~0.1 lux of ordinary moonlight)'],
        ], ['The red dot on the Moon in this scene is a labelled enhancement so the landing point is visible; the meter shows the physical estimate.']);
      }
    }
  },
  onAftermath(ctx) { ctx.audio.startMurmur(0.03, 40); },
};
