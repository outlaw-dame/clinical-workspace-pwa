import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite/vector";

let dbPromise: Promise<PGlite> | undefined;

const schema = `
CREATE TABLE IF NOT EXISTS local_records (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  encrypted_payload TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS secure_notes (
  id TEXT PRIMARY KEY,
  encrypted_payload TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  encrypted_payload TEXT NOT NULL,
  delivery_state TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation_created_at
  ON chat_messages (conversation_id, created_at ASC, id ASC)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS webauthn_credentials (
  id TEXT PRIMARY KEY,
  credential_id TEXT NOT NULL UNIQUE,
  user_handle TEXT NOT NULL,
  display_name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_used_at TEXT
);

CREATE TABLE IF NOT EXISTS audit_events (
  id TEXT PRIMARY KEY,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT,
  metadata_ciphertext TEXT,
  created_at TEXT NOT NULL,
  previous_hash TEXT,
  event_hash TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_events_created_at
  ON audit_events (created_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS sync_outbox (
  id TEXT PRIMARY KEY,
  operation_type TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  payload_ciphertext TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TEXT,
  created_at TEXT NOT NULL,
  last_error TEXT,
  claim_token TEXT,
  claimed_at TEXT,
  locked_until_at TEXT,
  completed_at TEXT
);

ALTER TABLE sync_outbox ADD COLUMN IF NOT EXISTS claim_token TEXT;
ALTER TABLE sync_outbox ADD COLUMN IF NOT EXISTS claimed_at TEXT;
ALTER TABLE sync_outbox ADD COLUMN IF NOT EXISTS locked_until_at TEXT;
ALTER TABLE sync_outbox ADD COLUMN IF NOT EXISTS completed_at TEXT;

CREATE INDEX IF NOT EXISTS idx_sync_outbox_next_attempt
  ON sync_outbox (next_attempt_at ASC, created_at ASC, id ASC)
  WHERE completed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_sync_outbox_lock
  ON sync_outbox (locked_until_at ASC, id ASC)
  WHERE completed_at IS NULL;
`;

export async function getLocalDb(): Promise<PGlite> {
  dbPromise ??= createLocalDb();
  return dbPromise;
}

async function createLocalDb(): Promise<PGlite> {
  const db = await PGlite.create({
    dataDir: "idb://clinical-workspace",
    extensions: { vector }
  });
  await db.exec(schema);
  return db;
}

export async function runLocalStorageSmokeTest(): Promise<boolean> {
  const db = await getLocalDb();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await db.query(
    `INSERT INTO local_records (id, kind, encrypted_payload, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [id, "smoke_test", "ciphertext-placeholder", now, now]
  );

  const result = await db.query<{ id: string }>("SELECT id FROM local_records WHERE id = $1", [id]);
  await db.query("DELETE FROM local_records WHERE id = $1", [id]);

  return result.rows[0]?.id === id;
}
