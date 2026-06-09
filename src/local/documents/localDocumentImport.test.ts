import { beforeEach, describe, expect, it, vi } from "vitest";
import { recordAuditEventSafely } from "../audit/auditRepository";
import { encryptInCryptoWorker } from "../crypto/workerClient";
import { getLocalDb } from "../db/client";
import { deleteEncryptedBlob, writeEncryptedBlob } from "../opfs/vault";
import { importLocalDocument, sanitizeLocalDocumentMimeType, sanitizeLocalDocumentName } from "./localDocumentImport";

vi.mock("../audit/auditRepository", () => ({ recordAuditEventSafely: vi.fn() }));
vi.mock("../crypto/workerClient", () => ({ encryptInCryptoWorker: vi.fn() }));
vi.mock("../db/client", () => ({ getLocalDb: vi.fn() }));
vi.mock("../opfs/vault", () => ({ deleteEncryptedBlob: vi.fn(), writeEncryptedBlob: vi.fn() }));

const encryptedPayload = { algorithm: "AES-GCM", ciphertext: "encrypted", nonce: "nonce" };

beforeEach(() => {
  vi.mocked(recordAuditEventSafely).mockReset();
  vi.mocked(encryptInCryptoWorker).mockReset();
  vi.mocked(getLocalDb).mockReset();
  vi.mocked(deleteEncryptedBlob).mockReset();
  vi.mocked(writeEncryptedBlob).mockReset();
  vi.mocked(encryptInCryptoWorker).mockResolvedValue(encryptedPayload);
  vi.mocked(writeEncryptedBlob).mockResolvedValue({ path: "encrypted-vault/doc.enc", bytesWritten: 71 });
});

describe("sanitizeLocalDocumentName", () => {
  it("normalizes unsafe control characters and whitespace", () => {
    expect(sanitizeLocalDocumentName("  sample\u0000 file.pdf  ")).toBe("sample  file.pdf");
  });

  it("rejects blank names", () => {
    expect(() => sanitizeLocalDocumentName(" \n\t ")).toThrow("Document name is required");
  });
});

describe("sanitizeLocalDocumentMimeType", () => {
  it("normalizes mime types and defaults blanks", () => {
    expect(sanitizeLocalDocumentMimeType(" Text/Plain ")).toBe("text/plain");
    expect(sanitizeLocalDocumentMimeType(" ")).toBe("application/octet-stream");
    expect(sanitizeLocalDocumentMimeType(undefined)).toBe("application/octet-stream");
  });
});

describe("importLocalDocument", () => {
  it("encrypts bytes before OPFS write and persists encrypted metadata", async () => {
    const db = createMockDb(false);
    vi.mocked(getLocalDb).mockResolvedValue(db as never);
    const bytes = new Uint8Array([1, 2, 3, 4]);

    await expect(importLocalDocument({ name: "sample.pdf", mimeType: "application/pdf", bytes })).resolves.toEqual(
      expect.objectContaining({ vaultPath: "encrypted-vault/doc.enc", sourceSizeBytes: 4, encryptedSizeBytes: 71 })
    );

    expect(encryptInCryptoWorker).toHaveBeenCalledTimes(2);
    expect(vi.mocked(encryptInCryptoWorker).mock.calls[0]?.[0]).toContain("bytesBase64");
    expect(writeEncryptedBlob).toHaveBeenCalledWith(expect.stringMatching(/\.pdf\.enc$/), expect.any(Uint8Array));
    expect(db.query.mock.calls[0]?.[0]).toContain("INSERT INTO local_documents");
    expect(db.query.mock.calls[0]?.[1]?.[2]).toBe(JSON.stringify(encryptedPayload));
    expect(recordAuditEventSafely).toHaveBeenCalledWith(
      "document.imported",
      "local_document",
      expect.any(String),
      expect.objectContaining({ sourceSizeBytes: 4, encryptedSizeBytes: 71, mimeType: "application/pdf" })
    );
  });

  it("deletes the OPFS blob if metadata persistence fails", async () => {
    const db = createMockDb(true);
    vi.mocked(getLocalDb).mockResolvedValue(db as never);

    await expect(importLocalDocument({ name: "sample.txt", bytes: new Uint8Array([1, 2, 3]) })).rejects.toThrow(
      "db failed"
    );

    expect(deleteEncryptedBlob).toHaveBeenCalledWith(expect.stringMatching(/\.txt\.enc$/));
    expect(recordAuditEventSafely).not.toHaveBeenCalled();
  });

  it("rejects empty imports before encrypting or writing", async () => {
    await expect(importLocalDocument({ name: "empty.txt", bytes: new Uint8Array() })).rejects.toThrow(
      "Document import cannot be empty"
    );
    expect(encryptInCryptoWorker).not.toHaveBeenCalled();
    expect(writeEncryptedBlob).not.toHaveBeenCalled();
  });
});

function createMockDb(shouldFail: boolean) {
  return {
    query: vi.fn(() => (shouldFail ? Promise.reject(new Error("db failed")) : Promise.resolve({ rows: [] })))
  };
}
