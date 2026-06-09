import { describe, expect, it } from "vitest";
import {
  createChatMessageIdempotencyKey,
  getSyncOutboxNextAttemptAt,
  getSyncOutboxRetryDelayMs,
  sanitizeChatMessageDraft,
  type SyncOutboxRetryPolicy
} from "./chatOutbox";

const retryPolicy: SyncOutboxRetryPolicy = {
  baseDelayMs: 1_000,
  maxDelayMs: 8_000,
  jitterRatio: 0.2
};

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
});
