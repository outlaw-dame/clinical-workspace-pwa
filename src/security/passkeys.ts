import { decodeBase64, encodeBase64 } from "../local/crypto/base64";
import { getLocalDb } from "../local/db/client";
import { replaceUnsafeControlCharacters } from "../shared/textSanitation";

type CredentialRow = {
  credential_id: string;
};

export type PasskeyRegistrationResult = {
  credentialId: string;
  userHandle: string;
  displayName: string;
};

export type PasskeyAuthenticationResult = {
  credentialId: string;
  authenticatedAt: string;
};

const RELYING_PARTY_NAME = "Clinical Workspace";
const LOCAL_USER_NAME = "local-clinician";
const DEFAULT_DISPLAY_NAME = "Local clinician";
const CHALLENGE_BYTES = 32;
const USER_HANDLE_BYTES = 32;

export function canUsePasskeys(): boolean {
  return "PublicKeyCredential" in window && typeof navigator.credentials.create === "function";
}

export async function hasLocalPasskey(): Promise<boolean> {
  const db = await getLocalDb();
  const result = await db.query<CredentialRow>(
    "SELECT credential_id FROM webauthn_credentials ORDER BY created_at DESC LIMIT 1"
  );

  return typeof result.rows[0]?.credential_id === "string";
}

export async function registerLocalPasskey(
  displayName = DEFAULT_DISPLAY_NAME
): Promise<PasskeyRegistrationResult> {
  if (!canUsePasskeys()) {
    throw new Error("Passkeys are not available on this device/browser");
  }

  const safeDisplayName = sanitizeDisplayName(displayName);
  const userHandle = randomBase64Url(USER_HANDLE_BYTES);
  const credential = await navigator.credentials.create({
    publicKey: {
      challenge: randomBytes(CHALLENGE_BYTES),
      rp: {
        name: RELYING_PARTY_NAME
      },
      user: {
        id: decodeBase64Url(userHandle),
        name: LOCAL_USER_NAME,
        displayName: safeDisplayName
      },
      pubKeyCredParams: [
        { type: "public-key", alg: -7 },
        { type: "public-key", alg: -257 }
      ],
      authenticatorSelection: {
        residentKey: "preferred",
        userVerification: "required"
      },
      attestation: "none",
      timeout: 60_000
    }
  });

  if (!(credential instanceof PublicKeyCredential)) {
    throw new Error("Passkey registration was cancelled or failed");
  }

  const credentialId = encodeBase64Url(new Uint8Array(credential.rawId));
  const db = await getLocalDb();
  const now = new Date().toISOString();

  await db.query(
    `INSERT INTO webauthn_credentials (id, credential_id, user_handle, display_name, created_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [crypto.randomUUID(), credentialId, userHandle, safeDisplayName, now]
  );

  return {
    credentialId,
    userHandle,
    displayName: safeDisplayName
  };
}

export async function authenticateLocalPasskey(): Promise<PasskeyAuthenticationResult> {
  if (!canUsePasskeys()) {
    throw new Error("Passkeys are not available on this device/browser");
  }

  const credentialId = await getMostRecentCredentialId();
  const credential = await navigator.credentials.get({
    publicKey: {
      challenge: randomBytes(CHALLENGE_BYTES),
      allowCredentials: [
        {
          type: "public-key",
          id: decodeBase64Url(credentialId)
        }
      ],
      userVerification: "required",
      timeout: 60_000
    }
  });

  if (!(credential instanceof PublicKeyCredential)) {
    throw new Error("Passkey authentication was cancelled or failed");
  }

  const authenticatedCredentialId = encodeBase64Url(new Uint8Array(credential.rawId));
  if (authenticatedCredentialId !== credentialId) {
    throw new Error("Unexpected passkey credential returned");
  }

  const authenticatedAt = new Date().toISOString();
  const db = await getLocalDb();
  await db.query("UPDATE webauthn_credentials SET last_used_at = $1 WHERE credential_id = $2", [
    authenticatedAt,
    credentialId
  ]);

  return {
    credentialId,
    authenticatedAt
  };
}

async function getMostRecentCredentialId(): Promise<string> {
  const db = await getLocalDb();
  const result = await db.query<CredentialRow>(
    "SELECT credential_id FROM webauthn_credentials ORDER BY created_at DESC LIMIT 1"
  );
  const credentialId = result.rows[0]?.credential_id;

  if (!credentialId) {
    throw new Error("No local passkey has been registered yet");
  }

  return credentialId;
}

function randomBytes(length: number): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(length));
}

function randomBase64Url(length: number): string {
  return encodeBase64Url(randomBytes(length));
}

function encodeBase64Url(bytes: Uint8Array): string {
  return encodeBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeBase64Url(value: string): Uint8Array<ArrayBuffer> {
  const padded = `${value}${"=".repeat((4 - (value.length % 4)) % 4)}`;
  return decodeBase64(padded.replace(/-/g, "+").replace(/_/g, "/"));
}

function sanitizeDisplayName(value: string): string {
  return (
    replaceUnsafeControlCharacters(value)
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 80) || DEFAULT_DISPLAY_NAME
  );
}
