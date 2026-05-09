import { createEffect, createSignal, onCleanup } from "solid-js";

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
  let lastActivityAt = performance.now();

  const lock = () => {
    options.onLock?.();
    setLocked(true);
  };

  const unlock = () => {
    lastActivityAt = performance.now();
    setLocked(false);
  };

  const markActivity = () => {
    if (!locked()) {
      lastActivityAt = performance.now();
    }
  };

  createEffect(() => {
    if (locked()) return;

    const interval = window.setInterval(() => {
      if (performance.now() - lastActivityAt >= idleTimeoutMs) {
        lock();
      }
    }, idleCheckIntervalMs);

    onCleanup(() => window.clearInterval(interval));
  });

  return { locked, unlock, lock, markActivity };
}
