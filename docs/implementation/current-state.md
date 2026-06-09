# Current implementation state

_Last updated: 2026-06-08_

This document describes the codebase as it exists in the repository. It is not a promise that every target workspace capability is complete.

## Baseline

- Repository: `outlaw-dame/clinical-workspace-pwa`.
- Default branch: `master`.
- Implementation baseline before documentation recovery: `115b78de0bb76c7694e8d5e34fa9da63a08adf18` (`Harden EmbeddingGemma verified cache loading`).
- Documentation recovery began with `ad31a9ef0eaf93d5f8b2e481a110bac98f5119da`.
- PR #20 / `feat/gemma-manifest` has been merged into `master` as `97bfeb9fe8c5f090857e94cec3eb9db86041348d`.
- README EmbeddingGemma status was reconciled after that merge in `8fce878b484790ba2d2ad3d7335766bd1cc30c29`.

## Product direction

The product is a secure local-first workspace PWA. The intended surface combines secure notes, chat, calendar, tasks, and encrypted document storage while preserving a strict local-first private-data boundary.

The current codebase is a scaffold and foundation. It should not be represented as a complete production workspace or a complete compliance program.

## Current stack

- Vite.
- SolidJS.
- TypeScript.
- PGlite with pgvector wiring.
- Vite PWA / Workbox.
- Web Crypto API.
- Origin Private File System helpers.
- Custom CSS design tokens and primitives.
- Custom semantic SVG icon wrapper.
- Vitest-focused unit tests.

## Implemented application surfaces

Implemented or scaffolded today:

- Secure lock screen.
- Passkey setup/unlock foundation.
- Adaptive app shell.
- Today view.
- Encrypted secure notes.
- Local hybrid search over secure notes.
- Local embedding-provider boundary.
- Deterministic fallback embedding provider.
- Worker-backed EmbeddingGemma provider path with session fallback.
- EmbeddingGemma manifest, artifact integrity policy, unpinned metadata policy, and verified cache hardening work.
- Injectable local search repository boundary.
- Privacy-safe audit-event writes with serialized hash-chain updates.
- Background/batched search-index repair.
- Placeholder surfaces for Chat, Calendar, and Documents.
- Local-first diagnostics for Web Crypto, OPFS, PGlite, and local search schema initialization.
- Platform capability dashboard.

## Implemented local data boundaries

The current local-first boundary includes:

- Encrypted note content persisted locally.
- Search tables that avoid persisting decrypted note text.
- Query text excluded from audit metadata.
- Previews generated from decrypted in-memory notes only after unlock.
- Service-worker rules intended to prevent sensitive API/decrypted routes from being cached.
- OPFS vault helpers that should only accept encrypted bytes.

## Implemented search and embedding foundation

The search foundation includes:

- PGlite-backed local search schema.
- Query sanitation.
- Lexical and semantic ranking scaffolding.
- Reciprocal-rank fusion.
- Deterministic local embedding fallback.
- Preferred EmbeddingGemma provider when local transformer worker runtime support is available.
- Session fallback to deterministic embeddings for unsupported runtimes, model load failures, artifact verification failures, and non-abort provider errors.
- Provider-specific dimensions so future embedding migrations can be reasoned about.
- 64-dimensional fallback index and 256-dimensional EmbeddingGemma index planning/implementation work.
- Search-index repair planning and batched repair scheduling.
- Verified EmbeddingGemma artifact-cache preflight and cache hardening on `master`.
- Metadata-only unpinned artifact policy for non-critical model/tokenizer metadata required by the loader.

## Not complete yet

The following must still be treated as incomplete unless a later PR proves otherwise:

- Full production sync/session trust.
- Server-issued WebAuthn challenge flow and server-side signature verification.
- Production chat.
- Production task/calendar records.
- Production encrypted document import UI.
- End-to-end document lifecycle with encrypted OPFS persistence and safe previews.
- Production observability/log-retention policy.
- Deployment governance, vendor agreements, risk analysis, incident response, access reviews, retention policies, and evidence collection.
- Manual QA/e2e coverage for browser-specific PWA behavior.

## Verification commands

Use the repository standard verification gate before merging implementation changes:

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

The CI workflow is expected to run install, typecheck, lint, tests, and production build on pull requests and pushes to `master`.
