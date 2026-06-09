import { beforeEach, describe, expect, it, vi } from "vitest";
import { recordAuditEventSafely } from "../audit/auditRepository";
import type { EncryptedPayload } from "../crypto/envelope";
import { decryptInCryptoWorker, encryptInCryptoWorker } from "../crypto/workerClient";
import { getLocalDb } from "../db/client";
import {
  createChatMessageIdempotencyKey,
  createLocalChatMessage,
  getSyncOutboxLockedUntilAt,
  getSyncOutboxNextAttemptAt,
  getSyncOutboxRetryDelayMs,
  processDueSyncOutboxOperations,
  processNextDueSyncOutboxOperation,
  sanitizeChatMessageDraft,
  type SyncOutboxRetryPolicy,
  type SyncOutboxSendResult
} from "./chatOutbox";

vi.mock("../audit/auditRepository", () => ({
  recordAuditEventSafely: vi.fn()
}));

vi.mock("../db/client", () => ({
  getLocalDb: vi.fn()
}));

vi.mock("../crypto/workerClient", () => ({
  decryptInCryptoWorker: vi.fn(),
  encryptInCryptoWorker: vi.fn()
}));

const retryPolicy: SyncOutboxRetryPolicy = {
  baseDelayMs: 1_000,
  maxDelayMs: 8_000,
  jitterRatio: 0.2
};

const encryptedEnvelope: EncryptedPayload = {
  algorithm: "AES-GCM",
  ciphertext: "ciphertext",
  nonce: "nonce"
};

const encryptedOutboxPayloadJson = JSON.stringify(encryptedEnvelope);
const decryptedOutboxPayload = JSON.stringify({
  schemaVersion: 1,
  messageId: "message-1",
  conversationId: "conversation-1",
  encryptedMessagePayload: encryptedEnvelope
});

const syncOutboxRow = {
  id: "outbox-1",
  operation_type: "chat.message.send",
  entity_type: "chat_message",
  entity_id: "message-1",
  payload_ciphertext: encryptedOutboxPayloadJson,
  idempotency_key: "chat-message:message-1",
  attempt_count: 0,
  next_attempt_at: "2026-06-08T00:00:00.000Z",
  created_at: "2026-06-08T00:00:00.000Z",
  last_error: null,
  claim_token: null,
  claimed_at: null,
  locked_until_at: null
};

beforeEach(() => {
  vi.mocked(recordAuditEventSafely).mockReset();
  vi.mocked(getLocalDb).mockReset();
  vi.mocked(decryptInCryptoWorker).mockReset();
  vi.mocked(encryptInCryptoWorker).mockReset();
  vi.mocked(decryptInCryptoWorker).mockResolvedValue(decryptedOutboxPayload);
  vi.mocked(encryptInCryptoWorker).mockResolvedValue(encryptedEnvelope);
});

describe("sanitizeChatMessageDraft", () => {
  it("normalizes conversation ids and message bodies without preserving unsafe control characters", () => {
    expect(
      sanitizeChatMessageDraft({
        conversationId: "  convo\u0007 one  ",
        body: "  hello\u0000\r\nthere  "
      })
    ).toEqual({
      conversationId: "convo one",
      body: "hello \nthere"
    });
  });

  it("rejects empty conversation ids", () => {
    expect(() => sanitizeChatMessageDraft({ conversationId: " \n\t ", body: "hello" })).toThrow(
      "Conversation id is required"
    );
  });

  it("rejects empty message bodies", () => {
    expect(() => sanitizeChatMessageDraft({ conversationId: "convo-1", body: " \r\n " })).toThrow(
      "Chat message body is required"
    );
  });
});

describe("createLocalChatMessage", () => {
  it("stores encrypted local and outbox payloads and records privacy-safe audit metadata", async () => {
    const db = createMockDb([[], [], [], []]);
    vi.mocked(getLocalDb).mockResolvedValue(db as never);

    await expect(createLocalChatMessage({ conversationId: "conversation-1", body: "sensitive chat body" })).resolves.toEqual(
      expect.objectContaining({
        conversationId: "conversation-1",
        body: "sensitive chat body",
        deliveryState: "queued"
      })
    );

    expect(db.query.mock.calls[1]?.[0]).toContain("INSERT INTO chat_messages");
    expect(db.query.mock.calls[2]?.[0]).toContain("INSERT INTO sync_outbox");
    expect(recordAuditEventSafely).toHaveBeenCalledWith(
      "chat.message.enqueued",
      "chat_message",
      expect.any(String),
      expect.objectContaining({ conversationId: "conversation-1", operationType: "chat.message.send" })
    );
    expect(JSON.stringify(vi.mocked(recordAuditEventSafely).mock.calls)).not.toContain("sensitive chat body");
  });
});

describe("createChatMessageIdempotencyKey", () => {
  it("creates stable chat-message scoped keys", () => {
    expect(createChatMessageIdempotencyKey("message-123")).toBe("chat-message:message-123");
  });

  it("rejects blank message ids", () => {
    expect(() => createChatMessageIdempotencyKey("  ")).toThrow("Idempotency component is required");
  });
});

describe("sync outbox retry policy", () => {
  it("uses exponential backoff for failed attempts", () => {
    expect(getSyncOutboxRetryDelayMs(1, retryPolicy, () => 0)).toBe(1_000);
    expect(getSyncOutboxRetryDelayMs(2, retryPolicy, () => 0)).toBe(2_000);
    expect(getSyncOutboxRetryDelayMs(3, retryPolicy, () => 0)).toBe(4_000);
    expect(getSyncOutboxRetryDelayMs(4, retryPolicy, () => 0)).toBe(8_000);
    expect(getSyncOutboxRetryDelayMs(5, retryPolicy, () => 0)).toBe(8_000);
  });

  it("applies bounded jitter without exceeding max delay", () => {
    expect(getSyncOutboxRetryDelayMs(2, retryPolicy, () => 1)).toBe(2_400);
    expect(getSyncOutboxRetryDelayMs(8, retryPolicy, () => 1)).toBe(8_000);
  });

  it("schedules the next attempt from the supplied time", () => {
    expect(
      getSyncOutboxNextAttemptAt(2, new Date("2026-06-08T00:00:00.000Z"), retryPolicy, () => 0)
    ).toBe("2026-06-08T00:00:02.000Z");
  });

  it("computes bounded claim lease expiration times", () => {
    expect(getSyncOutboxLockedUntilAt(new Date("2026-06-08T00:00:00.000Z"), 30_000)).toBe(
      "2026-06-08T00:00:30.000Z"
    );
  });
});

describe("processNextDueSyncOutboxOperation", () => {
  it("returns idle when no outbox operation is due", async () => {
    const db = createMockDb([[]]);
    vi.mocked(getLocalDb).mockResolvedValue(db as never);
    const sender = vi.fn();

    await expect(processNextDueSyncOutboxOperation(sender, new Date("2026-06-08T00:00:00.000Z"))).resolves.toEqual({
      status: "idle"
    });
    expect(sender).not.toHaveBeenCalled();
  });

  it("claims a due operation, invokes the injected sender, marks the chat message sent, and audits safe metadata", async () => {
    const db = createMockDb([[syncOutboxRow], [{ ...syncOutboxRow, claim_token: "claim-1" }], [], [], []]);
    vi.mocked(getLocalDb).mockResolvedValue(db as never);
    const sender = vi.fn().mockResolvedValue({ status: "sent" });

    await expect(processNextDueSyncOutboxOperation(sender, new Date("2026-06-08T00:00:00.000Z"))).resolves.toEqual({
      status: "sent",
      operationId: "outbox-1",
      messageId: "message-1"
    });

    expect(sender).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "outbox-1",
        claimToken: "claim-1",
        idempotencyKey: "chat-message:message-1",
        payload: expect.objectContaining({ messageId: "message-1", conversationId: "conversation-1" })
      })
    );
    expect(db.query.mock.calls[2]?.[0]).toContain("UPDATE chat_messages SET delivery_state = $1");
    expect(db.query.mock.calls[2]?.[1]).toEqual(["sending", expect.any(String), "message-1"]);
    expect(db.query.mock.calls[3]?.[0]).toContain("completed_at = $1");
    expect(db.query.mock.calls[4]?.[1]).toEqual(["sent", expect.any(String), "message-1"]);
    expect(recordAuditEventSafely).toHaveBeenCalledWith(
      "chat.outbox.claimed",
      "sync_outbox",
      "outbox-1",
      expect.objectContaining({ entityId: "message-1", attemptCount: 0 })
    );
    expect(recordAuditEventSafely).toHaveBeenCalledWith(
      "chat.message.sent",
      "chat_message",
      "message-1",
      expect.objectContaining({ outboxId: "outbox-1", attemptCount: 0 })
    );
    expect(JSON.stringify(vi.mocked(recordAuditEventSafely).mock.calls)).not.toContain("ciphertext");
  });

  it("releases a claimed operation for retry when the injected sender requests retry", async () => {
    const db = createMockDb([[syncOutboxRow], [{ ...syncOutboxRow, claim_token: "claim-1", attempt_count: 1 }], [], [], []]);
    vi.mocked(getLocalDb).mockResolvedValue(db as never);
    const sender = vi.fn().mockResolvedValue({ status: "retry", error: "temporary outage" });

    await expect(processNextDueSyncOutboxOperation(sender, new Date("2026-06-08T00:00:00.000Z"))).resolves.toEqual({
      status: "retry_scheduled",
      operationId: "outbox-1",
      messageId: "message-1",
      nextAttemptAt: expect.any(String)
    });

    expect(db.query.mock.calls[3]?.[0]).toContain("attempt_count = $1");
    expect(db.query.mock.calls[3]?.[1]).toEqual([2, expect.any(String), "temporary outage", "outbox-1", "claim-1"]);
    expect(db.query.mock.calls[4]?.[1]).toEqual(["queued", expect.any(String), "message-1"]);
    expect(recordAuditEventSafely).toHaveBeenCalledWith(
      "chat.message.retry_scheduled",
      "chat_message",
      "message-1",
      expect.objectContaining({ outboxId: "outbox-1", attemptCount: 2, reason: "sender_retry" })
    );
  });

  it("marks the chat message failed when the injected sender returns failed", async () => {
    const db = createMockDb([[syncOutboxRow], [{ ...syncOutboxRow, claim_token: "claim-1" }], [], [], []]);
    vi.mocked(getLocalDb).mockResolvedValue(db as never);
    const sender = vi.fn().mockResolvedValue({ status: "failed", error: "rejected" });

    await expect(processNextDueSyncOutboxOperation(sender, new Date("2026-06-08T00:00:00.000Z"))).resolves.toEqual({
      status: "failed",
      operationId: "outbox-1",
      messageId: "message-1"
    });

    expect(db.query.mock.calls[3]?.[0]).toContain("completed_at = $1");
    expect(db.query.mock.calls[3]?.[1]).toEqual([expect.any(String), "rejected", "outbox-1", "claim-1"]);
    expect(db.query.mock.calls[4]?.[1]).toEqual(["failed", expect.any(String), "message-1"]);
    expect(recordAuditEventSafely).toHaveBeenCalledWith(
      "chat.message.failed",
      "chat_message",
      "message-1",
      expect.objectContaining({ outboxId: "outbox-1", terminal: true })
    );
  });

  it("schedules retry when the injected sender throws", async () => {
    const db = createMockDb([[syncOutboxRow], [{ ...syncOutboxRow, claim_token: "claim-1" }], [], [], []]);
    vi.mocked(getLocalDb).mockResolvedValue(db as never);
    const sender = vi.fn().mockRejectedValue(new Error("network unavailable with sensitive-ish message"));

    await expect(processNextDueSyncOutboxOperation(sender, new Date("2026-06-08T00:00:00.000Z"))).resolves.toEqual({
      status: "retry_scheduled",
      operationId: "outbox-1",
      messageId: "message-1",
      nextAttemptAt: expect.any(String)
    });

    expect(db.query.mock.calls[3]?.[1]).toEqual([
      1,
      expect.any(String),
      "network unavailable with sensitive-ish message",
      "outbox-1",
      "claim-1"
    ]);
    expect(recordAuditEventSafely).toHaveBeenCalledWith(
      "chat.message.retry_scheduled",
      "chat_message",
      "message-1",
      expect.objectContaining({ reason: "sender_exception" })
    );
  });
});

describe("processDueSyncOutboxOperations", () => {
  it("reuses an in-flight scheduler run to avoid duplicate sends", async () => {
    const db = createMockDb([[syncOutboxRow], [{ ...syncOutboxRow, claim_token: "claim-1" }], [], [], []]);
    vi.mocked(getLocalDb).mockResolvedValue(db as never);
    const deferred = createDeferred<SyncOutboxSendResult>();
    const sender = vi.fn(() => deferred.promise);

    const firstRun = processDueSyncOutboxOperations(sender, {
      maxOperations: 1,
      now: new Date("2026-06-08T00:00:00.000Z")
    });
    const secondRun = processDueSyncOutboxOperations(sender, {
      maxOperations: 1,
      now: new Date("2026-06-08T00:00:00.000Z")
    });

    expect(firstRun).toBe(secondRun);
    expect(sender).toHaveBeenCalledTimes(0);
    await Promise.resolve();
    await Promise.resolve();
    expect(sender).toHaveBeenCalledTimes(1);

    deferred.resolve({ status: "sent" });

    await expect(firstRun).resolves.toEqual({
      processedCount: 1,
      results: [{ status: "sent", operationId: "outbox-1", messageId: "message-1" }]
    });
  });
});

function createMockDb(rowBatches: unknown[][]) {
  const batches = [...rowBatches];
  return {
    query: vi.fn(() => Promise.resolve({ rows: batches.shift() ?? [] }))
  };
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((innerResolve, innerReject) => {
    resolve = innerResolve;
    reject = innerReject;
  });
  return { promise, resolve, reject };
}
