# EmbeddingGemma runtime troubleshooting and QA

_Last updated: 2026-06-08_

This document is the manual verification and troubleshooting guide for the local EmbeddingGemma path.

It covers the current implementation where EmbeddingGemma is preferred when the browser supports the local transformer worker runtime, while deterministic embeddings remain the session fallback for unsupported runtimes or provider failures.

## Source-of-truth code paths

Use these files when updating this guide:

- `src/local/search/embeddingModelRegistry.ts` — provider selection and session fallback behavior.
- `src/local/search/embeddingRuntimeCapabilities.ts` — runtime capability detection.
- `src/local/search/embeddingGemmaProvider.ts` — provider preflight, artifact verification, and fallback-facing errors.
- `src/local/search/embeddingArtifactCache.ts` — artifact cache verification, stale cache deletion, and download retry behavior.
- `src/local/search/embeddingGemmaWorkerClient.ts` — worker lifecycle, request timeout, abort handling, and worker error handling.
- `src/local/search/embeddingGemmaWorker.ts` — model loading, verified artifact fetch bridge, tokenizer/model calls, and embedding extraction.
- `src/local/search/embeddingGemmaArtifactPolicy.ts` — pinned artifact policy.
- `src/local/search/embeddingGemmaUnpinnedArtifacts.ts` — loader-required metadata files that are intentionally not pinned yet.

## Runtime capability checklist

EmbeddingGemma should only be attempted when the browser has:

- `Worker` support.
- `WebAssembly` support.

The current runtime gate does not require WebGPU. WebGPU is detected, but `canUseLocalTransformerWorkerRuntime()` only requires Worker and WebAssembly.

Expected behavior:

- If Worker or WebAssembly is unavailable, the app should use the deterministic provider.
- The user should not lose local search capability because EmbeddingGemma is unavailable.
- Unsupported runtime should not be treated as data loss.

Manual checks:

1. Open the app in a modern Chromium-based browser.
2. Verify local search still works after unlock.
3. In DevTools, confirm the local worker path is attempted only in a browser with Worker and WebAssembly support.
4. In a runtime where Worker or WebAssembly is unavailable, confirm search falls back without a crash.

## Artifact cache capability checklist

Artifact cache verification requires:

- Cache API via `globalThis.caches`.
- `fetch`.
- `crypto.subtle.digest`.

Expected behavior:

- If the artifact cache is unavailable, EmbeddingGemma verification returns an unavailable status and the provider falls back.
- If a cached artifact hash does not match the expected value, that cache entry is deleted and verification fails closed for that attempt.
- Downloads use `credentials: "omit"` and `cache: "reload"`.
- Artifact download retries use three attempts with bounded backoff and jitter.
- Abort errors should not be retried.

Manual checks:

1. Start from a clean browser profile or clear the `embedding-artifacts-v1` Cache Storage entry.
2. Unlock the app and perform a search that requires embeddings.
3. Verify model artifact fetches occur against the pinned model revision.
4. Verify successful artifacts are stored under the `embedding-artifacts-v1` Cache Storage bucket.
5. Reload the app and repeat search.
6. Verify cached pinned artifacts are reused only after hash verification.
7. Delete one cached artifact and repeat search.
8. Verify the missing artifact is fetched again instead of silently trusted.

## First-run model load checklist

Expected first-run flow:

1. The registry selects EmbeddingGemma if Worker and WebAssembly are available.
2. The provider validates the active manifest.
3. Required artifacts are verified before worker inference.
4. The worker loads tokenizer and model using the pinned revision and configured dtype.
5. The worker creates query/document prompts using the centralized prompt policy.
6. The worker extracts `sentence_embedding`, truncates to configured dimensions, and returns the vector.
7. If any non-abort provider failure occurs, the registry marks the session for deterministic fallback.

Manual checks:

- First-run search does not persist decrypted note text into search rows.
- A failed first-run model load does not break basic local search.
- After a non-abort provider failure, subsequent embedding calls in that session use deterministic fallback.
- Abort/cancel behavior does not permanently force fallback by itself.

## Offline reload checklist

Use this after a successful first-run artifact cache population.

1. Load the app online and perform a search that exercises EmbeddingGemma.
2. Reload the app.
3. Switch DevTools to offline mode.
4. Perform another local search.

Expected behavior:

- If all required pinned artifacts are present and valid in Cache Storage, the worker path can use the verified cached artifacts.
- If the worker/runtime still needs network-only metadata that is not cached or available, the app should fall back rather than crash.
- The UI should remain usable with deterministic local embeddings.

## Corrupted-cache checklist

1. Populate `embedding-artifacts-v1` successfully.
2. In DevTools, remove or replace one cached artifact entry if possible.
3. Reload the app.
4. Perform a search.

Expected behavior:

- Hash mismatch causes the cache entry to be deleted.
- The app attempts a fresh fetch when online.
- If the artifact cannot be reverified, the provider reports failure and the registry falls back.
- No stale artifact should be silently trusted.

## Worker failure and timeout checklist

Worker client behavior:

- Requests time out after 45 seconds.
- Worker errors reject all pending requests.
- Worker termination rejects pending requests and resets the singleton worker.
- Request aborts remove the pending request and reject with a local embedding abort error.

Manual checks:

1. Simulate slow network or blocked model download.
2. Confirm a long-running worker request does not hang indefinitely.
3. Trigger a search cancellation if the UI exposes one, or use a test harness to abort the signal.
4. Confirm abort does not poison shared artifact verification state.
5. Reload and verify the app can recover on the next attempt.

## Fallback checklist

Deterministic fallback is expected when:

- Worker support is unavailable.
- WebAssembly support is unavailable.
- Artifact cache verification fails.
- Model loading fails.
- Worker inference fails.
- Worker request times out.

Expected behavior:

- Search should remain available.
- The failure should be privacy-safe and should not log note contents or raw query text.
- The current session should prefer fallback after a non-abort provider failure.
- A fresh app session can attempt EmbeddingGemma again.

## Manual QA record template

Use this template when testing a release candidate:

```text
Date:
Commit SHA:
Browser and version:
OS:
Online first-run result:
Cache bucket populated:
Offline reload result:
Corrupted-cache result:
Fallback result:
Console warnings/errors reviewed:
Notes on unexpected behavior:
```

## Do not claim yet

Do not claim the EmbeddingGemma path is production-ready until these exist:

- Manual QA records for at least one Chromium-based browser.
- A documented unsupported-runtime fallback test.
- A documented cache-miss or cache-corruption recovery test.
- Browser-level or e2e coverage for worker startup and fallback behavior once the harness exists.
