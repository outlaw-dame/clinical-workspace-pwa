# Chat/outbox status

_Last updated: 2026-06-08_

This document tracks the local chat/outbox foundation. It does not describe a production messaging network.

## Current implementation state

Implemented on `master`:

- `chat_messages` local table for encrypted local chat message records.
- Conversation-scoped local message listing.
- Local optimistic delivery states: `queued`, `sending`, `sent`, and `failed`.
- `sync_outbox` enqueue path for `chat.message.send` operations.
- Stable message idempotency key format: `chat-message:<message-id>`.
- Exponential retry scheduling helper with bounded jitter and max delay.
- Sync outbox claim/lease columns: `claim_token`, `claimed_at`, `locked_until_at`, and `completed_at`.
- Due-operation listing for operations whose `next_attempt_at` is due and whose lock has expired or is absent.
- Claim API that leases one due operation at a time.
- Injected sender processing boundary for sent, retry, failed, and thrown-error outcomes.
- Duplicate-safe scheduler wrapper that reuses an in-flight run instead of creating concurrent in-process sends.
- Scheduler cleanup that clears the in-flight guard on both success and failure without creating unhandled cleanup promises.
- Chat delivery-state updates from outbox processing results.
- Privacy-safe audit events around local enqueue, outbox claim, send success, retry scheduling, terminal failure, and manual retry scheduling.
- Edge-case helper functions for client-message idempotency keys, existing-message lookup, and stale-claim-aware completion/retry/failure updates.
- Sanitization for conversation IDs, message bodies, idempotency components, client message IDs, and stored outbox errors.
- Unit coverage for draft sanitation, idempotency keys, retry scheduling, claim lease timing, idle processing, sent processing, retry scheduling, failed processing, thrown sender errors, audit metadata, duplicate-safe scheduler behavior, duplicate client-message lookup, and stale claim responses.

## Privacy and storage boundaries

- Chat message bodies are encrypted before being written to `chat_messages`.
- Outbox payloads are encrypted before being written to `sync_outbox`.
- The outbox payload contains the encrypted message payload and routing metadata needed by the sender boundary.
- The injected sender receives the outbox payload with the encrypted message payload, not raw message body text.
- Raw message text should not be written to audit logs, local search tables, service-worker caches, or error fields.
- Audit metadata uses IDs, operation types, attempt counts, safe reason codes, and timestamps; it must not include raw message text, decrypted payloads, ciphertext blobs, tokens, or transport responses.
- Stored outbox errors are sanitized and length-bounded.

## What is not complete yet

- No production chat transport exists yet.
- No remote delivery acknowledgement path exists yet.
- No timed background retry registration exists yet.
- No chat UI wiring exists yet.
- No conflict resolution or remote receipt state exists yet.
- No server/session trust model exists yet.
- Stale-claim-aware helper functions are covered, but `processNextDueSyncOutboxOperation` still needs a small integration pass so sent/retry/failed paths return explicit stale-claim results when the claimed row was already completed or released.

## Next implementation steps

1. Integrate the stale-claim helper functions into `processNextDueSyncOutboxOperation` once the connector allows the larger refactor or a smaller patch path is available.
2. Add timed background retry registration only after the UI/runtime surface is ready to own lifecycle cleanup.
3. Wire a minimal Chat UI to create and list local messages after the local/sync boundary remains green in CI.
4. Keep production transport out of scope until server/session trust is intentionally designed.
