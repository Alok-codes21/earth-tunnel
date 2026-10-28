import { THREE, buildSaltFlat, buildCrowd, buildAgents, buildPlayer, resetAgent, tickAgent, addGroundFx } from '../engine.js';

const G = 9.81, M_EARTH = 5.9724e24;
const flightTime = v => 2 * v / G;
const totalMassKg = m => 8e9 * m;

export default {
  id: 'jump',
  title: '8 BILLION JUMPS',
  subtitle: 'Everyone on Earth jumps at the same second - does the planet feel it?',
  view: 'ground',
  actionWord: 'JUMP',
  meterLabel: 'Ground vibration (authored visualization)',
  settings: { density: 4.5, spread: 0, massKg: 62, takeoffV: 2.6 },
  controls: [
    { id: 'density', label: 'Crowd density', min: 2, max: 6, step: 0.5, value: 4.5, fmt: v => v + '/m²' },
    { id: 'spread', label: 'Timing spread', min: 0, max: 3, step: 0.1, value: 0, fmt: v => v === 0 ? 'perfect sync' : '±' + v + ' s' },
    { id: 'massKg', label: 'Avg body mass', min: 50, max: 75, step: 1, value: 62, fmt: v => v + ' kg' },
    { id: 'takeoffV', label: 'Takeoff speed', min: 1.8, max: 3.2, step: 0.1, value: 2.6, fmt: v => v.toFixed(1) + ' m/s' },
  ],
  note: 'The physics is real: a ballistic jump (h = v²/2g) and conservation of momentum (Earth recoil = total human momentum ÷ Earth mass). With timing spread the landings desync, so there is no single giant thud. The dust layer the landings kick up is an authored visualization - real footfalls would raise some dust, but not a mapped amount.',
  whatnot: 'no earthquake, no change to Earth\'s orbit or rotation, no collapsing buildings. The total mass of 8 billion people is ~10⁻¹³ of Earth\'s mass; the recoil is subatomic in scale.',
  notes: ['Important assumption: this recoil applies only when everyone is gathered in ONE place (the xkcd premise). If everyone jumps where they are, spread across the world, the momentums cancel - the net recoil is even smaller. Sources: Earth mass 5.9724×10²⁴ kg (NASA Earth Fact Sheet); average adult body mass ~62 kg (Walpole et al. 2012, BMC Public Health); everyone-jumps recoil negligible (xkcd what-if #8).', 'The ground vibration meter is an authored visualization - no seismic magnitude or physical coupling model is claimed. It only conveys the feel of the crowd landing.'],
  setup(api) {
    buildSaltFlat({});
    addGroundFx();
    const crowdPack = buildCrowd({ count: api.tierCount });
    const agents = buildAgents(48);
    const player = buildPlayer();
    return {
      player, crowdPack, agents,
      simT: 0, vib: 0, shook: false, ringShown: false, ringT: 0, playerT: -1, landedShown: 0,
    };
  },
  onReset(ctx) {
    ctx.simT = 0; ctx.vib = 0; ctx.shook = false; ctx.ringShown = false; ctx.ringT = 0; ctx.playerT = -1;
    ctx.player.py = 0;
    ctx.crowdPack.fx.uT.value = -1000;
    ctx.agents.forEach(resetAgent);
    ctx.ui.setMeter('Ground vibration (authored visualization)', 'still desert', 0, false);
    ctx.ui.setStat('Airborne', '0%');
    ctx.ui.setTime('Time', '-');
    updateRecoilStat(ctx);
  },
  onAction(ctx) {
    const s = ctx.settings, fx = ctx.crowdPack.fx;
    const ft = flightTime(s.takeoffV);
    fx.uMode.value = 1; fx.uV.value = s.takeoffV; fx.uDur.value = ft; fx.uSpread.value = s.spread; fx.uT.value = 0;
    const now = ctx.audio.now();
    ctx.agents.forEach(a => {
      a.jitter = Math.random() * s.spread; a.anim = 'jump'; a.t = 0; a.v = s.takeoffV; a.ft = ft;
      const landDelay = a.jitter + ft;
      if (landDelay < 8) ctx.audio.rumble(now + landDelay, Math.max(0.03, 0.35 - a.dist / 120), 0.35);
    });
    ctx.audio.rumble(now + s.spread / 2 + ft, 0.3, 1.4);
    ctx.fx.flashScreen(0.5);
    ctx.playerT = 0;
    ctx.simT = 0; ctx.shook = false; ctx.ringShown = false;
  },
  tick(ctx, dt) {
    const s = ctx.settings, S = ctx.S, fx = ctx.crowdPack.fx;
    const ft = flightTime(s.takeoffV);
    for (const a of ctx.agents) tickAgent(a, dt);
    if (S.phase === 'action') {
      ctx.simT += dt;
      const t = ctx.simT;
      ctx.ui.setTime('Time', t.toFixed(2) + ' s');
      // analytic airborne fraction (matches uniform jitter distribution)
      let airborne;
      if (s.spread === 0) airborne = (t > 0 && t < ft) ? 1 : 0;
      else airborne = Math.max(0, Math.min(t, s.spread) - Math.max(0, t - ft)) / s.spread;
      ctx.ui.setStat('Airborne', Math.round(airborne * 100) + '%');
      fx.uT.value = (t > s.spread + ft + 0.1) ? -1000 : t;
      // landing flux -> authored vibration
      let flux = 0;
      if (s.spread === 0) flux = (t >= ft && !ctx.shook) ? 3 : 0;
      else if (t >= ft && t <= ft + s.spread) flux = 1 / s.spread;
      const target = Math.min(100, flux * 90);
      ctx.vib = Math.max(ctx.vib * Math.pow(0.25, dt), target);
      ctx.ui.setMeter(undefined, vibLabel(ctx.vib), ctx.vib / 100, ctx.vib > 60);
      // first landings: visible consequence - dust layer + shake
      if (!ctx.shook && t >= ft) {
        ctx.shook = true;
        ctx.fx.shakeCam(0.5 + ctx.vib * 0.006);
        ctx.fx.fovPunch(74);
        ctx.fx.triggerHaze(0.3);
        ctx.audio.rumble(ctx.audio.now(), 0.4, 1.8);
      }
      // impact ring at median landing
      const medLand = s.spread / 2 + ft;
      if (!ctx.ringShown && t >= medLand) { ctx.ringShown = true; ctx.ringT = 0; ctx.fx.waveRing.visible = true; }
      if (ctx.ringShown && ctx.fx.waveRing.visible) {
        ctx.ringT += dt;
        const rr = Math.min(2400, 60 + ctx.ringT * 700);
        ctx.fx.waveRing.position.set(0, 0.4, 0);
        ctx.fx.waveRing.scale.set(rr, rr, 1);
        ctx.fx.waveRing.material.opacity = Math.max(0, 0.45 - ctx.ringT * 0.16);
        if (ctx.fx.waveRing.material.opacity <= 0) ctx.fx.waveRing.visible = false;
      }
      // player jumps with the crowd
      if (ctx.playerT >= 0) {
        ctx.playerT += dt;
        if (ctx.playerT >= ft) { ctx.playerT = -1; ctx.player.py = 0; }
        else ctx.player.py = Math.max(0, s.takeoffV * ctx.playerT - 0.5 * G * ctx.playerT * ctx.playerT);
      }
      if (t > s.spread + ft + 3) {
        const m = totalMassKg(s.massKg);
        ctx.finish([
          ['Crowd', '8 billion'],
          ['Total mass', (m / 1000 / 1e6).toFixed(1) + ' million tonnes'],
          ['Jump height (avg)', (s.takeoffV * s.takeoffV / (2 * G)).toFixed(2) + ' m'],
          ['Flight time (avg)', ft.toFixed(2) + ' s'],
          ['Earth recoil speed', '≈ ' + (m * s.takeoffV / M_EARTH).toExponential(1) + ' m/s (returned on landing)'],
          ['Ground vibration', 'local and brief (authored visualization)'],
        ], ['Aftermath: the crowd reaction (cheering, murmur) is an authored reaction, not a physical prediction. Physically justified: no structural change; the vibration decays within seconds and the desert is still again.']);
      }
    } else {
      ctx.vib *= Math.pow(0.5, dt);
      ctx.ui.setMeter(undefined, vibLabel(ctx.vib), ctx.vib / 100, false);
    }
  },
  onAftermath(ctx) {
    ctx.agents.forEach(a => { a.anim = 'celebrate'; a.t = 0; a.celebrate = 0.3 + Math.random() * 2.4; a.sway = Math.random() * Math.PI * 2; });
    ctx.audio.startMurmur(0.05, 30);
  },
  onSettingsChange(ctx) { if (ctx) updateRecoilStat(ctx); },
};
function vibLabel(v) {
  if (v < 1) return 'still desert';
  if (v < 25) return 'light tremor (authored visualization)';
  if (v < 60) return 'strong shaking (authored visualization)';
  return 'very strong shaking (authored visualization)';
}
function updateRecoilStat(ctx) {
  const m = totalMassKg(ctx.settings.massKg);
  ctx.ui.setStat('Earth recoil', '≈ ' + (m * ctx.settings.takeoffV / M_EARTH).toExponential(1) + ' m/s');
}
