import { THREE, buildSaltFlat, buildCrowd, buildAgents, buildPlayer, resetAgent, tickAgent, addGroundFx } from '../engine.js';

const V_SOUND = 343, I0 = 1e-12, T_CLAP = 0.01;
function clapEnergyJ(L1m) { return Math.pow(10, (L1m - 120) / 10) * 4 * Math.PI * T_CLAP; }
function annulusCoverage(d, x, R) {
  if (d <= 0) return 0;
  if (x + d <= R) return 1;
  if (d >= x + R || (d <= Math.abs(x - R) && x > R)) return 0;
  const c = (x * x + d * d - R * R) / (2 * x * d || 1);
  return Math.acos(Math.min(1, Math.max(-1, c))) / Math.PI;
}
function arrivalDb(t, density, R, x, spread, L1m) {
  if (t <= 0) return 30;
  const d = V_SOUND * t;
  const tMax = (R + x) / V_SOUND;
  const cov = annulusCoverage(d, x, R);
  const teff = Math.max(t, 0.02, spread * 0.35);
  const I = cov * density * clapEnergyJ(L1m) / (2 * teff);
  let db = 10 * Math.log10(Math.max(I, 1e-13) / I0);
  if (t > tMax) db -= 12 * (t - tMax);
  return Math.max(30, Math.min(140, db));
}
function crowdGeometry(density) {
  const areaKm2 = 8e9 / density / 1e6;
  return { areaKm2, radiusM: Math.sqrt(areaKm2 * 1e6 / Math.PI) };
}

export default {
  id: 'claps',
  title: '8 BILLION CLAPS',
  subtitle: 'Everyone on Earth claps at once on a salt flat - what do you actually hear?',
  view: 'ground',
  actionWord: 'CLAP',
  meterLabel: 'Sound level (estimate)',
  settings: { density: 4.5, spread: 0, tscale: 30, clapDb: 90 },
  controls: [
    { id: 'density', label: 'Crowd density', min: 2, max: 6, step: 0.5, value: 4.5, fmt: v => v + '/m²' },
    { id: 'spread', label: 'Timing spread', min: 0, max: 2, step: 0.1, value: 0, fmt: v => v === 0 ? 'perfect sync' : '±' + v + ' s' },
    { id: 'tscale', label: 'Time scale', min: 1, max: 60, step: 1, value: 30, fmt: v => v + 'x' },
    { id: 'clapDb', label: 'Clap strength (assumption)', min: 80, max: 110, step: 1, value: 90, fmt: v => v + ' dB @ 1 m' },
  ],
  note: 'Sound speed is real: 343 m/s. Everyone claps at once; the expanding ring marks the sources whose sound is arriving right now, and the dust band is an authored visualization of the pressure front passing (a real sound wave would not raise visible dust). People near you cover their ears - the near field is painfully loud. Time scale only compresses playback.',
  whatnot: 'no explosion, no earthquake, no change to Earth\'s orbit or rotation. The energy of claps is negligible on a planetary scale.',
  notes: ['Fixed limitations: flat terrain, free-field 1/r² spreading, no atmospheric absorption, uniform clap strength, independent incoherent sources, stationary listener. The 80-110 dB @ 1 m clap-strength range is an illustrative assumption (research shows per-clap level varies widely: >15 dB directivity, 0.7-5.2 dB repeatability spread).'],
  setup(api) {
    buildSaltFlat({});
    addGroundFx();
    const crowdPack = buildCrowd({ count: api.tierCount });
    const agents = buildAgents(48);
    const player = buildPlayer();
    return {
      player, crowdPack, agents,
      simT: 0, listenX: 0, listenZ: 0, peakSeen: 30, earsStarted: false,
      distantMarks: [], distantDone: new Set(), bounceDone: false,
    };
  },
  onReset(ctx) {
    ctx.simT = 0; ctx.peakSeen = 30; ctx.earsStarted = false; ctx.bounceDone = false;
    ctx.distantDone.clear();
    ctx.crowdPack.fx.uT.value = -1000;
    ctx.agents.forEach(resetAgent);
    ctx.ui.setMeter('Sound level (estimate)', 'quiet desert ~30 dB', 0, false);
    ctx.ui.setStat('Sound travel', '0 km');
    ctx.ui.setTime('Time', '-');
  },
  onAction(ctx) {
    const s = ctx.settings, fx = ctx.crowdPack.fx;
    fx.uMode.value = 0; fx.uDur.value = 0.45; fx.uSpread.value = s.spread; fx.uT.value = 0;
    ctx.agents.forEach(a => { a.jitter = Math.random() * s.spread; a.anim = 'clap'; a.t = 0; });
    ctx.listenX = ctx.player.x; ctx.listenZ = ctx.player.z;
    const xOff = Math.hypot(ctx.listenX, ctx.listenZ);
    const { radiusM } = crowdGeometry(s.density);
    ctx.peakSeen = arrivalDb(0.02, s.density, radiusM, xOff, s.spread, s.clapDb);
    ctx.distantMarks = [2000, 8000, 15000, radiusM + xOff];
    const now = ctx.audio.now();
    for (let i = 0; i < 14; i++) ctx.audio.noiseBurst(now + Math.random() * 0.09, 0.5 + Math.random() * 0.4, { freq: 1400 + Math.random() * 900, pan: Math.random() * 1.6 - 0.8 });
    ctx.fx.flashScreen(); ctx.fx.shakeCam(0.55); ctx.fx.fovPunch(76);
    ctx.fx.waveRing.visible = true; ctx.fx.dustRing.visible = true;
    ctx.simT = 0;
  },
  tick(ctx, dt) {
    const s = ctx.settings, S = ctx.S, fx = ctx.crowdPack.fx;
    for (const a of ctx.agents) tickAgent(a, dt);
    if (S.phase === 'action') {
      ctx.simT += dt * s.tscale;
      const t = ctx.simT, waveR = t * V_SOUND;
      ctx.ui.setTime('Sim time', t.toFixed(1) + ' s');
      ctx.ui.setStat('Sound travel', (waveR / 1000).toFixed(1) + ' km');
      const visR = Math.min(waveR, 1400);
      ctx.fx.waveRing.position.set(ctx.listenX, 0.4, ctx.listenZ);
      ctx.fx.waveRing.scale.set(Math.max(visR, 0.01), Math.max(visR, 0.01), 1);
      ctx.fx.waveRing.material.opacity = Math.max(0.06, 0.5 - t * 0.03);
      ctx.fx.dustRing.position.set(ctx.listenX, 1.1, ctx.listenZ);
      ctx.fx.dustRing.scale.set(Math.max(visR, 0.01), Math.max(visR, 0.01), 1);
      ctx.fx.dustRing.material.opacity = Math.max(0, 0.26 - t * 0.02);
      if (!ctx.bounceDone) {
        fx.uT.value = t;
        if (t > 0.45 + s.spread + 0.1) { fx.uT.value = -1000; ctx.bounceDone = true; }
      }
      if (!ctx.earsStarted && t > 1.2) {
        ctx.earsStarted = true;
        ctx.agents.forEach(a => { if (a.dist < 25) { a.anim = 'ears'; a.t = 0; a.jitter = Math.random() * 0.4; } });
      }
      for (const d of ctx.distantMarks) {
        if (!ctx.distantDone.has(d) && waveR >= d) {
          ctx.distantDone.add(d);
          ctx.audio.rumble(ctx.audio.now(), Math.max(0.04, 0.5 - d / 60000), 1.6);
        }
      }
      const { radiusM } = crowdGeometry(s.density);
      const xOff = Math.hypot(ctx.listenX, ctx.listenZ);
      const db = arrivalDb(t, s.density, radiusM, xOff, s.spread, s.clapDb);
      ctx.peakSeen = Math.max(ctx.peakSeen, db);
      ctx.ui.setMeter(undefined, '~' + db.toFixed(0) + ' dB (estimate)', db / 130, db > 105);
      if (t > Math.max(8, (radiusM + xOff) / V_SOUND * 1.05)) {
        const { areaKm2 } = crowdGeometry(s.density);
        ctx.finish([
          ['Crowd', '8 billion'],
          ['Density', s.density + ' people/m²'],
          ['Footprint', Math.round(areaKm2).toLocaleString('en-IN') + ' km² (disc ~' + Math.round(radiusM * 2 / 1000) + ' km wide)'],
          ['Peak here (brief, estimate)', '~' + ctx.peakSeen.toFixed(0) + ' dB, assuming ' + s.clapDb + ' dB @ 1 m per clap'],
          ['Delay from farthest edge', '~' + Math.round((radiusM + xOff) / V_SOUND) + ' s (edge ' + ((radiusM + xOff) / 1000).toFixed(0) + ' km away)'],
        ], ['Aftermath: the crowd reaction after these results (cheering, murmur) is an authored reaction, not a physical prediction. Physically justified: no structural change; the sound decays back to desert quiet (~30 dB).']);
      }
    } else { // aftermath
      const settle = Math.max(30, 45 - S.t * 0.5);
      ctx.ui.setMeter(undefined, '~' + settle.toFixed(0) + ' dB (estimate)', settle / 130, false);
      ctx.fx.waveRing.material.opacity = Math.max(0, ctx.fx.waveRing.material.opacity - dt * 0.05);
      ctx.fx.dustRing.material.opacity = Math.max(0, ctx.fx.dustRing.material.opacity - dt * 0.05);
    }
  },
  onAftermath(ctx) {
    ctx.agents.forEach(a => { a.anim = 'celebrate'; a.t = 0; a.celebrate = 0.3 + Math.random() * 2.4; a.sway = Math.random() * Math.PI * 2; });
    ctx.audio.startMurmur(0.05, 30);
  },
};
