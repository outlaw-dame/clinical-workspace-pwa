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

Status:

- README now links to `docs/implementation/README.md`.
- README EmbeddingGemma status has been reconciled after PR #20.
- Later cleanup can keep README shorter and move deeper details into this directory.

## 3. EmbeddingGemma active/default wording was stale

The README previously reflected an earlier state where EmbeddingGemma was only a preferred candidate.

Status:

- README now states that EmbeddingGemma is preferred when the local transformer worker runtime is available.
- README also states that the deterministic provider remains the session fallback for unsupported runtimes and provider failures.
- `embedding-gemma-status.md` is the detailed implementation note.

## 4. PR #20 is merged

PR #20 contained the manifest and unpinned-artifact policy update. It is now merged into `master` as `97bfeb9fe8c5f090857e94cec3eb9db86041348d`.

Status:

- Do not treat PR #20 as pending anymore.
- Continue to keep artifact policy tests aligned with future manifest changes.

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
