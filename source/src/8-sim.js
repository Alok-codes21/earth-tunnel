import { R_EARTH, gravity } from './prem.js';
export const OMEGA = 7.2921159e-5; // rad/s, Earth sidereal rotation rate
const d2r = Math.PI / 180;
const norm = (a) => Math.hypot(a[0], a[1], a[2]);
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

// Earth-fixed frame: z = rotation axis. Entry at latitude lat, longitude 0.
export function tunnelGeometry(latDeg, azDeg, arcDeg) {
  const lat = latDeg * d2r;
  const P1 = [R_EARTH * Math.cos(lat), 0, R_EARTH * Math.sin(lat)];
  const up = [Math.cos(lat), 0, Math.sin(lat)];
  const east = [0, 1, 0];
  const north = [-Math.sin(lat), 0, Math.cos(lat)];
  const az = azDeg * d2r;
  const h = [north[0] * Math.cos(az) + east[0] * Math.sin(az), north[1] * Math.cos(az) + east[1] * Math.sin(az), north[2] * Math.cos(az) + east[2] * Math.sin(az)];
  const th = arcDeg * d2r;
  const P2 = [0, 1, 2].map((i) => R_EARTH * (up[i] * Math.cos(th) + h[i] * Math.sin(th)));
  const d = sub(P2, P1);
  const L = norm(d);
  const u = d.map((x) => x / L);
  // closest approach to centre along the chord
  const sMin = -dot(P1, u);
  const closest = norm([P1[0] + sMin * u[0], P1[1] + sMin * u[1], P1[2] + sMin * u[2]]);
  return { P1, P2, u, L, closest };
}

// Acceleration along the tunnel (m/s^2), plus the sideways wall load per unit mass.
export function accel(geo, s, v, opt) {
  const x = [geo.P1[0] + s * geo.u[0], geo.P1[1] + s * geo.u[1], geo.P1[2] + s * geo.u[2]];
  const r = norm(x);
  const g = gravity(r, opt.uniform);
  const gv = r > 1e-6 ? x.map((c) => (-g * c) / r) : [0, 0, 0];
  let total = gv;
  let cor = [0, 0, 0];
  if (opt.rotation) {
    const cen = [OMEGA * OMEGA * x[0], OMEGA * OMEGA * x[1], 0];
    total = [total[0] + cen[0], total[1] + cen[1], total[2] + cen[2]];
    cor = cross([0, 0, -2 * OMEGA], [v * geo.u[0], v * geo.u[1], v * geo.u[2]]);
  }
  const along = dot(total, geo.u);
  // dynamic pressure drag, quasi-steady, constant density rho (kg/m^3) scaled by shaft pressure
  const drag = 0.5 * opt.rho * opt.cdaOverM * v * Math.abs(v);
  const side = norm(sub(total, geo.u.map((c) => c * along))) ;
  const sideCor = norm(sub(cor, geo.u.map((c) => c * dot(cor, geo.u))));
  return { a: along - drag, r, g, wall: Math.hypot(side, sideCor), coriolisWall: sideCor };
}

export function step(geo, st, dt, opt) {
  // RK4 on (s, v)
  const f = (s, v) => accel(geo, s, v, opt).a;
  const k1v = f(st.s, st.v), k1s = st.v;
  const k2v = f(st.s + 0.5 * dt * k1s, st.v + 0.5 * dt * k1v), k2s = st.v + 0.5 * dt * k1v;
  const k3v = f(st.s + 0.5 * dt * k2s, st.v + 0.5 * dt * k2v), k3s = st.v + 0.5 * dt * k2v;
  const k4v = f(st.s + dt * k3s, st.v + dt * k3v), k4s = st.v + dt * k3v;
  st.s += (dt / 6) * (k1s + 2 * k2s + 2 * k3s + k4s);
  st.v += (dt / 6) * (k1v + 2 * k2v + 2 * k3v + k4v);
  st.t += dt;
}

// Headless full run used by the game for results and by tests.
export function run(geo, opt, v0 = 0, tMax = 4 * 3600) {
  const st = { s: 0, v: v0, t: 0 };
  let vmax = 0, prev = { ...st };
  const dt = 0.25;
  while (st.t < tMax) {
    prev = { ...st };
    step(geo, st, dt, opt);
    vmax = Math.max(vmax, Math.abs(st.v));
    if (st.s >= geo.L) {
      const f = (geo.L - prev.s) / (st.s - prev.s);
      return { outcome: 'exit', t: prev.t + f * dt, v: prev.v + f * (st.v - prev.v), vmax };
    }
    if (st.v < 0 && prev.v >= 0 && st.t > 1) return { outcome: 'short', t: st.t, s: st.s, short: geo.L - st.s, vmax };
  }
  return { outcome: 'timeout', t: st.t, s: st.s, vmax };
}
