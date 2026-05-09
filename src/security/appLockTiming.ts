export type ActivityClockSnapshot = {
  wallTimeMs: number;
  monotonicTimeMs: number;
};

export function getActivityClockSnapshot(): ActivityClockSnapshot {
  return {
    wallTimeMs: Date.now(),
    monotonicTimeMs: performance.now()
  };
}
