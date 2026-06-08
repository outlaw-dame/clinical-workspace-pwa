# Clinical Workspace PWA implementation docs

This directory is the durable implementation truth layer for `clinical-workspace-pwa`.

Use these docs when old chat history is unavailable or truncated. The repository state and merged PR history are the source of truth. Planning notes and chat context can inform direction, but they must not override implemented code, tests, security boundaries, or CI results.

## Read order

1. `current-state.md` — what the repo implements today.
2. `security-boundaries.md` — security and privacy rules that future work must preserve.
3. `embedding-gemma-status.md` — current local embedding runtime status and remaining activation/hardening work.
4. `next-development-path.md` — recommended build order from this baseline.
5. `known-deviations.md` — places where README, planning notes, or implementation history may be stale or ambiguous.
6. `review-and-ci-log.md` — review/CI recovery notes that explain why recent hardening work happened.

## Maintenance rule

Every feature PR that materially changes local storage, lock/session behavior, service-worker policy, search, embeddings, sync, audit, or clinical-data handling should update this directory in the same PR.

Do not claim HIPAA compliance from these docs. The repo is a technical foundation for a HIPAA-oriented product, not a complete compliance program.
