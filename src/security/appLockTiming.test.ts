import { describe, expect, it } from "vitest";
import { shouldLockForIdleTimeout, type ActivityClockSnapshot } from "./appLockTiming";

function snapshot(wallTimeMs: number, monotonicTimeMs: number): ActivityClockSnapshot {
  return { wallTimeMs, monotonicTimeMs };
}

describe("shouldLockForIdleTimeout", () => {
  it("locks when monotonic elapsed time reaches the idle timeout", () => {
    expect(shouldLockForIdleTimeout(snapshot(1_000, 500), snapshot(2_000, 5_500), 5_000)).toBe(true);
  });

  it("locks when wall-clock elapsed time reaches the idle timeout during sleep or suspension", () => {
    expect(shouldLockForIdleTimeout(snapshot(1_000, 500), snapshot(301_000, 700), 300_000)).toBe(true);
  });

  it("does not lock when neither clock reaches the idle timeout", () => {
    expect(shouldLockForIdleTimeout(snapshot(1_000, 500), snapshot(299_999, 5_499), 300_000)).toBe(false);
  });

  it("does not lock on backward wall-clock adjustment when monotonic time is still below the timeout", () => {
    expect(shouldLockForIdleTimeout(snapshot(300_000, 10_000), snapshot(100_000, 20_000), 300_000)).toBe(false);
  });
});
