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
- Sanitization for conversation IDs, message bodies, idempotency components, and stored outbox errors.
- Unit coverage for chat draft sanitation, idempotency keys, and retry delay scheduling.

## Privacy and storage boundaries

- Chat message bodies are encrypted before being written to `chat_messages`.
- Outbox payloads are encrypted before being written to `sync_outbox`.
- The outbox payload contains the encrypted message payload and routing metadata needed by the future sync worker.
- Raw message text should not be written to audit logs, local search tables, service-worker caches, or error fields.
- Stored outbox errors are sanitized and length-bounded.

## What is not complete yet

- No production chat transport exists yet.
- No remote delivery acknowledgement path exists yet.
- No retry worker or scheduler loop exists yet.
- No chat UI wiring exists yet.
- No conflict resolution or remote receipt state exists yet.
- No server/session trust model exists yet.

## Next implementation steps

1. Add a small outbox dequeue/claim API that lists operations whose `next_attempt_at` is due.
2. Add a sync worker boundary that accepts an injected sender so tests can simulate success, retryable failure, and terminal failure.
3. Update local chat delivery state from outbox results.
4. Add tests for duplicate idempotency handling, stale responses, retryable failures, terminal failures, and local rollback boundaries.
5. Only after the local/sync boundary is tested, wire a minimal Chat UI to create and list local messages.
