import { decodeBase64, encodeBase64 } from "./base64";
import { ENCRYPTION_ALGORITHM, type EncryptedPayload } from "./envelope";

type WorkerRequest =
  | { id: string; type: "initialize" }
  | { id: string; type: "encrypt"; plaintext: string }
  | { id: string; type: "decrypt"; payload: EncryptedPayload }
  | { id: string; type: "clear" };

type WorkerResponse =
  | { id: string; ok: true; type: "initialized" }
  | { id: string; ok: true; type: "encrypted"; payload: EncryptedPayload }
  | { id: string; ok: true; type: "decrypted"; plaintext: string }
  | { id: string; ok: true; type: "cleared" }
  | { id: string; ok: false; error: string };

const KEY_LENGTH = 256;
const NONCE_BYTES = 12;
const KEY_DATABASE_NAME = "clinical-workspace-key-store";
const KEY_DATABASE_VERSION = 1;
const KEY_STORE_NAME = "keys";
const DATA_KEY_ID = "local-notes-data-key";

let dataKey: CryptoKey | undefined;

self.addEventListener("message", (event: MessageEvent<WorkerRequest>) => {
  void handleRequest(event.data);
});

async function handleRequest(request: WorkerRequest): Promise<void> {
  try {
    switch (request.type) {
      case "initialize":
        dataKey = await loadOrCreateDataKey();
        postResponse({ id: request.id, ok: true, type: "initialized" });
        return;
      case "encrypt":
        postResponse({
          id: request.id,
          ok: true,
          type: "encrypted",
          payload: await encryptWithSessionKey(request.plaintext)
        });
        return;
      case "decrypt":
        postResponse({
          id: request.id,
          ok: true,
          type: "decrypted",
          plaintext: await decryptWithSessionKey(request.payload)
        });
        return;
      case "clear":
        dataKey = undefined;
        postResponse({ id: request.id, ok: true, type: "cleared" });
        return;
    }
  } catch (error) {
    postResponse({ id: request.id, ok: false, error: toSafeErrorMessage(error) });
  }
}

async function loadOrCreateDataKey(): Promise<CryptoKey> {
  const existingKey = await readStoredDataKey();
  if (existingKey) return existingKey;

  const newKey = await crypto.subtle.generateKey(
    { name: ENCRYPTION_ALGORITHM, length: KEY_LENGTH },
    false,
    ["encrypt", "decrypt"]
  );
  await writeStoredDataKey(newKey);
  return newKey;
}

async function encryptWithSessionKey(plaintext: string): Promise<EncryptedPayload> {
  const key = requireDataKey();
  const nonce = crypto.getRandomValues(new Uint8Array(NONCE_BYTES));
  const encrypted = await crypto.subtle.encrypt(
    { name: ENCRYPTION_ALGORITHM, iv: nonce },
    key,
    new TextEncoder().encode(plaintext)
  );

  return {
    algorithm: ENCRYPTION_ALGORITHM,
    nonce: encodeBase64(nonce),
    ciphertext: encodeBase64(new Uint8Array(encrypted))
  };
}

async function decryptWithSessionKey(payload: EncryptedPayload): Promise<string> {
  if (payload.algorithm !== ENCRYPTION_ALGORITHM) {
    throw new Error("Unsupported encryption algorithm");
  }

  const decrypted = await crypto.subtle.decrypt(
    { name: ENCRYPTION_ALGORITHM, iv: decodeBase64(payload.nonce) },
    requireDataKey(),
    decodeBase64(payload.ciphertext)
  );

  return new TextDecoder().decode(decrypted);
}

function requireDataKey(): CryptoKey {
  if (!dataKey) {
    throw new Error("Crypto session is locked");
  }

  return dataKey;
}

async function readStoredDataKey(): Promise<CryptoKey | undefined> {
  const database = await openKeyDatabase();

  try {
    return await runKeyStoreRequest<CryptoKey | undefined>(
      database.transaction(KEY_STORE_NAME, "readonly").objectStore(KEY_STORE_NAME).get(DATA_KEY_ID)
    );
  } finally {
    database.close();
  }
}

async function writeStoredDataKey(key: CryptoKey): Promise<void> {
  const database = await openKeyDatabase();

  try {
    await runKeyStoreRequest(
      database.transaction(KEY_STORE_NAME, "readwrite").objectStore(KEY_STORE_NAME).put(key, DATA_KEY_ID)
    );
  } finally {
    database.close();
  }
}

function openKeyDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(KEY_DATABASE_NAME, KEY_DATABASE_VERSION);

    request.onupgradeneeded = () => {
      request.result.createObjectStore(KEY_STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Failed to open key database"));
    request.onblocked = () => reject(new Error("Key database open request was blocked"));
  });
}

function runKeyStoreRequest<Result>(request: IDBRequest<Result>): Promise<Result> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Key database request failed"));
  });
}

function toSafeErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return "Crypto worker request failed";
}

function postResponse(response: WorkerResponse): void {
  self.postMessage(response);
}
