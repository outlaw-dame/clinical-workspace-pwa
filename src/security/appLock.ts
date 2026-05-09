import { createEffect, createSignal, onCleanup } from "solid-js";
import { getActivityClockSnapshot, shouldLockForIdleTimeout } from "./appLockTiming";

const DEFAULT_IDLE_TIMEOUT_MS = 5 * 60 * 1000;
const IDLE_CHECK_INTERVAL_MS = 15_000;

export type AppLockState = {
  locked: () => boolean;
  unlock: () => void;
  lock: () => void;
  markActivity: () => void;
};

export type AppLockOptions = {
  idleTimeoutMs?: number;
  onLock?: () => void;
};

export function createAppLock(options: AppLockOptions = {}): AppLockState {
  const idleTimeoutMs = options.idleTimeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS;
  const idleCheckIntervalMs = Math.min(IDLE_CHECK_INTERVAL_MS, Math.max(1_000, idleTimeoutMs));
  const [locked, setLocked] = createSignal(true);
  let lastActivityAt = getActivityClockSnapshot();

  const lock = () => {
    options.onLock?.();
    setLocked(true);
  };

  const unlock = () => {
    lastActivityAt = getActivityClockSnapshot();
    setLocked(false);
  };

  const markActivity = () => {
    if (!locked()) {
      lastActivityAt = getActivityClockSnapshot();
    }
  };

  createEffect(() => {
    if (locked()) return;

    const interval = window.setInterval(() => {
      if (shouldLockForIdleTimeout(lastActivityAt, getActivityClockSnapshot(), idleTimeoutMs)) {
        lock();
      }
    }, idleCheckIntervalMs);

    onCleanup(() => window.clearInterval(interval));
  });

  return { locked, unlock, lock, markActivity };
}
