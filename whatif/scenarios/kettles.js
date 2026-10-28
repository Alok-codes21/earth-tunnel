import { THREE, scene, buildSaltFlat, buildCrowd, buildAgents, buildPlayer, resetAgent, tickAgent, addGroundFx } from '../engine.js';

export default {
  id: 'kettles',
  title: '8 BILLION KETTLES',
  subtitle: 'Everyone on Earth switches on an electric kettle at the same second.',
  view: 'ground',
  actionWord: 'KETTLES ON',
  meterLabel: 'Grid demand vs supply',
  settings: { kW: 2, spread: 2, litres: 1 },
  controls: [
    { id: 'kW', label: 'Kettle power', min: 1, max: 3, step: 0.1, value: 2, fmt: v => v.toFixed(1) + ' kW' },
    { id: 'spread', label: 'Switch-on spread', min: 0, max: 6, step: 0.5, value: 2, fmt: v => v === 0 ? 'perfect sync' : v + ' s' },
    { id: 'litres', label: 'Water per kettle', min: 0.5, max: 2, step: 0.1, value: 1, fmt: v => v.toFixed(1) + ' L' },
  ],
  note: 'Steam starts rising everywhere on the plain. The demand meter shows the real problem: 8 billion kettles want several times more power than the entire world generates. The scene browns out as the grid fails to keep up (authored).',
  whatnot: 'no melted power lines across the planet in reality - grids would trip protective relays and shed load first. The brownout here is an authored illustration of demand exceeding supply.',
  notes: ['Kettle ~2 kW, world average generation ~3,300 GW. Energy to boil 1 L from 20°C ≈ 0.33 MJ ≈ 0.093 kWh per litre. In reality most kettles would simply not get power - voltage collapse and relay trips would spread.'],
  setup(api) {
    buildSaltFlat({});
    addGroundFx();
    const crowdPack = buildCrowd({ count: api.tierCount });
    const agents = buildAgents(48);
    const player = buildPlayer();
    const n = crowdPack.crowd.count;
    const sN = Math.min(1000, n);
    const pos = new Float32Array(sN * 3), baseIdx = new Float32Array(sN);
    for (let i = 0; i < sN; i++) {
      const j = (Math.random() * n) | 0;
      baseIdx[i] = j;
      pos[i * 3] = crowdPack.base[j * 3] + 0.3;
      pos[i * 3 + 1] = 1.0 + Math.random() * 4;
      pos[i * 3 + 2] = crowdPack.base[j * 3 + 2] + 0.3;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const steam = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xf2f2f5, size: 2.8, transparent: true, opacity: 0, depthWrite: false }));
    steam.frustumCulled = false;
    scene.add(steam);
    // authored brownout veil
    const veil = document.createElement('div');
    veil.style.cssText = 'position:fixed;inset:0;background:#100c08;opacity:0;pointer-events:none;transition:opacity .2s';
    document.body.appendChild(veil);
    return { player, crowdPack, agents, steam, baseIdx, veil, simT: 0, boilAt: 0, done: false, brown: 0 };
  },
  onReset(ctx) {
    ctx.simT = 0; ctx.done = false; ctx.brown = 0; ctx.boilAt = 0;
    if (ctx.veil) ctx.veil.style.opacity = 0;
    ctx.steam.material.opacity = 0;
    ctx.agents.forEach(resetAgent);
    ctx.ui.setMeter('Grid demand vs supply', 'demand normal', 0.1, false);
    ctx.ui.setStat('Kettles on', '0%');
    ctx.ui.setTime('Time', '-');
  },
  onAction(ctx) {
    ctx.audio.noiseBurst(ctx.audio.now(), 0.25, { dur: 0.5, type: 'lowpass', freq: 700 });
    ctx.simT = 0; ctx.boilAt = 0;
  },
  tick(ctx, dt) {
    const s = ctx.settings, S = ctx.S;
    for (const a of ctx.agents) tickAgent(a, dt);
    if (S.phase === 'action' || S.phase === 'aftermath') {
      ctx.simT += dt;
      const t = ctx.simT;
      ctx.ui.setTime('Time', t.toFixed(1) + ' s');
      const frac = s.spread === 0 ? (t > 0 ? 1 : 0) : THREE.MathUtils.clamp(t / s.spread, 0, 1);
      ctx.ui.setStat('Kettles on', Math.round(frac * 100) + '%');
      const demandGW = 8e9 * s.kW / 1e6 * frac; // kW -> GW: 8e9 * kW = 8e9*2 kW = 16e9 kW = 16000 GW
      const ratio = demandGW / 3300;
      ctx.ui.setMeter(undefined, '≈ ' + Math.round(demandGW).toLocaleString('en-IN') + ' GW wanted vs ~3,300 GW generated (' + ratio.toFixed(1) + 'x)', Math.min(1, ratio / 6), ratio > 1);
      // authored brownout: ambient dips when demand exceeds supply
      const over = THREE.MathUtils.clamp(ratio - 1, 0, 3);
      ctx.brown = over > 0 ? Math.min(0.35, over * 0.12) * (0.85 + 0.15 * Math.sin(t * 9)) : 0;
      ctx.veil.style.opacity = ctx.brown.toFixed(3);
      // steam after ~boil time (2 kW, 1 L from 20C: ~168 s) - compressed: steam visible quickly as authored cue
      ctx.steam.material.opacity = 0.5 * frac;
      if (ctx.steam.material.opacity > 0.01) {
        const a = ctx.steam.geometry.attributes.position.array;
        for (let i = 0; i < a.length / 3; i++) {
          a[i * 3 + 1] += dt * 2.5;
          if (a[i * 3 + 1] > 14) a[i * 3 + 1] = 1.0;
        }
        ctx.steam.geometry.attributes.position.needsUpdate = true;
      }
      if (t > s.spread + 6 && !ctx.done) {
        ctx.done = true;
        const kWh = s.litres * 0.093;
        ctx.finish([
          ['Kettles on', '8 billion'],
          ['Power wanted', '≈ ' + Math.round(8e9 * s.kW / 1e6).toLocaleString('en-IN') + ' GW ≈ ' + (8e9 * s.kW / 1e6 / 3300).toFixed(1) + 'x world generation'],
          ['Energy for one boil each', '≈ ' + Math.round(8e9 * kWh / 1e6).toLocaleString('en-IN') + ' GWh (' + kWh.toFixed(2) + ' kWh per litre)'],
          ['What the grid would do', 'relays trip, regions go dark, most kettles get nothing (authored brownout shown)'],
          ['Water boiled if it worked', '8 billion litres - enough for ~3,200 Olympic pools'],
        ], ['The steam and brownout dimming are authored visualizations. The GW and GWh figures are the estimate.']);
      }
    }
  },
  onAftermath(ctx) { ctx.audio.startMurmur(0.03, 40); },
};
