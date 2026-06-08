# EmbeddingGemma status

_Last updated: 2026-06-08_

This document exists because recent work has moved quickly and the README can become stale. Treat this file as the implementation status note for local embedding work.

## Current model direction

- Candidate model package target: `onnx-community/embeddinggemma-300m-ONNX`.
- Base model reference: `google/embeddinggemma-300m`.
- Runtime direction: worker-backed local transformer runtime.
- Selected index dimensions: 256 from a 768-dimensional base embedding.
- Supported dimensions: 768, 512, 256, and 128.
- Default dtype direction: `q4`, with `q8` and `fp32` fallback policy.

## Current implementation state

Implemented on `master` before this documentation pass:

- Worker-backed EmbeddingGemma provider path.
- Deterministic fallback provider for unsupported runtimes or load failures.
- 768-to-256 vector post-processing work.
- Provider-specific dimensions for indexing.
- 256-dimensional search table path.
- Pinned artifact integrity metadata and validation.
- Verified artifact cache preflight.
- Bounded retry/backoff for artifact verification.
- Stale-cache deletion on hash mismatch.
- Worker loader hardening so pinned model-revision files are served from the verified cache path with hash checks before use.
- Verification memoization that avoids binding shared verification to caller abort signals.

## Pending PR #20 state

At the time of this pass, PR #20 / `feat/gemma-manifest` had additional manifest and unpinned-artifact policy hardening work:

- Explicit unpinned artifact metadata support.
- Metadata-only unpinned artifact roles.
- Rejection of unsupported unpinned roles so critical graph/tokenizer artifacts cannot bypass integrity checks.
- Regression coverage for unsupported unpinned roles.
- CI was reported green for install/typecheck/lint/tests/build on head `cf94cc48a20fd185c7fb00c162659d0437941820`.

Do not treat PR #20 behavior as part of `master` until it is merged or the branch is intentionally rebased into the docs baseline.

## Security rules for future embedding work

- Never load runtime-critical model graph/data/tokenizer artifacts without pinned integrity metadata.
- Never let an unpinned metadata exception become a bypass for graph, data, tokenizer JSON, or tokenizer model files.
- Always validate embedding dimensions before indexing.
- Always keep deterministic fallback available when runtime support, model load, cache support, or artifact verification fails.
- Do not persist raw query text or decrypted note content as part of embedding/search metadata.
- Preserve cancellation behavior without poisoning shared verification state.
- Clear failed verification promises so a transient failure can recover.

## Remaining work

Recommended remaining work before treating the embedding path as production-ready:

1. Merge or intentionally supersede PR #20's manifest and unpinned-artifact policy hardening.
2. Reconcile the README with the true provider-default state after PR #16 and later cache-hardening PRs.
3. Add a short operator-facing troubleshooting note for unsupported browser/runtime/cache cases.
4. Add manual QA notes for first-run model download/cache, offline reload, cache corruption, and fallback behavior.
5. Confirm whether any model metadata files are intentionally unpinned and document why they are non-critical.
6. Keep artifact-policy tests aligned with every artifact role introduced by model-manifest changes.
