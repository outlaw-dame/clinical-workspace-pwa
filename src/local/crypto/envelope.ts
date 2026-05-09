const ENCRYPTION_ALGORITHM = "AES-GCM";
const KEY_LENGTH = 256;
const NONCE_BYTES = 12;

export type EncryptedPayload = {
  ciphertext: string;
  nonce: string;
  algorithm: typeof ENCRYPTION_ALGORITHM;
};

export async function createEphemeralDataKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey(
    {
      name: ENCRYPTION_ALGORITHM,
      length: KEY_LENGTH
    },
    false,
    ["encrypt", "decrypt"]
  );
}

export async function encryptText(plaintext: string, key: CryptoKey): Promise<EncryptedPayload> {
  const nonce = crypto.getRandomValues(new Uint8Array(NONCE_BYTES));
  const encoded = new TextEncoder().encode(plaintext);
  const encrypted = await crypto.subtle.encrypt(
    { name: ENCRYPTION_ALGORITHM, iv: nonce },
    key,
    encoded
  );

  return {
    ciphertext: encodeBase64(new Uint8Array(encrypted)),
    nonce: encodeBase64(nonce),
    algorithm: ENCRYPTION_ALGORITHM
  };
}

export async function decryptText(payload: EncryptedPayload, key: CryptoKey): Promise<string> {
  if (payload.algorithm !== ENCRYPTION_ALGORITHM) {
    throw new Error(`Unsupported encryption algorithm: ${payload.algorithm}`);
  }

  const decrypted = await crypto.subtle.decrypt(
    { name: ENCRYPTION_ALGORITHM, iv: decodeBase64(payload.nonce) },
    key,
    decodeBase64(payload.ciphertext)
  );

  return new TextDecoder().decode(decrypted);
}

export function encodeBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function decodeBase64(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

export async function runCryptoSmokeTest(): Promise<boolean> {
  const key = await createEphemeralDataKey();
  const secret = `secure-smoke-${crypto.randomUUID()}`;
  const encrypted = await encryptText(secret, key);
  const decrypted = await decryptText(encrypted, key);
  return decrypted === secret;
}
