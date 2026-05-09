import { encryptInCryptoWorker } from "../crypto/workerClient";
import { getLocalDb } from "../db/client";

type AuditMetadata = Record<string, string | number | boolean | null>;

type AuditTailRow = {
  event_hash: string;
};

const HASH_ALGORITHM = "SHA-256";

export async function recordAuditEvent(
  action: string,
  targetType: string,
  targetId?: string,
  metadata?: AuditMetadata
): Promise<void> {
  const db = await getLocalDb();
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const previousHashResult = await db.query<AuditTailRow>(
    "SELECT event_hash FROM audit_events ORDER BY created_at DESC LIMIT 1"
  );
  const previousHash = previousHashResult.rows[0]?.event_hash;
  const metadataCiphertext = metadata ? JSON.stringify(await encryptInCryptoWorker(JSON.stringify(metadata))) : null;
  const eventHash = await hashAuditEvent({
    id,
    action,
    targetType,
    targetId: targetId ?? null,
    metadataCiphertext,
    createdAt,
    previousHash: previousHash ?? null
  });

  await db.query(
    `INSERT INTO audit_events (
       id, action, target_type, target_id, metadata_ciphertext,
       created_at, previous_hash, event_hash
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [id, action, targetType, targetId ?? null, metadataCiphertext, createdAt, previousHash ?? null, eventHash]
  );
}

export async function recordAuditEventSafely(
  action: string,
  targetType: string,
  targetId?: string,
  metadata?: AuditMetadata
): Promise<void> {
  try {
    await recordAuditEvent(action, targetType, targetId, metadata);
  } catch (error) {
    console.warn("Unable to record audit event", error);
  }
}

async function hashAuditEvent(value: {
  id: string;
  action: string;
  targetType: string;
  targetId: string | null;
  metadataCiphertext: string | null;
  createdAt: string;
  previousHash: string | null;
}): Promise<string> {
  const encoded = new TextEncoder().encode(JSON.stringify(value));
  const digest = await crypto.subtle.digest(HASH_ALGORITHM, encoded);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
