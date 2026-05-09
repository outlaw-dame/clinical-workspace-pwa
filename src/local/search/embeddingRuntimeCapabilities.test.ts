import { describe, expect, it } from "vitest";
import { canUseLocalTransformerWorkerRuntime } from "./embeddingRuntimeCapabilities";

describe("canUseLocalTransformerWorkerRuntime", () => {
  it("requires both Web Workers and WebAssembly", () => {
    expect(
      canUseLocalTransformerWorkerRuntime({
        webWorker: true,
        webAssembly: true,
        webGpu: false
      })
    ).toBe(true);
  });

  it("does not require WebGPU for CPU/WASM fallback eligibility", () => {
    expect(
      canUseLocalTransformerWorkerRuntime({
        webWorker: true,
        webAssembly: true,
        webGpu: false
      })
    ).toBe(true);
  });

  it("rejects runtimes without workers", () => {
    expect(
      canUseLocalTransformerWorkerRuntime({
        webWorker: false,
        webAssembly: true,
        webGpu: true
      })
    ).toBe(false);
  });

  it("rejects runtimes without WebAssembly", () => {
    expect(
      canUseLocalTransformerWorkerRuntime({
        webWorker: true,
        webAssembly: false,
        webGpu: true
      })
    ).toBe(false);
  });
});
