import { THREE, scene, buildSaltFlat, buildAgents, buildPlayer, resetAgent, tickAgent, addGroundFx } from '../engine.js';

function carGeometry() {
  const body = new THREE.BoxGeometry(4.2, 1.1, 1.8); body.translate(0, 0.75, 0);
  const cabin = new THREE.BoxGeometry(2.1, 0.75, 1.6); cabin.translate(-0.2, 1.55, 0);
  const pos = new Float32Array(body.attributes.position.array.length + cabin.attributes.position.array.length);
  pos.set(body.attributes.position.array); pos.set(cabin.attributes.position.array, body.attributes.position.array.length);
  const nor = new Float32Array(pos.length);
  nor.set(body.attributes.normal.array); nor.set(cabin.attributes.normal.array, body.attributes.normal.array.length);
  const ia = body.index.array, ib = cabin.index.array;
  const idx = new Uint16Array(ia.length + ib.length);
  idx.set(ia);
  for (let i = 0; i < ib.length; i++) idx[ia.length + i] = ib[i] + body.attributes.position.array.length / 3;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  return g;
}

export default {
  id: 'drive',
  title: 'EVERYONE DRIVES AT ONCE',
  subtitle: 'Everyone with a car starts driving east at the same second. How far do they get?',
  view: 'ground',
  actionWord: 'DRIVE',
  meterLabel: 'Average speed',
  settings: { carsBn: 1.5, speed: 60, spread: 4, driveFor: 20 },
  controls: [
    { id: 'carsBn', label: 'Cars worldwide', min: 0.5, max: 2.5, step: 0.1, value: 1.5, fmt: v => v.toFixed(1) + ' billion' },
    { id: 'speed', label: 'Cruise speed', min: 30, max: 100, step: 5, value: 60, fmt: v => v + ' km/h' },
    { id: 'spread', label: 'Start spread', min: 0, max: 10, step: 1, value: 4, fmt: v => v === 0 ? 'perfect sync' : v + ' s' },
    { id: 'driveFor', label: 'Drive time', min: 10, max: 40, step: 5, value: 20, fmt: v => v + ' s (compressed)' },
  ],
  note: 'Engines start, the whole field rolls east, then the brake wave hits and the plain becomes the biggest traffic jam in history. The red glow is 1.5 billion brake lights (representative sample rendered).',
  whatnot: 'no global pile-up, no running out of fuel in minutes. Everyone simply stops and idles - boring, enormous, and very real.',
  notes: ['Assumptions: ~1.5 billion cars worldwide (order of magnitude, OICA estimates), average car 4.5 m long, idle fuel use ~0.6 L/h. The rendered cars are a representative sample; spacing compresses for view.'],
  setup(api) {
    buildSaltFlat({});
    addGroundFx();
    const agents = buildAgents(0); // no pedestrians in this one
    const player = buildPlayer();
    const n = api.tierCount * 2;
    const geo = carGeometry();
    const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    const fx = { uT: { value: -1000 }, uSpread: { value: 4 }, uDur: { value: 20 }, uV: { value: 16.7 } };
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, fx);
      sh.vertexShader = ('attribute float aJit;\nuniform float uT;\nuniform float uSpread;\nuniform float uDur;\nuniform float uV;\n' + sh.vertexShader)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
{ float lt = uT - aJit * uSpread; float rt = clamp(lt, 0.0, uDur); if (rt > 0.0) transformed.x += rt * uV * (0.75 + 0.5 * aJit); }`);
    };
    const cars = new THREE.InstancedMesh(geo, mat, n);
    // brake lights
    const bGeo = new THREE.BoxGeometry(0.06, 0.18, 1.7); bGeo.translate(-2.12, 0.85, 0);
    const bMat = new THREE.MeshBasicMaterial({ color: 0xff1a12, transparent: true, opacity: 0.9 });
    const bfx = { uT: { value: -1000 }, uSpread: { value: 4 }, uDur: { value: 20 }, uV: { value: 16.7 } };
    bMat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, bfx);
      sh.vertexShader = ('attribute float aJit;\nuniform float uT;\nuniform float uSpread;\nuniform float uDur;\nuniform float uV;\nvarying float vOn;\n' + sh.vertexShader)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
{ float lt = uT - aJit * uSpread; float rt = clamp(lt, 0.0, uDur); vOn = step(0.01, rt); if (rt > 0.0) transformed.x += rt * uV * (0.75 + 0.5 * aJit); float br = step(uDur, lt) * step(lt, uDur + 400.0); transformed.y *= max(br, 0.001); transformed.z *= max(br, 0.001); }`);
      sh.fragmentShader = ('varying float vOn;\n' + sh.fragmentShader)
        .replace('#include <color_fragment>', '#include <color_fragment>\nif (vOn < 0.5) discard;');
    };
    const brakes = new THREE.InstancedMesh(bGeo, bMat, n);
    const jit = new Float32Array(n);
    const m = new THREE.Matrix4(), col = new THREE.Color();
    const COLORS = [0xd8d8d8, 0x2a2d33, 0x8c1f1f, 0x1f3f8c, 0x8c8c96, 0x3a6b3a];
    let i = 0;
    const lanes = Math.ceil(Math.sqrt(n * 7 / 6));
    for (let lane = 0; lane < lanes && i < n; lane++) {
      const z = (lane - lanes / 2) * 6;
      const perLane = Math.ceil(n / lanes);
      for (let k = 0; k < perLane && i < n; k++, i++) {
        jit[i] = Math.random();
        const x = -350 + k * 7 + (lane % 2) * 3.5;
        m.makeRotationY(0); m.setPosition(x, 0, z);
        cars.setMatrixAt(i, m); brakes.setMatrixAt(i, m);
        col.setHex(COLORS[(Math.random() * COLORS.length) | 0]);
        cars.setColorAt(i, col);
      }
    }
    cars.count = i; brakes.count = i;
    geo.setAttribute('aJit', new THREE.InstancedBufferAttribute(jit, 1));
    bGeo.setAttribute('aJit', new THREE.InstancedBufferAttribute(jit, 1));
    cars.frustumCulled = false; brakes.frustumCulled = false;
    scene.add(cars, brakes);
    player.x = 0; player.z = lanes * 3 + 14; // stand beside the lanes
    return { player, agents, cars, brakes, carFx: fx, brakeFx: bfx, simT: 0, done: false, braked: false };
  },
  onReset(ctx) {
    ctx.simT = 0; ctx.done = false; ctx.braked = false;
    ctx.carFx.uT.value = -1000; ctx.brakeFx.uT.value = -1000;
    ctx.ui.setMeter('Average speed', '0 km/h', 0, false);
    ctx.ui.setStat('Cars moving', '0%');
    ctx.ui.setTime('Time', '-');
  },
  onAction(ctx) {
    const s = ctx.settings;
    const v = s.speed / 3.6;
    ctx.carFx.uSpread.value = s.spread; ctx.carFx.uDur.value = s.driveFor; ctx.carFx.uV.value = v; ctx.carFx.uT.value = 0;
    ctx.brakeFx.uSpread.value = s.spread; ctx.brakeFx.uDur.value = s.driveFor; ctx.brakeFx.uV.value = v; ctx.brakeFx.uT.value = 0;
    ctx.audio.rumble(ctx.audio.now(), 0.3, 2.0);
    ctx.simT = 0; ctx.braked = false;
  },
  tick(ctx, dt) {
    const s = ctx.settings, S = ctx.S;
    if (S.phase === 'action') {
      ctx.simT += dt;
      const t = ctx.simT;
      ctx.ui.setTime('Time', t.toFixed(1) + ' s');
      ctx.carFx.uT.value = t; ctx.brakeFx.uT.value = t;
      let moving;
      if (s.spread === 0) moving = (t > 0 && t < s.driveFor) ? 1 : 0;
      else moving = Math.max(0, Math.min(t, s.spread) - Math.max(0, t - s.driveFor)) / s.spread;
      ctx.ui.setStat('Cars moving', Math.round(moving * 100) + '%');
      ctx.ui.setMeter(undefined, Math.round(s.speed * moving) + ' km/h', moving, false);
      if (!ctx.braked && t > s.driveFor + s.spread * 0.5) {
        ctx.braked = true;
        ctx.fx.shakeCam(0.1);
        ctx.audio.rumble(ctx.audio.now(), 0.35, 2.5); // horn-ish low murmur
        ctx.fx.triggerHaze(0.14);
      }
      if (t > s.driveFor + s.spread + 2 && !ctx.done) {
        ctx.done = true;
        const cars = s.carsBn * 1e9;
        const lineKm = cars * 4.5 / 1000;
        ctx.finish([
          ['Cars rolling', '~' + s.carsBn.toFixed(1) + ' billion'],
          ['Bumper to bumper', '~' + Math.round(lineKm).toLocaleString('en-IN') + ' km ≈ ' + Math.round(lineKm / 40075) + 'x around Earth'],
          ['Fuel idled per hour after', '~' + (cars * 0.6 / 1e9).toFixed(1) + ' billion litres (0.6 L/h per car)'],
          ['CO2 per hour idling', '~' + Math.round(cars * 0.6 * 2.31 / 1e9) + ' million tonnes'],
          ['What everyone achieved', 'the largest traffic jam in history'],
        ], ['Aftermath: the field stays jammed with brake lights glowing and engines idling - an authored standstill. The fuel and CO2 figures are the estimate.']);
      }
    }
  },
  onAftermath(ctx) { ctx.audio.startMurmur(0.06, 60); },
};
