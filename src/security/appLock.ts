import { createEffect, createSignal, onCleanup } from "solid-js";

const DEFAULT_IDLE_TIMEOUT_MS = 5 * 60 * 1000;

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
  const [locked, setLocked] = createSignal(true);
  const [lastActivityAt, setLastActivityAt] = createSignal(Date.now());

  const lock = () => {
    options.onLock?.();
    setLocked(true);
  };

  const unlock = () => {
    setLastActivityAt(Date.now());
    setLocked(false);
  };

  const markActivity = () => {
    if (!locked()) {
      setLastActivityAt(Date.now());
    }
  };

  createEffect(() => {
    if (locked()) return;

    const interval = window.setInterval(() => {
      if (Date.now() - lastActivityAt() >= idleTimeoutMs) {
        lock();
      }
    }, 15_000);

    onCleanup(() => window.clearInterval(interval));
  });

  return { locked, unlock, lock, markActivity };
}
