# Known deviations and stale-context risks

_Last updated: 2026-06-08_

This file records places where old chats, README text, PR history, or current implementation may not line up cleanly. Treat this as a cleanup queue, not as blame.

## 1. Old chats are not a durable source of truth

Several older conversations may be unavailable or truncated. Future decisions should be reconstructed from:

1. Current code.
2. Tests.
3. Merged PR descriptions and review threads.
4. README and `docs/implementation`.
5. Only then, remembered chat context.

## 2. README carries too much implementation detail

The README currently contains product direction, stack, security rules, implemented surfaces, EmbeddingGemma details, next phase, and compliance caveats.

Deviation:

- This makes the README useful but also easy to stale.

Resolution path:

- Keep README as a concise entry point.
- Move detailed current-state and implementation sequencing into `docs/implementation`.
- Link README to these docs.

## 3. EmbeddingGemma active/default wording may be stale

The README still has wording from an earlier state where EmbeddingGemma was a preferred candidate and the deterministic fallback remained active.

Later PR history includes work titled `Enable EmbeddingGemma as default local embeddings`, then artifact-cache and verified-cache hardening.

Resolution path:

- Reconcile README against the actual provider-selection code after PR #20 is resolved.
- Use `embedding-gemma-status.md` as the detailed implementation note.
- State clearly whether the runtime prefers EmbeddingGemma by default with fallback, or whether it is still gated.

## 4. PR #20 is not the same as `master` until merged

PR #20 contains manifest/unpinned-artifact policy hardening that should not be silently assumed to exist on `master` until it is merged or superseded.

Resolution path:

- Merge PR #20 after resolving docs drift, or create a replacement hardening PR.
- Update this file and `embedding-gemma-status.md` after merge.

## 5. Production trust is not complete

The local passkey/app-lock flow is a foundation. Production sync/session trust still requires server-issued challenges and server-side verification.

Resolution path:

- Keep lock/session language precise.
- Do not describe the current flow as full production identity/session security.
- Add server challenge verification only when a server/session architecture is intentionally introduced.

## 6. Document import is planned, not complete

The repo has OPFS vault helpers and encrypted-storage direction. The full document import lifecycle still needs implementation.

Resolution path:

- Implement encrypted-before-write import.
- Avoid durable decrypted storage.
- Add tests for encrypted-only OPFS writes and safe audit metadata.

## 7. Chat, tasks, and calendar are placeholder/future surfaces

The app shell names these surfaces, but full production behavior is not complete.

Resolution path:

- Add local records first.
- Add outbox/idempotency/retry behavior before network claims.
- Keep user-facing breadth behind tested local data boundaries.

## 8. Compliance language must remain conservative

This repository establishes technical foundations such as local-first storage, encryption boundaries, conservative caching, audit foundations, and privacy-safe local search. It is not a complete compliance program.

Resolution path:

- Keep compliance notes framed as non-claims.
- Require operational controls, vendor agreements, risk analysis, incident response, access reviews, retention policies, and evidence collection before stronger claims.
