import { recordAuditEventSafely } from "../audit/auditRepository";
import { getLocalDb } from "../db/client";
import { replaceUnsafeControlCharacters } from "../../shared/textSanitation";

export type ChatOutboxClaimCompletionIntent = "sent" | "retry" | "failed";

export type ChatOutboxClaimCompletionResult =
  | { status: "updated"; operationId: string }
  | { status: "stale_claim"; operationId: string; intendedResult: ChatOutboxClaimCompletionIntent };

type UpdatedOutboxRow = {
  id: string;
};

const MAX_CLIENT_MESSAGE_ID_LENGTH = 200;
const MAX_OUTBOX_ERROR_LENGTH = 500;

export function createClientChatMessageIdempotencyKey(clientMessageId: string): string {
  return `chat-message:${normalizeClientMessageId(clientMessageId)}`;
}

export async function existingLocalChatMessageId(clientMessageId: string): Promise<string | undefined> {
  const id = normalizeClientMessageId(clientMessageId);
  const db = await getLocalDb();
  const result = await db.query<{ id: string }>(
    "SELECT id FROM chat_messages WHERE id = $1 AND deleted_at IS NULL",
    [id]
  );
  return result.rows[0]?.id;
}

export async function completeClaimedChatOutboxOperation(
  operationId: string,
  claimToken: string,
  completedAt: string
): Promise<ChatOutboxClaimCompletionResult> {
  const db = await getLocalDb();
  const result = await db.query<UpdatedOutboxRow>(
    `UPDATE sync_outbox
     SET completed_at = $1,
         last_error = NULL,
         claim_token = NULL,
         claimed_at = NULL,
         locked_until_at = NULL
     WHERE id = $2 AND claim_token = $3 AND completed_at IS NULL
     RETURNING id`,
    [completedAt, operationId, claimToken]
  );

  return toClaimCompletionResult(result.rows[0]?.id, operationId, "sent");
}

export async function failClaimedChatOutboxOperation(
  operationId: string,
  claimToken: string,
  completedAt: string,
  error: string
): Promise<ChatOutboxClaimCompletionResult> {
  const db = await getLocalDb();
  const result = await db.query<UpdatedOutboxRow>(
    `UPDATE sync_outbox
     SET completed_at = $1,
         last_error = $2,
         claim_token = NULL,
         claimed_at = NULL,
         locked_until_at = NULL
     WHERE id = $3 AND claim_token = $4 AND completed_at IS NULL
     RETURNING id`,
    [completedAt, sanitizeOutboxError(error), operationId, claimToken]
  );

  return toClaimCompletionResult(result.rows[0]?.id, operationId, "failed");
}

export async function releaseClaimedChatOutboxOperationForRetry(
  operationId: string,
  claimToken: string,
  nextAttemptAt: string,
  nextAttemptCount: number,
  error: string
): Promise<ChatOutboxClaimCompletionResult> {
  const db = await getLocalDb();
  const result = await db.query<UpdatedOutboxRow>(
    `UPDATE sync_outbox
     SET attempt_count = $1,
         next_attempt_at = $2,
         last_error = $3,
         claim_token = NULL,
         claimed_at = NULL,
         locked_until_at = NULL
     WHERE id = $4 AND claim_token = $5 AND completed_at IS NULL
     RETURNING id`,
    [nextAttemptCount, nextAttemptAt, sanitizeOutboxError(error), operationId, claimToken]
  );

  return toClaimCompletionResult(result.rows[0]?.id, operationId, "retry");
}

function toClaimCompletionResult(
  updatedOperationId: string | undefined,
  operationId: string,
  intendedResult: ChatOutboxClaimCompletionIntent
): ChatOutboxClaimCompletionResult {
  if (updatedOperationId === operationId) {
    return { status: "updated", operationId };
  }

  void recordAuditEventSafely("chat.outbox.stale_claim", "sync_outbox", operationId, { intendedResult });
  return { status: "stale_claim", operationId, intendedResult };
}

function normalizeClientMessageId(value: string): string {
  const normalized = replaceUnsafeControlCharacters(value).trim().slice(0, MAX_CLIENT_MESSAGE_ID_LENGTH);
  if (normalized.length === 0) {
    throw new Error("Client message id is required");
  }
  return normalized;
}

function sanitizeOutboxError(value: string): string {
  return replaceUnsafeControlCharacters(value)
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_OUTBOX_ERROR_LENGTH);
}
