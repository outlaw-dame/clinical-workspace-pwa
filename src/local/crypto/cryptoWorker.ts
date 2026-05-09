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
let dataKey: CryptoKey | undefined;

self.addEventListener("message", (event: MessageEvent<WorkerRequest>) => {
  void handleRequest(event.data);
});

async function handleRequest(request: WorkerRequest): Promise<void> {
  try {
    switch (request.type) {
      case "initialize":
        dataKey = await crypto.subtle.generateKey(
          { name: ENCRYPTION_ALGORITHM, length: KEY_LENGTH },
          false,
          ["encrypt", "decrypt"]
        );
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

function toSafeErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return "Crypto worker request failed";
}

function postResponse(response: WorkerResponse): void {
  self.postMessage(response);
}
