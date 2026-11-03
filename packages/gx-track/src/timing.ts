import type { TrackModel } from './model';
import { deltaS } from './query';

/** Serialisable lap/sector timer. Times are sim seconds. */
export interface LapTimerState {
  /** Laps completed since the first line crossing. */
  lapsCompleted: number;
  /** True once the car has crossed the start/finish line at least once. */
  started: boolean;
  lapStartT: number;
  sector: number;
  sectorStartT: number;
  currentSectors: number[];
  lastLapT: number;
  bestLapT: number;
  lastSectors: number[];
  bestSectors: number[];
  /** Sum of best sectors (theoretical best), NaN until all set. */
  lastEvent: 'none' | 'lap' | 'sector';
}

export function createLapTimer(track: TrackModel): LapTimerState {
  const ns = track.sectorS.length + 1;
  return {
    lapsCompleted: 0,
    started: false,
    lapStartT: 0,
    sector: 0,
    sectorStartT: 0,
    currentSectors: new Array<number>(ns).fill(NaN),
    lastLapT: NaN,
    bestLapT: NaN,
    lastSectors: new Array<number>(ns).fill(NaN),
    bestSectors: new Array<number>(ns).fill(NaN),
    lastEvent: 'none',
  };
}

/** Max plausible forward travel in one sim step; larger jumps (resets) are ignored. */
const MAX_STEP_TRAVEL_M = 25;

/**
 * Advance the timer from (sPrev at tPrev) to (sNew at tNew). Crossing times are
 * linearly interpolated inside the step so lap times are not quantised to 1/120 s.
 */
export function updateLapTimer(
  st: LapTimerState,
  track: TrackModel,
  sPrev: number,
  sNew: number,
  tPrev: number,
  tNew: number,
): void {
  st.lastEvent = 'none';
  const d = deltaS(track, sPrev, sNew);
  if (d <= 0 || d > MAX_STEP_TRAVEL_M) return;
  const L = track.length;
  const crossT = (lineS: number): number | null => {
    // forward distance from sPrev to the line
    let toLine = lineS - sPrev;
    if (toLine <= 0) toLine += L;
    if (toLine > d) return null;
    return tPrev + (tNew - tPrev) * (toLine / d);
  };

  // Sector lines (only meaningful once a lap is running)
  if (st.started) {
    const boundary = track.sectorS[st.sector];
    if (boundary !== undefined) {
      const t = crossT(boundary);
      if (t !== null) {
        st.currentSectors[st.sector] = t - st.sectorStartT;
        st.sectorStartT = t;
        st.sector++;
        st.lastEvent = 'sector';
      }
    }
  }
  const tLine = crossT(0);
  if (tLine !== null) {
    if (st.started && st.sector === track.sectorS.length) {
      st.currentSectors[st.sector] = tLine - st.sectorStartT;
      const lap = tLine - st.lapStartT;
      st.lastLapT = lap;
      if (!(st.bestLapT <= lap)) st.bestLapT = lap;
      for (let k = 0; k < st.currentSectors.length; k++) {
        const v = st.currentSectors[k]!;
        st.lastSectors[k] = v;
        if (!(st.bestSectors[k]! <= v)) st.bestSectors[k] = v;
      }
      st.lapsCompleted++;
      st.lastEvent = 'lap';
    }
    st.started = true;
    st.lapStartT = tLine;
    st.sectorStartT = tLine;
    st.sector = 0;
    st.currentSectors.fill(NaN);
  }
}

/** Invalidate the running lap (e.g. after a reset to track). */
export function abortLap(st: LapTimerState): void {
  st.started = false;
  st.sector = 0;
  st.currentSectors.fill(NaN);
}
