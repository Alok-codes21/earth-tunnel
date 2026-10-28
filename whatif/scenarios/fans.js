import { THREE, scene, buildSaltFlat, buildCrowd, buildAgents, buildPlayer, resetAgent, tickAgent, addGroundFx, makeWind } from '../engine.js';

export default {
  id: 'fans',
  title: '8 BILLION FANS',
  subtitle: 'Everyone on Earth switches on a desk fan pointing the same way.',
  view: 'ground',
  actionWord: 'FANS ON',
  meterLabel: 'Electricity draw',
  settings: { watts: 75, spread: 2, windMs: 3 },
  controls: [
    { id: 'watts', label: 'Watts per fan', min: 30, max: 120, step: 5, value: 75, fmt: v => v + ' W' },
    { id: 'spread', label: 'Switch-on spread', min: 0, max: 6, step: 0.5, value: 2, fmt: v => v === 0 ? 'perfect sync' : v + ' s' },
    { id: 'windMs', label: 'Local breeze', min: 1, max: 6, step: 0.5, value: 3, fmt: v => v.toFixed(1) + ' m/s' },
  ],
  note: 'Fans spin up across the plain and a real breeze starts moving through the crowd - watch the dust streaks. The electricity meter is where the scale shows up.',
  whatnot: 'the combined breeze does not become a hurricane and does not push the atmosphere as one wind. Each fan moves air a few metres; the flows stay local.',
  notes: ['Desk fan 30-120 W. 8 billion fans at 75 W = 600 GW, about 18% of world average electricity generation (~3,300 GW). Breeze streaks are an authored visualization of local airflow.'],
  setup(api) {
    buildSaltFlat({});
    addGroundFx();
    const crowdPack = buildCrowd({ count: api.tierCount });
    const agents = buildAgents(48);
    const player = buildPlayer();
    const wind = makeWind(700, 300);
    // fans: static pole+head, spinning blades
    const nFans = Math.min(1200, crowdPack.crowd.count);
    const poleGeo = new THREE.CylinderGeometry(0.03, 0.05, 1.15, 6); poleGeo.translate(0, 0.58, 0);
    const headGeo = new THREE.TorusGeometry(0.3, 0.035, 5, 12); headGeo.translate(0, 1.3, 0);
    const bladeGeo = new THREE.BoxGeometry(0.56, 0.09, 0.02);
    const b2 = new THREE.BoxGeometry(0.09, 0.56, 0.02);
    const mergedBlades = mergeTwo(bladeGeo, b2); mergedBlades.translate(0, 1.3, 0.04);
    const poleMat = new THREE.MeshLambertMaterial({ color: 0x3a3f45 });
    const poles = new THREE.InstancedMesh(poleGeo, poleMat, nFans);
    const headsM = new THREE.InstancedMesh(headGeo, poleMat, nFans);
    const blades = new THREE.InstancedMesh(mergedBlades, new THREE.MeshLambertMaterial({ color: 0xb9c0c7 }), nFans);
    const m = new THREE.Matrix4();
    const fanX = new Float32Array(nFans), fanZ = new Float32Array(nFans);
    for (let i = 0; i < nFans; i++) {
      const x = crowdPack.base[i * 3] + 0.45, z = crowdPack.base[i * 3 + 2] + 0.45;
      fanX[i] = x; fanZ[i] = z;
      m.identity(); m.setPosition(x, 0, z);
      poles.setMatrixAt(i, m); headsM.setMatrixAt(i, m); blades.setMatrixAt(i, m);
    }
    scene.add(poles, headsM, blades);
    return { player, crowdPack, agents, wind, blades, fanX, fanZ, nFans, spin: 0, simT: 0, done: false };
  },
  onReset(ctx) {
    ctx.simT = 0; ctx.done = false; ctx.spin = 0;
    ctx.wind.mesh.visible = false; ctx.wind.speed = 0;
    ctx.agents.forEach(resetAgent);
    ctx.ui.setMeter('Electricity draw', '0 GW', 0, false);
    ctx.ui.setStat('Fans on', '0%');
    ctx.ui.setTime('Time', '-');
  },
  onAction(ctx) {
    ctx.audio.rumble(ctx.audio.now(), 0.15, 1.2);
    ctx.simT = 0;
  },
  tick(ctx, dt) {
    const s = ctx.settings, S = ctx.S;
    for (const a of ctx.agents) tickAgent(a, dt);
    if (S.phase === 'action' || S.phase === 'aftermath') {
      ctx.simT += dt;
      const t = ctx.simT;
      ctx.ui.setTime('Time', t.toFixed(1) + ' s');
      const frac = s.spread === 0 ? (t > 0 ? 1 : 0) : THREE.MathUtils.clamp(t / s.spread, 0, 1);
      ctx.ui.setStat('Fans on', Math.round(frac * 100) + '%');
      const gw = 8e9 * s.watts / 1e9 * frac;
      ctx.ui.setMeter(undefined, '≈ ' + Math.round(gw) + ' GW (' + Math.round(gw / 3300 * 100) + '% of world generation)', frac, gw > 1000);
      // spin blades (bounded instance count, cheap)
      ctx.spin += dt * 40 * frac;
      const m = new THREE.Matrix4();
      for (let i = 0; i < ctx.nFans; i++) {
        m.makeRotationZ(ctx.spin + i * 0.7);
        m.setPosition(ctx.fanX[i], 0, ctx.fanZ[i]);
        ctx.blades.setMatrixAt(i, m);
      }
      ctx.blades.instanceMatrix.needsUpdate = true;
      // breeze
      if (frac > 0.3) { ctx.wind.mesh.visible = true; ctx.wind.speed = s.windMs * 3 * frac; }
      ctx.wind.tick(dt, ctx.player.x, ctx.player.z);
      if (t > s.spread + 5 && !ctx.done) {
        ctx.done = true;
        const GW = 8e9 * s.watts / 1e9;
        ctx.finish([
          ['Fans on', '8 billion'],
          ['Electricity draw', '≈ ' + Math.round(GW) + ' GW ≈ ' + Math.round(GW / 3300 * 100) + '% of world average generation'],
          ['One hour of use', '≈ ' + Math.round(GW) + ' GWh ≈ ' + Math.round(GW / 3300 * 100) + '% of one hour of world electricity'],
          ['Breeze where you stand', s.windMs.toFixed(1) + ' m/s - a pleasant fan breeze'],
          ['Global wind effect', 'none - the flows cancel and dissipate within metres'],
        ], ['Aftermath: the blades keep spinning while power lasts. The streaks are an authored airflow visualization; the GW figures are the estimate.']);
      }
    }
  },
  onAftermath(ctx) { ctx.audio.startMurmur(0.03, 40); },
};
function mergeTwo(a, b) {
  const g = new THREE.BufferGeometry();
  const pa = a.attributes.position.array, pb = b.attributes.position.array;
  const na = a.attributes.normal.array, nb = b.attributes.normal.array;
  const ia = a.index.array, ib = b.index.array;
  const pos = new Float32Array(pa.length + pb.length);
  pos.set(pa); pos.set(pb, pa.length);
  const nor = new Float32Array(na.length + nb.length);
  nor.set(na); nor.set(nb, na.length);
  const idx = new Uint16Array(ia.length + ib.length);
  idx.set(ia);
  for (let i = 0; i < ib.length; i++) idx[ia.length + i] = ib[i] + pa.length / 3;
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  return g;
}
