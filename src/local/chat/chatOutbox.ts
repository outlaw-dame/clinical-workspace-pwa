import type { EncryptedPayload } from "../crypto/envelope";
import { decryptInCryptoWorker, encryptInCryptoWorker } from "../crypto/workerClient";
import { getLocalDb } from "../db/client";
import { replaceUnsafeControlCharacters } from "../../shared/textSanitation";

export type ChatMessageDeliveryState = "queued" | "sending" | "sent" | "failed";

export type LocalChatMessageDraft = {
  conversationId: string;
  body: string;
};

export type LocalChatMessage = {
  id: string;
  conversationId: string;
  body: string;
  deliveryState: ChatMessageDeliveryState;
  createdAt: string;
  updatedAt: string;
};

type ChatMessagePayload = {
  schemaVersion: 1;
  body: string;
};

type ChatMessageRow = {
  id: string;
  conversation_id: string;
  encrypted_payload: string;
  delivery_state: ChatMessageDeliveryState;
  created_at: string;
  updated_at: string;
};

export type ChatOutboxPayload = {
  schemaVersion: 1;
  messageId: string;
  conversationId: string;
  encryptedMessagePayload: EncryptedPayload;
};

export type SyncOutboxRetryPolicy = {
  baseDelayMs: number;
  maxDelayMs: number;
  jitterRatio: number;
};

export type SyncOutboxOperationSummary = {
  id: string;
  operationType: string;
  entityType: string;
  entityId: string;
  idempotencyKey: string;
  attemptCount: number;
  nextAttemptAt: string | null;
  createdAt: string;
  lastError: string | null;
  claimedAt: string | null;
  lockedUntilAt: string | null;
};

export type ClaimedSyncOutboxOperation = SyncOutboxOperationSummary & {
  claimToken: string;
  payload: ChatOutboxPayload;
};

export type SyncOutboxSendResult =
  | { status: "sent" }
  | { status: "retry"; error: string }
  | { status: "failed"; error: string };

export type SyncOutboxSender = (operation: ClaimedSyncOutboxOperation) => Promise<SyncOutboxSendResult>;

export type SyncOutboxProcessingResult =
  | { status: "idle" }
  | { status: "sent"; operationId: string; messageId: string }
  | { status: "retry_scheduled"; operationId: string; messageId: string; nextAttemptAt: string }
  | { status: "failed"; operationId: string; messageId: string };

type SyncOutboxOperationRow = {
  id: string;
  operation_type: string;
  entity_type: string;
  entity_id: string;
  payload_ciphertext: string;
  idempotency_key: string;
  attempt_count: number;
  next_attempt_at: string | null;
  created_at: string;
  last_error: string | null;
  claim_token: string | null;
  claimed_at: string | null;
  locked_until_at: string | null;
};

export const DEFAULT_SYNC_OUTBOX_RETRY_POLICY: SyncOutboxRetryPolicy = {
  baseDelayMs: 1_000,
  maxDelayMs: 5 * 60_000,
  jitterRatio: 0.2
};

export const DEFAULT_SYNC_OUTBOX_CLAIM_TTL_MS = 30_000;

const MAX_CONVERSATION_ID_LENGTH = 200;
const MAX_CHAT_BODY_LENGTH = 10_000;
const MAX_OUTBOX_BATCH_SIZE = 50;

export async function createLocalChatMessage(draft: LocalChatMessageDraft): Promise<LocalChatMessage> {
  const conversationId = normalizeConversationId(draft.conversationId);
  const payload = sanitizeChatMessagePayload(draft.body);
  const encryptedPayload = await encryptInCryptoWorker(JSON.stringify(payload));
  const id = crypto.randomUUID();
  const outboxPayload = await encryptInCryptoWorker(
    JSON.stringify(createChatOutboxPayload(id, conversationId, encryptedPayload))
  );
  const outboxId = crypto.randomUUID();
  const now = new Date().toISOString();
  const db = await getLocalDb();

  await db.query("BEGIN");
  try {
    await db.query(
      `INSERT INTO chat_messages (
         id, conversation_id, encrypted_payload, delivery_state, created_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, conversationId, JSON.stringify(encryptedPayload), "queued", now, now]
    );

    await db.query(
      `INSERT INTO sync_outbox (
         id, operation_type, entity_type, entity_id, payload_ciphertext,
         idempotency_key, attempt_count, next_attempt_at, created_at, last_error
       ) VALUES ($1, $2, $3, $4, $5, $6, 0, $7, $8, NULL)`,
      [
        outboxId,
        "chat.message.send",
        "chat_message",
        id,
        JSON.stringify(outboxPayload),
        createChatMessageIdempotencyKey(id),
        now,
        now
      ]
    );

    await db.query("COMMIT");
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  }

  return {
    id,
    conversationId,
    body: payload.body,
    deliveryState: "queued",
    createdAt: now,
    updatedAt: now
  };
}

export async function listLocalChatMessages(conversationId: string): Promise<LocalChatMessage[]> {
  const normalizedConversationId = normalizeConversationId(conversationId);
  const db = await getLocalDb();
  const result = await db.query<ChatMessageRow>(
    `SELECT id, conversation_id, encrypted_payload, delivery_state, created_at, updated_at
     FROM chat_messages
     WHERE conversation_id = $1 AND deleted_at IS NULL
     ORDER BY created_at ASC, id ASC`,
    [normalizedConversationId]
  );

  return Promise.all(result.rows.map(decryptChatMessageRow));
}

export async function listDueSyncOutboxOperations(
  limit = 10,
  now = new Date()
): Promise<SyncOutboxOperationSummary[]> {
  const db = await getLocalDb();
  const nowIso = now.toISOString();
  const result = await db.query<SyncOutboxOperationRow>(
    `${createSyncOutboxSelectSql()}
     WHERE completed_at IS NULL
       AND (next_attempt_at IS NULL OR next_attempt_at <= $1)
       AND (locked_until_at IS NULL OR locked_until_at <= $1)
     ORDER BY next_attempt_at ASC NULLS FIRST, created_at ASC, id ASC
     LIMIT $2`,
    [nowIso, normalizeOutboxLimit(limit)]
  );

  return result.rows.map(rowToSyncOutboxOperationSummary);
}

export async function claimNextDueSyncOutboxOperation(
  now = new Date(),
  claimTtlMs = DEFAULT_SYNC_OUTBOX_CLAIM_TTL_MS
): Promise<ClaimedSyncOutboxOperation | undefined> {
  const dueOperations = await listDueSyncOutboxOperations(MAX_OUTBOX_BATCH_SIZE, now);

  for (const operation of dueOperations) {
    const claimed = await claimSyncOutboxOperation(operation.id, now, claimTtlMs);
    if (claimed !== undefined) return claimed;
  }

  return undefined;
}

export async function processNextDueSyncOutboxOperation(
  sender: SyncOutboxSender,
  now = new Date()
): Promise<SyncOutboxProcessingResult> {
  const operation = await claimNextDueSyncOutboxOperation(now);
  if (operation === undefined) return { status: "idle" };

  await markLocalChatMessageSending(operation.entityId);

  try {
    const result = await sender(operation);

    if (result.status === "sent") {
      await completeClaimedSyncOutboxOperation(operation, now);
      await markLocalChatMessageSent(operation.entityId);
      return { status: "sent", operationId: operation.id, messageId: operation.entityId };
    }

    if (result.status === "failed") {
      await failClaimedSyncOutboxOperation(operation, result.error, now);
      await markLocalChatMessageFailed(operation.entityId);
      return { status: "failed", operationId: operation.id, messageId: operation.entityId };
    }

    const nextAttemptAt = await releaseClaimedSyncOutboxOperationForRetry(operation, result.error, now);
    await updateLocalChatMessageDeliveryState(operation.entityId, "queued");
    return {
      status: "retry_scheduled",
      operationId: operation.id,
      messageId: operation.entityId,
      nextAttemptAt
    };
  } catch (error) {
    const nextAttemptAt = await releaseClaimedSyncOutboxOperationForRetry(operation, formatUnknownError(error), now);
    await updateLocalChatMessageDeliveryState(operation.entityId, "queued");
    return {
      status: "retry_scheduled",
      operationId: operation.id,
      messageId: operation.entityId,
      nextAttemptAt
    };
  }
}

export async function markLocalChatMessageSending(messageId: string): Promise<void> {
  await updateLocalChatMessageDeliveryState(messageId, "sending");
}

export async function markLocalChatMessageSent(messageId: string): Promise<void> {
  await updateLocalChatMessageDeliveryState(messageId, "sent");
}

export async function markLocalChatMessageFailed(messageId: string): Promise<void> {
  await updateLocalChatMessageDeliveryState(messageId, "failed");
}

export async function scheduleSyncOutboxRetry(
  outboxId: string,
  attemptCount: number,
  lastError: string,
  now = new Date()
): Promise<void> {
  const db = await getLocalDb();
  const nextAttemptAt = getSyncOutboxNextAttemptAt(attemptCount, now);
  await db.query(
    `UPDATE sync_outbox
     SET attempt_count = $1,
         next_attempt_at = $2,
         last_error = $3,
         claim_token = NULL,
         claimed_at = NULL,
         locked_until_at = NULL
     WHERE id = $4 AND completed_at IS NULL`,
    [attemptCount, nextAttemptAt, sanitizeOutboxError(lastError), outboxId]
  );
}

export function createChatMessageIdempotencyKey(messageId: string): string {
  const normalized = normalizeIdempotencyComponent(messageId);
  return `chat-message:${normalized}`;
}

export function getSyncOutboxNextAttemptAt(
  failedAttemptCount: number,
  now = new Date(),
  policy = DEFAULT_SYNC_OUTBOX_RETRY_POLICY,
  random = Math.random
): string {
  return new Date(now.getTime() + getSyncOutboxRetryDelayMs(failedAttemptCount, policy, random)).toISOString();
}

export function getSyncOutboxRetryDelayMs(
  failedAttemptCount: number,
  policy = DEFAULT_SYNC_OUTBOX_RETRY_POLICY,
  random = Math.random
): number {
  const attempt = Math.max(1, Math.floor(failedAttemptCount));
  const baseDelay = Math.min(policy.maxDelayMs, policy.baseDelayMs * 2 ** Math.max(0, attempt - 1));
  const jitter = baseDelay * Math.max(0, policy.jitterRatio) * clamp01(random());
  return Math.round(Math.min(policy.maxDelayMs, baseDelay + jitter));
}

export function getSyncOutboxLockedUntilAt(now = new Date(), claimTtlMs = DEFAULT_SYNC_OUTBOX_CLAIM_TTL_MS): string {
  return new Date(now.getTime() + Math.max(1, Math.floor(claimTtlMs))).toISOString();
}

export function sanitizeChatMessageDraft(draft: LocalChatMessageDraft): LocalChatMessageDraft {
  return {
    conversationId: normalizeConversationId(draft.conversationId),
    body: sanitizeChatMessagePayload(draft.body).body
  };
}

async function claimSyncOutboxOperation(
  operationId: string,
  now: Date,
  claimTtlMs: number
): Promise<ClaimedSyncOutboxOperation | undefined> {
  const db = await getLocalDb();
  const nowIso = now.toISOString();
  const claimToken = crypto.randomUUID();
  const lockedUntilAt = getSyncOutboxLockedUntilAt(now, claimTtlMs);
  const result = await db.query<SyncOutboxOperationRow>(
    `UPDATE sync_outbox
     SET claim_token = $1, claimed_at = $2, locked_until_at = $3
     WHERE id = $4
       AND completed_at IS NULL
       AND (next_attempt_at IS NULL OR next_attempt_at <= $2)
       AND (locked_until_at IS NULL OR locked_until_at <= $2)
     RETURNING id, operation_type, entity_type, entity_id, payload_ciphertext,
       idempotency_key, attempt_count, next_attempt_at, created_at, last_error,
       claim_token, claimed_at, locked_until_at`,
    [claimToken, nowIso, lockedUntilAt, operationId]
  );
  const row = result.rows[0];
  return row === undefined ? undefined : hydrateClaimedSyncOutboxOperation(row);
}

async function hydrateClaimedSyncOutboxOperation(row: SyncOutboxOperationRow): Promise<ClaimedSyncOutboxOperation> {
  if (row.claim_token === null) {
    throw new Error("Claimed sync outbox operation is missing claim token");
  }

  return {
    ...rowToSyncOutboxOperationSummary(row),
    claimToken: row.claim_token,
    payload: await decryptChatOutboxPayload(row.payload_ciphertext)
  };
}

async function completeClaimedSyncOutboxOperation(operation: ClaimedSyncOutboxOperation, now: Date): Promise<void> {
  const db = await getLocalDb();
  await db.query(
    `UPDATE sync_outbox
     SET completed_at = $1,
         last_error = NULL,
         claim_token = NULL,
         claimed_at = NULL,
         locked_until_at = NULL
     WHERE id = $2 AND claim_token = $3 AND completed_at IS NULL`,
    [now.toISOString(), operation.id, operation.claimToken]
  );
}

async function failClaimedSyncOutboxOperation(
  operation: ClaimedSyncOutboxOperation,
  error: string,
  now: Date
): Promise<void> {
  const db = await getLocalDb();
  await db.query(
    `UPDATE sync_outbox
     SET completed_at = $1,
         last_error = $2,
         claim_token = NULL,
         claimed_at = NULL,
         locked_until_at = NULL
     WHERE id = $3 AND claim_token = $4 AND completed_at IS NULL`,
    [now.toISOString(), sanitizeOutboxError(error), operation.id, operation.claimToken]
  );
}

async function releaseClaimedSyncOutboxOperationForRetry(
  operation: ClaimedSyncOutboxOperation,
  error: string,
  now: Date
): Promise<string> {
  const db = await getLocalDb();
  const nextAttemptCount = operation.attemptCount + 1;
  const nextAttemptAt = getSyncOutboxNextAttemptAt(nextAttemptCount, now);
  await db.query(
    `UPDATE sync_outbox
     SET attempt_count = $1,
         next_attempt_at = $2,
         last_error = $3,
         claim_token = NULL,
         claimed_at = NULL,
         locked_until_at = NULL
     WHERE id = $4 AND claim_token = $5 AND completed_at IS NULL`,
    [nextAttemptCount, nextAttemptAt, sanitizeOutboxError(error), operation.id, operation.claimToken]
  );
  return nextAttemptAt;
}

function createChatOutboxPayload(
  messageId: string,
  conversationId: string,
  encryptedMessagePayload: EncryptedPayload
): ChatOutboxPayload {
  return {
    schemaVersion: 1,
    messageId,
    conversationId,
    encryptedMessagePayload
  };
}

async function decryptChatOutboxPayload(encryptedPayloadJson: string): Promise<ChatOutboxPayload> {
  const encryptedPayload = parseEncryptedPayload(encryptedPayloadJson);
  const plaintext = await decryptInCryptoWorker(encryptedPayload);
  return parseChatOutboxPayload(plaintext);
}

function sanitizeChatMessagePayload(body: string): ChatMessagePayload {
  const normalizedBody = replaceUnsafeControlCharacters(body)
    .replace(/\r\n?/g, "\n")
    .trim()
    .slice(0, MAX_CHAT_BODY_LENGTH);

  if (normalizedBody.length === 0) {
    throw new Error("Chat message body is required");
  }

  return {
    schemaVersion: 1,
    body: normalizedBody
  };
}

function normalizeConversationId(value: string): string {
  const normalized = replaceUnsafeControlCharacters(value)
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_CONVERSATION_ID_LENGTH);

  if (normalized.length === 0) {
    throw new Error("Conversation id is required");
  }

  return normalized;
}

function normalizeIdempotencyComponent(value: string): string {
  const normalized = replaceUnsafeControlCharacters(value).trim();
  if (normalized.length === 0) {
    throw new Error("Idempotency component is required");
  }
  return normalized;
}

async function decryptChatMessageRow(row: ChatMessageRow): Promise<LocalChatMessage> {
  const payload = await decryptChatMessagePayload(row.encrypted_payload);
  return {
    id: row.id,
    conversationId: row.conversation_id,
    body: payload.body,
    deliveryState: row.delivery_state,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

async function decryptChatMessagePayload(encryptedPayloadJson: string): Promise<ChatMessagePayload> {
  const encryptedPayload = parseEncryptedPayload(encryptedPayloadJson);
  const plaintext = await decryptInCryptoWorker(encryptedPayload);
  return parseChatMessagePayload(plaintext);
}

function parseEncryptedPayload(value: string): EncryptedPayload {
  const parsed: unknown = JSON.parse(value);

  if (!isEncryptedPayload(parsed)) {
    throw new Error("Stored encrypted payload is malformed");
  }

  return parsed;
}

function parseChatMessagePayload(value: string): ChatMessagePayload {
  const parsed: unknown = JSON.parse(value);

  if (!isChatMessagePayload(parsed)) {
    throw new Error("Decrypted chat message payload is malformed");
  }

  return parsed;
}

function parseChatOutboxPayload(value: string): ChatOutboxPayload {
  const parsed: unknown = JSON.parse(value);

  if (!isChatOutboxPayload(parsed)) {
    throw new Error("Decrypted chat outbox payload is malformed");
  }

  return parsed;
}

async function updateLocalChatMessageDeliveryState(
  messageId: string,
  deliveryState: ChatMessageDeliveryState
): Promise<void> {
  const db = await getLocalDb();
  await db.query("UPDATE chat_messages SET delivery_state = $1, updated_at = $2 WHERE id = $3", [
    deliveryState,
    new Date().toISOString(),
    messageId
  ]);
}

function rowToSyncOutboxOperationSummary(row: SyncOutboxOperationRow): SyncOutboxOperationSummary {
  return {
    id: row.id,
    operationType: row.operation_type,
    entityType: row.entity_type,
    entityId: row.entity_id,
    idempotencyKey: row.idempotency_key,
    attemptCount: row.attempt_count,
    nextAttemptAt: row.next_attempt_at,
    createdAt: row.created_at,
    lastError: row.last_error,
    claimedAt: row.claimed_at,
    lockedUntilAt: row.locked_until_at
  };
}

function createSyncOutboxSelectSql(): string {
  return `SELECT id, operation_type, entity_type, entity_id, payload_ciphertext,
       idempotency_key, attempt_count, next_attempt_at, created_at, last_error,
       claim_token, claimed_at, locked_until_at
     FROM sync_outbox`;
}

function normalizeOutboxLimit(limit: number): number {
  if (!Number.isFinite(limit)) return 10;
  return Math.min(MAX_OUTBOX_BATCH_SIZE, Math.max(1, Math.floor(limit)));
}

function sanitizeOutboxError(value: string): string {
  return replaceUnsafeControlCharacters(value)
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);
}

function formatUnknownError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (typeof error === "number" || typeof error === "boolean" || typeof error === "bigint") return error.toString();
  return "Unknown sync outbox sender error";
}

function isEncryptedPayload(value: unknown): value is EncryptedPayload {
  return (
    typeof value === "object" &&
    value !== null &&
    "algorithm" in value &&
    "ciphertext" in value &&
    "nonce" in value &&
    typeof value.algorithm === "string" &&
    typeof value.ciphertext === "string" &&
    typeof value.nonce === "string"
  );
}

function isChatMessagePayload(value: unknown): value is ChatMessagePayload {
  return (
    typeof value === "object" &&
    value !== null &&
    "schemaVersion" in value &&
    "body" in value &&
    value.schemaVersion === 1 &&
    typeof value.body === "string"
  );
}

function isChatOutboxPayload(value: unknown): value is ChatOutboxPayload {
  return (
    typeof value === "object" &&
    value !== null &&
    "schemaVersion" in value &&
    "messageId" in value &&
    "conversationId" in value &&
    "encryptedMessagePayload" in value &&
    value.schemaVersion === 1 &&
    typeof value.messageId === "string" &&
    typeof value.conversationId === "string" &&
    isEncryptedPayload(value.encryptedMessagePayload)
  );
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}
