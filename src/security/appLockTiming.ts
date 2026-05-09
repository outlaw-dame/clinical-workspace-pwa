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

export function shouldLockForIdleTimeout(
  lastActivityAt: ActivityClockSnapshot,
  now: ActivityClockSnapshot,
  idleTimeoutMs: number
): boolean {
  const wallClockElapsedMs = now.wallTimeMs - lastActivityAt.wallTimeMs;
  const monotonicElapsedMs = now.monotonicTimeMs - lastActivityAt.monotonicTimeMs;

  return wallClockElapsedMs >= idleTimeoutMs || monotonicElapsedMs >= idleTimeoutMs;
}
