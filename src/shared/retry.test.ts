import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getBackoffDelayMs, retryWithBackoff } from "./retry";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("getBackoffDelayMs", () => {
  it("caps exponential delay and adds bounded jitter", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);

    expect(
      getBackoffDelayMs(3, {
        attempts: 3,
        baseDelayMs: 100,
        maxDelayMs: 250,
        jitterRatio: 0.2
      })
    ).toBe(275);
  });
});

describe("retryWithBackoff", () => {
  it("retries failed tasks and returns the eventual value", async () => {
    const task = vi.fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error("temporary"))
      .mockResolvedValueOnce("ok");

    const resultPromise = retryWithBackoff(task, {
      attempts: 2,
      baseDelayMs: 100,
      maxDelayMs: 100,
      jitterRatio: 0
    });

    await vi.advanceTimersByTimeAsync(100);
    await expect(resultPromise).resolves.toBe("ok");
    expect(task).toHaveBeenCalledTimes(2);
  });

  it("does not retry when shouldRetry returns false", async () => {
    const error = new Error("permanent");
    const task = vi.fn<() => Promise<string>>().mockRejectedValue(error);

    await expect(
      retryWithBackoff(task, {
        attempts: 3,
        baseDelayMs: 100,
        maxDelayMs: 100,
        shouldRetry: () => false
      })
    ).rejects.toBe(error);
    expect(task).toHaveBeenCalledTimes(1);
  });

  it("preserves non-error failure context", async () => {
    const task = vi.fn<() => Promise<string>>().mockRejectedValue("temporary string failure");

    await expect(
      retryWithBackoff(task, {
        attempts: 1,
        baseDelayMs: 100,
        maxDelayMs: 100
      })
    ).rejects.toThrow("Retry task failed: temporary string failure");
  });

  it("rejects promptly when aborted during delay", async () => {
    const controller = new AbortController();
    const task = vi.fn<() => Promise<string>>().mockRejectedValue(new Error("temporary"));

    const resultPromise = retryWithBackoff(task, {
      attempts: 2,
      baseDelayMs: 100,
      maxDelayMs: 100,
      jitterRatio: 0,
      signal: controller.signal
    });

    controller.abort();
    await expect(resultPromise).rejects.toMatchObject({ name: "AbortError" });
  });
});
