import { beforeEach, describe, expect, it, vi } from "vitest";
import { recordAuditEventSafely } from "../audit/auditRepository";
import { getLocalDb } from "../db/client";
import {
  completeClaimedChatOutboxOperation,
  createClientChatMessageIdempotencyKey,
  existingLocalChatMessageId,
  failClaimedChatOutboxOperation,
  releaseClaimedChatOutboxOperationForRetry,
  toClaimProcessResult
} from "./chatOutboxEdgeCases";

vi.mock("../audit/auditRepository", () => ({
  recordAuditEventSafely: vi.fn()
}));

vi.mock("../db/client", () => ({
  getLocalDb: vi.fn()
}));

beforeEach(() => {
  vi.mocked(recordAuditEventSafely).mockReset();
  vi.mocked(getLocalDb).mockReset();
});

describe("createClientChatMessageIdempotencyKey", () => {
  it("normalizes a client supplied message id into a stable chat-message idempotency key", () => {
    expect(createClientChatMessageIdempotencyKey("  client-message-1\u0000  ")).toBe(
      "chat-message:client-message-1"
    );
  });

  it("rejects blank client message ids", () => {
    expect(() => createClientChatMessageIdempotencyKey(" \n\t ")).toThrow("Client message id is required");
  });
});

describe("existingLocalChatMessageId", () => {
  it("finds an existing non-deleted local chat message id for duplicate idempotency handling", async () => {
    const db = createMockDb([[{ id: "client-message-1" }]]);
    vi.mocked(getLocalDb).mockResolvedValue(db as never);

    await expect(existingLocalChatMessageId("client-message-1")).resolves.toBe("client-message-1");
    expect(db.query).toHaveBeenCalledWith(
      "SELECT id FROM chat_messages WHERE id = $1 AND deleted_at IS NULL",
      ["client-message-1"]
    );
  });

  it("returns undefined when no duplicate local chat message exists", async () => {
    const db = createMockDb([[]]);
    vi.mocked(getLocalDb).mockResolvedValue(db as never);

    await expect(existingLocalChatMessageId("client-message-1")).resolves.toBeUndefined();
  });
});

describe("claimed chat outbox completion helpers", () => {
  it("returns updated when a claimed send completion updates the active row", async () => {
    const db = createMockDb([[{ id: "outbox-1" }]]);
    vi.mocked(getLocalDb).mockResolvedValue(db as never);

    await expect(
      completeClaimedChatOutboxOperation("outbox-1", "claim-1", "2026-06-08T00:00:00.000Z")
    ).resolves.toEqual({ status: "updated", operationId: "outbox-1" });
    expect(recordAuditEventSafely).not.toHaveBeenCalled();
  });

  it("returns stale_claim and audits safe metadata when send completion updates no row", async () => {
    const db = createMockDb([[]]);
    vi.mocked(getLocalDb).mockResolvedValue(db as never);

    await expect(
      completeClaimedChatOutboxOperation("outbox-1", "claim-1", "2026-06-08T00:00:00.000Z")
    ).resolves.toEqual({ status: "stale_claim", operationId: "outbox-1", intendedResult: "sent" });
    expect(recordAuditEventSafely).toHaveBeenCalledWith("chat.outbox.stale_claim", "sync_outbox", "outbox-1", {
      intendedResult: "sent"
    });
  });

  it("returns stale_claim for retry release when the claim is no longer active", async () => {
    const db = createMockDb([[]]);
    vi.mocked(getLocalDb).mockResolvedValue(db as never);

    await expect(
      releaseClaimedChatOutboxOperationForRetry(
        "outbox-1",
        "claim-1",
        "2026-06-08T00:00:02.000Z",
        2,
        "temporary error"
      )
    ).resolves.toEqual({ status: "stale_claim", operationId: "outbox-1", intendedResult: "retry" });
    expect(recordAuditEventSafely).toHaveBeenCalledWith("chat.outbox.stale_claim", "sync_outbox", "outbox-1", {
      intendedResult: "retry"
    });
  });

  it("sanitizes stored failure errors and returns updated for active failure completion", async () => {
    const db = createMockDb([[{ id: "outbox-1" }]]);
    vi.mocked(getLocalDb).mockResolvedValue(db as never);

    await expect(
      failClaimedChatOutboxOperation("outbox-1", "claim-1", "2026-06-08T00:00:00.000Z", "bad\u0000 error")
    ).resolves.toEqual({ status: "updated", operationId: "outbox-1" });

    expect(db.query.mock.calls[0]?.[1]).toEqual([
      "2026-06-08T00:00:00.000Z",
      "bad  error",
      "outbox-1",
      "claim-1"
    ]);
  });
});

describe("toClaimProcessResult", () => {
  it("maps updated completion into a continue result", () => {
    expect(toClaimProcessResult({ status: "updated", operationId: "outbox-1" }, "message-1")).toEqual({
      status: "continue",
      operationId: "outbox-1"
    });
  });

  it("maps stale completion into a processor-ready stale claim result", () => {
    expect(
      toClaimProcessResult({ status: "stale_claim", operationId: "outbox-1", intendedResult: "retry" }, "message-1")
    ).toEqual({ status: "stale_claim", operationId: "outbox-1", messageId: "message-1", intendedResult: "retry" });
  });
});

function createMockDb(rowBatches: unknown[][]) {
  const batches = [...rowBatches];
  return {
    query: vi.fn(() => Promise.resolve({ rows: batches.shift() ?? [] }))
  };
}
