import { THREE, buildSaltFlat, buildCrowd, buildAgents, buildPlayer, resetAgent, tickAgent, addGroundFx } from '../engine.js';

const R_EARTH = 6.371e6, I_EARTH = 8.04e37, OMEGA = 7.2921e-5;

export default {
  id: 'run',
  title: 'EVERYONE RUNS EAST',
  subtitle: 'All 8 billion people sprint east at once - can they slow Earth\'s rotation?',
  view: 'ground',
  defaultPov: 'tp',
  actionWord: 'RUN',
  meterLabel: 'Collective momentum',
  settings: { speed: 4, duration: 12, spread: 2 },
  controls: [
    { id: 'speed', label: 'Running speed', min: 2, max: 6, step: 0.5, value: 4, fmt: v => v.toFixed(1) + ' m/s' },
    { id: 'duration', label: 'Run duration', min: 5, max: 20, step: 1, value: 12, fmt: v => v + ' s' },
    { id: 'spread', label: 'Start spread', min: 0, max: 5, step: 0.5, value: 2, fmt: v => v === 0 ? 'perfect sync' : '±' + v + ' s' },
  ],
  note: 'Angular momentum is conserved: as the crowd speeds up eastward, the planet underneath slows by the same total angular momentum. Watch the dust the runners kick up. The effect on Earth is real but immeasurably small.',
  whatnot: 'no earthquakes, no stopping the planet, no flinging anyone into space. Earth\'s moment of inertia is about 10²⁶ times larger than the crowd\'s total angular momentum.',
  notes: ['Assumptions: average body mass 62 kg (Walpole et al. 2012), everyone runs due east at the equator for maximum effect, Earth moment of inertia 8.04×10³⁷ kg·m². When everyone stops, the angular momentum flows back - net change zero.'],
  setup(api) {
    buildSaltFlat({});
    addGroundFx();
    const crowdPack = buildCrowd({ count: api.tierCount });
    const agents = buildAgents(48);
    const player = buildPlayer();
    agents.forEach(a => { a.homeX = a.g.position.x; a.homeZ = a.g.position.z; });
    return { player, crowdPack, agents, simT: 0, dustAt: false };
  },
  onReset(ctx) {
    ctx.simT = 0; ctx.dustAt = false;
    ctx.crowdPack.fx.uT.value = -1000;
    ctx.agents.forEach(a => { resetAgent(a); a.g.position.set(a.homeX, 0, a.homeZ); });
    ctx.ui.setMeter('Collective momentum', '0 kg·m/s', 0, false);
    ctx.ui.setStat('Running', '0%');
    ctx.ui.setTime('Time', '-');
  },
  onAction(ctx) {
    const s = ctx.settings, fx = ctx.crowdPack.fx;
    fx.uMode.value = 2; fx.uV.value = s.speed; fx.uDur.value = s.duration; fx.uSpread.value = s.spread; fx.uT.value = 0;
    ctx.agents.forEach(a => { a.jitter = Math.random() * s.spread; a.anim = 'run'; a.t = 0; a.v = s.speed; a.runDur = s.duration; a.x0 = a.g.position.x; });
    ctx.audio.rumble(ctx.audio.now(), 0.25, 2.5);
    ctx.fx.shakeCam(0.15);
    ctx.simT = 0;
  },
  tick(ctx, dt) {
    const s = ctx.settings, S = ctx.S;
    for (const a of ctx.agents) tickAgent(a, dt);
    if (S.phase === 'action') {
      ctx.simT += dt;
      const t = ctx.simT;
      ctx.ui.setTime('Time', t.toFixed(1) + ' s');
      ctx.crowdPack.fx.uT.value = (t > s.duration + s.spread + 0.5) ? -1000 : t;
      let running;
      if (s.spread === 0) running = (t > 0 && t < s.duration) ? 1 : 0;
      else running = Math.max(0, Math.min(t, s.spread) - Math.max(0, t - s.duration)) / s.spread;
      ctx.ui.setStat('Running', Math.round(running * 100) + '%');
      const P = 8e9 * 62 * s.speed * running;
      ctx.ui.setMeter(undefined, P > 0 ? '≈ ' + P.toExponential(1) + ' kg·m/s' : '0 kg·m/s', P / (8e9 * 62 * 6), false);
      if (!ctx.dustAt && running > 0.5) { ctx.dustAt = true; ctx.fx.triggerHaze(0.16); }
      if (t > s.duration + s.spread + 2) {
        const P = 8e9 * 62 * s.speed;
        const dOmega = P * R_EARTH / I_EARTH;
        const dDay = 86400 * dOmega / OMEGA;
        ctx.finish([
          ['Runners', '8 billion'],
          ['Collective momentum', '≈ ' + P.toExponential(1) + ' kg·m/s'],
          ['Earth rotation change', '≈ ' + dOmega.toExponential(1) + ' rad/s while running'],
          ['Day length change', '≈ ' + dDay.toExponential(1) + ' s (immeasurable)'],
          ['Returned on stopping', 'yes - net change zero'],
        ], ['Aftermath: the dust settling and the crowd catching their breath (cheering) is an authored reaction. The rotation change is real physics but far below any measurement threshold.']);
      }
    }
  },
  onAftermath(ctx) {
    ctx.agents.forEach(a => { a.anim = 'celebrate'; a.t = 0; a.celebrate = 0.3 + Math.random() * 2.4; a.sway = Math.random() * Math.PI * 2; });
    ctx.audio.startMurmur(0.04, 25);
  },
};
