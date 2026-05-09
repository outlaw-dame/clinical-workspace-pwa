import type { EncryptedPayload } from "../crypto/envelope";
import { decryptInCryptoWorker, encryptInCryptoWorker } from "../crypto/workerClient";
import { getLocalDb } from "../db/client";

type SecureNotePayload = {
  schemaVersion: 1;
  title: string;
  body: string;
};

type SecureNoteRow = {
  id: string;
  encrypted_payload: string;
  created_at: string;
  updated_at: string;
};

export type SecureNote = {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  updatedAt: string;
};

export type SecureNoteDraft = {
  title: string;
  body: string;
};

const MAX_NOTE_TITLE_LENGTH = 160;
const MAX_NOTE_BODY_LENGTH = 20_000;
const UNSAFE_CONTROL_CHARACTERS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

export async function createSecureNote(draft: SecureNoteDraft): Promise<SecureNote> {
  const payload = sanitizeDraft(draft);
  const encryptedPayload = await encryptInCryptoWorker(JSON.stringify(payload));
  const db = await getLocalDb();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await db.query(
    `INSERT INTO secure_notes (id, encrypted_payload, created_at, updated_at)
     VALUES ($1, $2, $3, $4)`,
    [id, JSON.stringify(encryptedPayload), now, now]
  );

  return {
    id,
    title: payload.title,
    body: payload.body,
    createdAt: now,
    updatedAt: now
  };
}

export async function listSecureNotes(): Promise<SecureNote[]> {
  const db = await getLocalDb();
  const result = await db.query<SecureNoteRow>(
    `SELECT id, encrypted_payload, created_at, updated_at
     FROM secure_notes
     WHERE deleted_at IS NULL
     ORDER BY updated_at DESC`
  );

  const notes: SecureNote[] = [];

  for (const row of result.rows) {
    const payload = await decryptNotePayload(row.encrypted_payload);
    notes.push({
      id: row.id,
      title: payload.title,
      body: payload.body,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    });
  }

  return notes;
}

export async function softDeleteSecureNote(noteId: string): Promise<void> {
  const db = await getLocalDb();
  await db.query("UPDATE secure_notes SET deleted_at = $1 WHERE id = $2", [
    new Date().toISOString(),
    noteId
  ]);
}

async function decryptNotePayload(encryptedPayloadJson: string): Promise<SecureNotePayload> {
  const encryptedPayload = parseEncryptedPayload(encryptedPayloadJson);
  const plaintext = await decryptInCryptoWorker(encryptedPayload);
  return parseSecureNotePayload(plaintext);
}

function sanitizeDraft(draft: SecureNoteDraft): SecureNotePayload {
  const title = normalizeTitle(draft.title) || "Untitled note";
  const body = normalizeBody(draft.body);

  return {
    schemaVersion: 1,
    title,
    body
  };
}

function normalizeTitle(value: string): string {
  return value
    .replace(UNSAFE_CONTROL_CHARACTERS, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_NOTE_TITLE_LENGTH);
}

function normalizeBody(value: string): string {
  return value
    .replace(UNSAFE_CONTROL_CHARACTERS, " ")
    .replace(/\r\n?/g, "\n")
    .trim()
    .slice(0, MAX_NOTE_BODY_LENGTH);
}

function parseEncryptedPayload(value: string): EncryptedPayload {
  const parsed: unknown = JSON.parse(value);

  if (!isEncryptedPayload(parsed)) {
    throw new Error("Stored note payload is malformed");
  }

  return parsed;
}

function parseSecureNotePayload(value: string): SecureNotePayload {
  const parsed: unknown = JSON.parse(value);

  if (!isSecureNotePayload(parsed)) {
    throw new Error("Decrypted note payload is malformed");
  }

  return parsed;
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

function isSecureNotePayload(value: unknown): value is SecureNotePayload {
  return (
    typeof value === "object" &&
    value !== null &&
    "schemaVersion" in value &&
    "title" in value &&
    "body" in value &&
    value.schemaVersion === 1 &&
    typeof value.title === "string" &&
    typeof value.body === "string"
  );
}
