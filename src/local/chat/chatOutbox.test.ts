import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EncryptedPayload } from "../crypto/envelope";
import { decryptInCryptoWorker } from "../crypto/workerClient";
import { getLocalDb } from "../db/client";
import {
  createChatMessageIdempotencyKey,
  getSyncOutboxLockedUntilAt,
  getSyncOutboxNextAttemptAt,
  getSyncOutboxRetryDelayMs,
  processNextDueSyncOutboxOperation,
  sanitizeChatMessageDraft,
  type SyncOutboxRetryPolicy
} from "./chatOutbox";

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
  vi.mocked(getLocalDb).mockReset();
  vi.mocked(decryptInCryptoWorker).mockReset();
  vi.mocked(decryptInCryptoWorker).mockResolvedValue(decryptedOutboxPayload);
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

  it("claims a due operation, invokes the injected sender, and marks the chat message sent", async () => {
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
  });
});

function createMockDb(rowBatches: unknown[][]) {
  const batches = [...rowBatches];
  return {
    query: vi.fn(() => Promise.resolve({ rows: batches.shift() ?? [] }))
  };
}
