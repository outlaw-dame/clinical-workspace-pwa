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
- Chat delivery-state updates from outbox processing results.
- Sanitization for conversation IDs, message bodies, idempotency components, and stored outbox errors.
- Unit coverage for draft sanitation, idempotency keys, retry scheduling, claim lease timing, idle processing, sent processing, retry scheduling, and failed processing.

## Privacy and storage boundaries

- Chat message bodies are encrypted before being written to `chat_messages`.
- Outbox payloads are encrypted before being written to `sync_outbox`.
- The outbox payload contains the encrypted message payload and routing metadata needed by the future sender boundary.
- The injected sender receives the outbox payload with the encrypted message payload, not raw message body text.
- Raw message text should not be written to audit logs, local search tables, service-worker caches, or error fields.
- Stored outbox errors are sanitized and length-bounded.

## What is not complete yet

- No production chat transport exists yet.
- No remote delivery acknowledgement path exists yet.
- No background retry scheduler loop exists yet.
- No chat UI wiring exists yet.
- No conflict resolution or remote receipt state exists yet.
- No server/session trust model exists yet.

## Next implementation steps

1. Add tests for duplicate idempotency handling and stale claim responses.
2. Add privacy-safe audit events around local chat enqueue, outbox retry, send success, and send failure.
3. Add a background-safe scheduler loop that calls the injected sender boundary without creating duplicate in-process sends.
4. Only after the local/sync boundary is tested and audited, wire a minimal Chat UI to create and list local messages.
