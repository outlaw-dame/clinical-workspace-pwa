# EmbeddingGemma status

_Last updated: 2026-06-08_

This document is the implementation status note for local embedding work.

## Current model direction

- Model package target: `onnx-community/embeddinggemma-300m-ONNX`.
- Base model reference: `google/embeddinggemma-300m`.
- Runtime direction: worker-backed local transformer runtime.
- Selected index dimensions: 256 from a 768-dimensional base embedding.
- Supported dimensions: 768, 512, 256, and 128.
- Default dtype direction: `q4`, with `q8` and `fp32` fallback policy.

## Current implementation state

Implemented on `master`:

- Worker-backed EmbeddingGemma provider path.
- Preferred EmbeddingGemma provider when local transformer worker runtime support is available.
- Deterministic session fallback for unsupported runtimes, model load failures, artifact verification failures, and non-abort provider errors.
- 768-to-256 vector post-processing work.
- Provider-specific dimensions for indexing.
- 256-dimensional search table path.
- Pinned artifact metadata and validation.
- Verified artifact cache preflight.
- Bounded retry/backoff for artifact verification.
- Stale-cache deletion on hash mismatch.
- Worker loader hardening for pinned model-revision files.
- Verification memoization that avoids binding shared verification to caller abort signals.
- Explicit unpinned artifact metadata support for loader-required metadata files.
- Metadata-only unpinned artifact roles.
- Rejection of unsupported unpinned roles.
- Regression coverage for unsupported unpinned roles.
- Runtime troubleshooting and manual QA guide in `docs/implementation/embedding-gemma-runtime-qa.md`.

## PR #20 status

PR #20 / `feat/gemma-manifest` is merged into `master` as `97bfeb9fe8c5f090857e94cec3eb9db86041348d`.

That merge made the manifest and unpinned-artifact policy update part of the default branch:

- `model-metadata` and `tokenizer-metadata` are the only allowed unpinned roles.
- Runtime model and tokenizer files remain pinned.
- Duplicate pinned/unpinned paths remain invalid.
- Unsupported unpinned roles are rejected with `invalid_manifest`.

The reviewed PR head was `cf94cc48a20fd185c7fb00c162659d0437941820`; CI was green for install/typecheck/lint/tests/build on that head before merge. GitHub did not return a workflow run for the squash merge commit during the merge follow-up.

## Future rules

- Keep runtime model and tokenizer files pinned.
- Keep unpinned entries limited to documented metadata files.
- Validate embedding dimensions before indexing.
- Keep deterministic fallback available when runtime support, model load, cache support, or artifact verification fails.
- Do not persist raw query text or decrypted note content as part of embedding/search metadata.
- Preserve cancellation behavior without poisoning shared verification state.
- Clear failed verification promises so a transient failure can recover.

## Remaining work

1. Execute and record manual QA results for first-run model download/cache, offline reload, cache corruption, and fallback behavior.
2. Confirm whether each intentionally unpinned metadata file is non-critical and keep the rationale documented.
3. Keep artifact-policy tests aligned with every artifact role introduced by model-manifest changes.
4. Add browser-level/e2e coverage for worker startup and fallback behavior when the test harness is ready.
