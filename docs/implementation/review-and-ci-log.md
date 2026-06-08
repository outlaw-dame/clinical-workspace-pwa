# Review and CI recovery log

_Last updated: 2026-06-08_

This file preserves the practical recovery context that would otherwise be trapped in old chats or PR threads.

## Repository verification gate

Standard code validation:

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

CI is expected to run install, typecheck, lint, tests, and production build on pull requests and pushes to `master`.

## Relevant implementation history

Recent search/embedding work has been the active implementation thread:

- Initial secure local-first PWA scaffold added Solid/Vite/TypeScript, adaptive UI, local-first storage boundaries, Web Crypto helpers, OPFS vault helpers, conservative service-worker caching, CI, and documentation.
- Passkey/encrypted-notes work added local passkey ceremony support, AES-GCM encryption, persistent non-extractable browser data-key storage, encrypted notes in PGlite, lock-session cleanup, Notes UI wiring, parallel note decryption, and fallback hardening.
- Local hybrid search work added PGlite search schema, pgvector wiring, query sanitation, deterministic embedding scaffold, lexical/semantic ranking, reciprocal-rank fusion, privacy-safe search audit metadata, serialized audit hash-chain writes, repair work, indexes, and tests.
- Search repair hardening extracted lexical scoring and repair planning, added debounced/batched repair scheduling, and preserved the secure-note search API.
- EmbeddingGemma default-provider work added a worker-backed provider, fallback behavior, vector post-processing, provider-specific dimensions, 256-dimensional search table support, and ES-module worker build handling.
- Artifact-integrity work added pinned model artifact metadata, validation, tests, and README notes.
- Verified artifact-cache work added bounded retry/backoff, SHA-256 verification, stale-cache deletion, verification error support, and provider preflight before worker model load.
- Cache review fixes cleared failed verification promises, avoided memoizing caller-scoped abort signals, treated aborts as cancellation, preserved retry context safely, and made worker loading serve pinned artifacts from the verified cache with hash checks.
- Verified-cache hardening failed closed for unpinned files under the pinned model revision and added focused verification memoization tests.

## PR #20 recovery note

PR #20 / `feat/gemma-manifest` addressed a security review about unpinned embedding artifacts.

Important result:

- Unpinned artifacts should be limited to metadata roles only.
- Runtime-critical graph/data/tokenizer artifacts must stay pinned by SHA-256 integrity metadata.
- Unsupported unpinned roles should throw `invalid_manifest` rather than being accepted.
- Duplicate pinned/unpinned artifact paths should remain rejected.

The reviewed PR head was `cf94cc48a20fd185c7fb00c162659d0437941820`. CI for that head was reported green for install/typecheck/lint/tests/build during the recovery work. The review thread was replied to, but thread resolution may still need manual GitHub action if the connector cannot mark it resolved.

## Documentation recovery note

This documentation recovery started because old project chats may not load reliably. Going forward:

- Keep implementation state in repo docs.
- Update docs with every security-sensitive PR.
- Prefer small PRs with clear validation notes.
- Do not let chat memory be the only place where implementation decisions live.

## CI caveat for docs-only commits

Docs-only commits may not need local test execution, but if they change README instructions, package scripts, CI behavior, security rules, model policy, or implementation claims, they should still be reviewed carefully for consistency with code.
