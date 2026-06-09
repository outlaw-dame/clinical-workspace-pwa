import { recordAuditEventSafely } from "../audit/auditRepository";
import { encodeBase64 } from "../crypto/base64";
import { encryptInCryptoWorker } from "../crypto/workerClient";
import { getLocalDb } from "../db/client";
import { deleteEncryptedBlob, writeEncryptedBlob } from "../opfs/vault";
import { replaceUnsafeControlCharacters } from "../../shared/textSanitation";

export type LocalDocumentImportInput = {
  name: string;
  mimeType?: string;
  bytes: Uint8Array | ArrayBuffer;
};

export type LocalDocumentImportResult = {
  id: string;
  vaultPath: string;
  sourceSizeBytes: number;
  encryptedSizeBytes: number;
  createdAt: string;
  updatedAt: string;
};

const DEFAULT_MIME_TYPE = "application/octet-stream";
const MAX_NAME_LENGTH = 240;
const MAX_MIME_LENGTH = 120;
const MAX_IMPORT_BYTES = 25 * 1024 * 1024;

export async function importLocalDocument(input: LocalDocumentImportInput): Promise<LocalDocumentImportResult> {
  const id = crypto.randomUUID();
  const name = sanitizeLocalDocumentName(input.name);
  const mimeType = sanitizeLocalDocumentMimeType(input.mimeType);
  const bytes = normalizeBytes(input.bytes);
  const encryptedFilePayload = await encryptInCryptoWorker(
    JSON.stringify({ schemaVersion: 1, name, mimeType, sourceSizeBytes: bytes.byteLength, bytesBase64: encodeBase64(bytes) })
  );
  const encryptedFileBytes = new TextEncoder().encode(JSON.stringify(encryptedFilePayload)) as Uint8Array<ArrayBuffer>;
  const vaultName = createVaultName(id, name);
  const vaultWrite = await writeEncryptedBlob(vaultName, encryptedFileBytes);
  const encryptedMetadata = await encryptInCryptoWorker(
    JSON.stringify({ schemaVersion: 1, name, mimeType, sourceSizeBytes: bytes.byteLength })
  );
  const now = new Date().toISOString();
  const db = await getLocalDb();

  try {
    await db.query(
      `INSERT INTO local_documents (
         id, vault_path, encrypted_metadata_payload, encrypted_size_bytes,
         source_size_bytes, created_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [id, vaultWrite.path, JSON.stringify(encryptedMetadata), vaultWrite.bytesWritten, bytes.byteLength, now, now]
    );
  } catch (error) {
    await deleteEncryptedBlob(vaultName).catch(() => undefined);
    throw error;
  }

  void recordAuditEventSafely("document.imported", "local_document", id, {
    sourceSizeBytes: bytes.byteLength,
    encryptedSizeBytes: vaultWrite.bytesWritten,
    mimeType
  });

  return {
    id,
    vaultPath: vaultWrite.path,
    sourceSizeBytes: bytes.byteLength,
    encryptedSizeBytes: vaultWrite.bytesWritten,
    createdAt: now,
    updatedAt: now
  };
}

export function sanitizeLocalDocumentName(value: string): string {
  const normalized = replaceUnsafeControlCharacters(value)
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_NAME_LENGTH);
  if (normalized.length === 0) throw new Error("Document name is required");
  return normalized;
}

export function sanitizeLocalDocumentMimeType(value: string | undefined): string {
  if (value === undefined) return DEFAULT_MIME_TYPE;
  const normalized = replaceUnsafeControlCharacters(value).trim().toLowerCase().slice(0, MAX_MIME_LENGTH);
  return normalized.length === 0 ? DEFAULT_MIME_TYPE : normalized;
}

function normalizeBytes(value: Uint8Array | ArrayBuffer): Uint8Array {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
  if (bytes.byteLength === 0) throw new Error("Document import cannot be empty");
  if (bytes.byteLength > MAX_IMPORT_BYTES) throw new Error("Document import exceeds the local import size limit");
  return bytes;
}

function createVaultName(id: string, name: string): string {
  const extension = name.includes(".") ? name.split(".").pop() : undefined;
  const safeExtension = extension?.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 12);
  return safeExtension ? `${id}.${safeExtension}.enc` : `${id}.document.enc`;
}
