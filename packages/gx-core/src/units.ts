/** Unit conversions — use only at the UI / reporting boundary. Internals are SI. */
export const MPS_TO_KPH = 3.6;
export const mpsToKph = (v: number): number => v * MPS_TO_KPH;
export const kphToMps = (v: number): number => v / MPS_TO_KPH;
export const radpsToRpm = (w: number): number => (w * 60) / (2 * Math.PI);
export const rpmToRadps = (rpm: number): number => (rpm * 2 * Math.PI) / 60;
export const radToDeg = (a: number): number => (a * 180) / Math.PI;
export const degToRad = (a: number): number => (a * Math.PI) / 180;
export const accelToG = (a: number, g = 9.81): number => a / g;
export const formatLapTime = (t: number): string => {
  if (!Number.isFinite(t)) return '--:--.---';
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s.toFixed(3).padStart(6, '0')}`;
};
