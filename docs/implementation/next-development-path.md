# Next development path

_Last updated: 2026-06-08_

This is the recommended path to resume development cleanly from the current codebase without depending on old chat history.

## Current working priority

The safest next priority is not broad feature expansion. The immediate priority is to keep the local embedding/search foundation stable, preserve the private-data boundary, and then add user-facing workspace records in small slices.

## Non-goals for the next cycle

Do not start these until the guardrails below are complete:

- Production claims.
- Production chat networking.
- Production document collaboration.
- Analytics/session replay.
- Cloud sync of decrypted content.
- Remote semantic search over decrypted notes.
- Broad feature surfaces that bypass lock, audit, search, or encryption boundaries.

## Completed recovery steps

### Step 1 — Implementation documentation recovery

Status: complete enough to serve as the current truth layer.

Delivered:

- `docs/implementation/current-state.md`.
- `docs/implementation/security-boundaries.md`.
- `docs/implementation/embedding-gemma-status.md`.
- `docs/implementation/known-deviations.md`.
- `docs/implementation/review-and-ci-log.md`.
- README link to this documentation directory.

### Step 2 — PR #20 / EmbeddingGemma manifest hardening

Status: merged.

Delivered:

- PR #20 merged into `master` as `97bfeb9fe8c5f090857e94cec3eb9db86041348d`.
- Unpinned artifact roles are metadata-only.
- Duplicate pinned/unpinned paths fail validation.
- Unsupported unpinned roles have regression coverage.
- The PR head CI was green before merge.

### Step 3 — README EmbeddingGemma reconciliation

Status: complete for current repo state.

Delivered:

- README no longer says EmbeddingGemma is inactive.
- README now states EmbeddingGemma is preferred when local transformer worker runtime support is available.
- README now states deterministic embeddings remain the fallback for unsupported runtime/provider failure cases.
- Detailed implementation status lives in `docs/implementation/embedding-gemma-status.md`.

### Step 4 — EmbeddingGemma runtime troubleshooting and QA notes

Status: complete as a documentation baseline.

Delivered:

- `docs/implementation/embedding-gemma-runtime-qa.md`.
- Runtime capability checklist for Worker and WebAssembly support.
- Artifact cache capability checklist.
- First-run model load checklist.
- Offline reload checklist.
- Corrupted-cache checklist.
- Worker failure, timeout, abort, and fallback checklist.
- Manual QA record template.

### Step 5 — Chat/outbox domain foundation

Status: initial local foundation complete, sync processing still pending.

Delivered:

- `chat_messages` local table.
- Local chat message repository functions.
- Encrypted local chat message payload storage.
- Encrypted `sync_outbox` payload enqueue for `chat.message.send`.
- Local optimistic delivery states: `queued`, `sending`, `sent`, and `failed`.
- Stable chat message idempotency keys.
- Bounded exponential retry scheduling helper.
- Unit tests for draft sanitation, idempotency keys, and retry scheduling.
- `docs/implementation/chat-outbox-status.md`.

## Ordered next steps

### Step 5b — Add outbox dequeue/claim and sender processing

Deliverables:

- Due-operation query for `sync_outbox` records whose `next_attempt_at` is due.
- Claim/update API that prevents duplicate in-process sends.
- Injected sender boundary so tests can simulate success, retryable failure, and terminal failure.
- Local chat delivery-state updates from outbox results.
- Tests for duplicate idempotency handling, stale responses, retryable failures, terminal failures, and local rollback boundaries.

Exit criteria:

- Local chat messages can move from queued to sent/failed through a tested sync boundary without adding a production network dependency.

### Step 6 — Add encrypted document import slice

Deliverables:

- Import flow that encrypts before writing to OPFS.
- No decrypted bytes written to durable browser storage.
- Safe metadata model.
- Audit events for import/open/delete attempts without storing sensitive content.
- Tests for encrypted-only OPFS boundary.

Exit criteria:

- Documents can enter the local vault without weakening the encrypted-storage boundary.

### Step 7 — Add task/calendar records as workspace primitives

Deliverables:

- Local task records.
- Local calendar/event records.
- Today view integration.
- Search/audit integration if appropriate.
- Tests for date/time validation and local persistence.

Exit criteria:

- Tasks and calendar fit the workspace surface without becoming a separate project-management module.

### Step 8 — Expand audit coverage

Deliverables:

- Lock/unlock audit events.
- Sensitive local-write audit events.
- Document access audit events.
- Sync attempt audit events.
- Privacy-safe audit metadata policy tests.

Exit criteria:

- Audit coverage expands without storing decrypted content, raw query text, tokens, keys, or file contents.

## Standard validation gate

For code changes, run:

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

For docs-only changes, CI may still run the full repository gate. Do not skip code validation when docs and implementation change together.
