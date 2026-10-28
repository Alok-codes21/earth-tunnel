import { THREE, scene, buildSaltFlat, buildCrowd, buildAgents, buildPlayer, resetAgent, tickAgent, addGroundFx } from '../engine.js';

export default {
  id: 'balls',
  title: '8 BILLION BALLS',
  subtitle: 'Everyone on Earth drops a ball at the same second.',
  view: 'ground',
  actionWord: 'DROP',
  meterLabel: 'Balls in the air',
  settings: { spread: 1, height: 1.2 },
  controls: [
    { id: 'spread', label: 'Release spread', min: 0, max: 4, step: 0.5, value: 1, fmt: v => v === 0 ? 'perfect sync' : '±' + v + ' s' },
    { id: 'height', label: 'Drop height', min: 0.8, max: 2, step: 0.1, value: 1.2, fmt: v => v.toFixed(1) + ' m' },
  ],
  note: 'Every ball falls with real gravity and bounces with 60% restitution. The bounce wave ripples outward with the release spread, and afterwards the plain stays littered with balls - that is the aftermath.',
  whatnot: 'no damage, no bouncing higher than the drop point. Restitution 0.6 means every bounce tops out at 36% of the previous height.',
  notes: ['Assumptions: ball radius 9 cm (between cricket and baseball), drop from hand height, restitution 0.6, no wind, flat ground. The bounce sequence is computed per ball in the shader.'],
  setup(api) {
    buildSaltFlat({});
    addGroundFx();
    const crowdPack = buildCrowd({ count: api.tierCount });
    const agents = buildAgents(48);
    const player = buildPlayer();
    const n = crowdPack.crowd.count;
    const geo = new THREE.SphereGeometry(0.09, 8, 6);
    geo.translate(0, 0.09, 0);
    const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    const fx = { uT: { value: -1000 }, uSpread: { value: 1 }, uH: { value: 1.2 } };
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, fx);
      sh.vertexShader = ('attribute float aJit;\nattribute float aScl;\nuniform float uT;\nuniform float uSpread;\nuniform float uH;\n' + sh.vertexShader)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
{
  float lt = uT - aJit * uSpread;
  if (lt > 0.0) {
    float h = uH;
    float tf = sqrt(2.0 * h / 9.81);
    float y = 0.0;
    if (lt < tf) { y = h - 4.905 * lt * lt; }
    else {
      float tt = lt - tf;
      float v = sqrt(2.0 * 9.81 * h) * 0.6;
      for (int k = 0; k < 4; k++) {
        float dur = 2.0 * v / 9.81;
        if (tt < dur) { y = max(0.0, v * tt - 4.905 * tt * tt); break; }
        tt -= dur; v *= 0.6;
      }
    }
    transformed.y += y / max(aScl, 0.01);
  }
}`);
    };
    const balls = new THREE.InstancedMesh(geo, mat, n);
    const m = new THREE.Matrix4(), col = new THREE.Color();
    for (let i = 0; i < n; i++) {
      m.setPosition(crowdPack.base[i * 3] + 0.32, 0, crowdPack.base[i * 3 + 2]);
      balls.setMatrixAt(i, m);
      col.setHSL(Math.random(), 0.55, 0.5);
      balls.setColorAt(i, col);
    }
    const jit = new Float32Array(n);
    for (let i = 0; i < n; i++) jit[i] = Math.random();
    geo.setAttribute('aJit', new THREE.InstancedBufferAttribute(jit, 1));
    geo.setAttribute('aScl', new THREE.InstancedBufferAttribute(crowdPack.scalesA, 1));
    scene.add(balls);
    return { player, crowdPack, agents, balls, ballFx: fx, simT: 0, thud: false, done: false };
  },
  onReset(ctx) {
    ctx.simT = 0; ctx.thud = false; ctx.done = false;
    ctx.ballFx.uT.value = -1000;
    ctx.agents.forEach(resetAgent);
    ctx.ui.setMeter('Balls in the air', '0%', 0, false);
    ctx.ui.setStat('Bounce wave', '-');
    ctx.ui.setTime('Time', '-');
  },
  onAction(ctx) {
    ctx.ballFx.uSpread.value = ctx.settings.spread;
    ctx.ballFx.uH.value = ctx.settings.height;
    ctx.ballFx.uT.value = 0;
    ctx.simT = 0; ctx.thud = false;
  },
  tick(ctx, dt) {
    const s = ctx.settings, S = ctx.S;
    for (const a of ctx.agents) tickAgent(a, dt);
    if (S.phase === 'action') {
      ctx.simT += dt;
      const t = ctx.simT;
      ctx.ui.setTime('Time', t.toFixed(2) + ' s');
      ctx.ballFx.uT.value = t;
      const tFall = Math.sqrt(2 * s.height / 9.81);
      if (!ctx.thud && t >= tFall) {
        ctx.thud = true;
        ctx.audio.rumble(ctx.audio.now(), 0.3, 1.2);
        ctx.fx.shakeCam(0.12);
        ctx.fx.waveRing.visible = true;
      }
      if (ctx.fx.waveRing.visible) {
        const rr = Math.min(1400, 20 + (t - tFall) * 320);
        ctx.fx.waveRing.scale.set(rr, rr, 1);
        ctx.fx.waveRing.material.opacity = Math.max(0, 0.4 - (t - tFall) * 0.12);
        if (ctx.fx.waveRing.material.opacity <= 0) ctx.fx.waveRing.visible = false;
      }
      const totalAir = tFall + 2 * Math.sqrt(2 * s.height / 9.81) * 0.6;
      const airFrac = s.spread === 0 ? (t > 0 && t < totalAir ? 1 : 0)
        : THREE.MathUtils.clamp((Math.min(t, s.spread) - Math.max(0, t - totalAir)) / s.spread, 0, 1);
      ctx.ui.setMeter(undefined, Math.round(airFrac * 100) + '%', airFrac, false);
      ctx.ui.setStat('First impact', t < tFall ? 'in ' + (tFall - t).toFixed(1) + ' s' : 'done');
      const settleT = tFall + 2.2 + s.spread;
      if (t > settleT && !ctx.done) {
        ctx.done = true;
        const volEach = 4 / 3 * Math.PI * Math.pow(0.09, 3);
        ctx.finish([
          ['Balls', '8 billion'],
          ['Drop height', s.height.toFixed(1) + ' m (fall time ' + tFall.toFixed(2) + ' s)'],
          ['Total volume', '~' + Math.round(8e9 * volEach / 1e6).toLocaleString('en-IN') + ' million m³ (about 10 Great Pyramids)'],
          ['Ground coverage', 'one ball per ~0.22 m² (at 4.5 people/m²)'],
          ['Final state', '8 billion balls lying on the salt flat'],
        ], ['Aftermath: the balls stay where they fell - that is the visible aftermath, not a reset. Bounce heights follow 0.6 restitution; the fourth bounce is under 2 cm.']);
      }
    }
  },
  onAftermath(ctx) { ctx.audio.startMurmur(0.03, 30); },
};
