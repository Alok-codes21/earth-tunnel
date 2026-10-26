// PREM density model: Dziewonski & Anderson (1981), Phys. Earth Planet. Inter. 25, 297-356.
// Polynomial coefficients as tabulated in the paper (density in g/cm^3, x = r / 6371 km).
export const R_EARTH = 6371e3;
export const G = 6.67430e-11;
const RE_KM = 6371;
const LAYERS = [
  { name: 'Inner core', to: 1221.5, c: [13.0885, 0, -8.8381] },
  { name: 'Outer core', to: 3480.0, c: [12.5815, -1.2638, -3.6426, -5.5281] },
  { name: 'Lower mantle', to: 5701.0, c: [7.9565, -6.4761, 5.5283, -3.0807] },
  { name: 'Transition zone', to: 5771.0, c: [5.3197, -1.4836] },
  { name: 'Transition zone', to: 5971.0, c: [11.2494, -8.0298] },
  { name: 'Upper mantle', to: 6151.0, c: [7.1089, -3.8045] },
  { name: 'Upper mantle', to: 6346.6, c: [2.6910, 0.6924] },
  { name: 'Crust', to: 6356.0, c: [2.900] },
  { name: 'Crust', to: 6368.0, c: [2.600] },
  { name: 'Ocean', to: 6371.0, c: [1.020] },
];
export function layerAt(rKm) {
  for (const L of LAYERS) if (rKm <= L.to) return L;
  return LAYERS[LAYERS.length - 1];
}
export function densityKgM3(rM) {
  const rKm = rM / 1e3, x = rKm / RE_KM;
  const L = layerAt(rKm);
  let s = 0, p = 1;
  for (const a of L.c) { s += a * p; p *= x; }
  return s * 1000;
}
// Enclosed-mass table by numerical integration of 4 pi r^2 rho(r) dr (fine grid).
const N = 63710; // 0.1 km steps
const dr = R_EARTH / N;
const M = new Float64Array(N + 1);
for (let i = 1; i <= N; i++) {
  const r0 = (i - 1) * dr, r1 = i * dr, rm = 0.5 * (r0 + r1);
  M[i] = M[i - 1] + 4 * Math.PI * rm * rm * densityKgM3(rm) * dr;
}
export const EARTH_MASS_MODEL = M[N];
export function enclosedMass(rM) {
  const f = Math.min(Math.max(rM / dr, 0), N);
  const i = Math.floor(f);
  if (i >= N) return M[N];
  return M[i] + (M[i + 1] - M[i]) * (f - i);
}
// Gravitational acceleration magnitude at radius r (toward center) for the spherical model.
export function gravity(rM, uniform = false) {
  if (rM < 1e-3) return 0;
  if (uniform) return (G * (EARTH_MASS_MODEL) * rM) / (R_EARTH ** 3) * (rM < R_EARTH ? 1 : 0) + (rM >= R_EARTH ? G * EARTH_MASS_MODEL / rM / rM : 0);
  return (G * enclosedMass(rM)) / (rM * rM);
}
