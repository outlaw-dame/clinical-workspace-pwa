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

type ChatOutboxPayload = {
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

export const DEFAULT_SYNC_OUTBOX_RETRY_POLICY: SyncOutboxRetryPolicy = {
  baseDelayMs: 1_000,
  maxDelayMs: 5 * 60_000,
  jitterRatio: 0.2
};

const MAX_CONVERSATION_ID_LENGTH = 200;
const MAX_CHAT_BODY_LENGTH = 10_000;

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
     SET attempt_count = $1, next_attempt_at = $2, last_error = $3
     WHERE id = $4`,
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

export function sanitizeChatMessageDraft(draft: LocalChatMessageDraft): LocalChatMessageDraft {
  return {
    conversationId: normalizeConversationId(draft.conversationId),
    body: sanitizeChatMessagePayload(draft.body).body
  };
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
    throw new Error("Stored chat message payload is malformed");
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

function sanitizeOutboxError(value: string): string {
  return replaceUnsafeControlCharacters(value)
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);
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

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}
