export type EncryptedBytes = Uint8Array<ArrayBuffer>;

export type VaultWriteResult = {
  path: string;
  bytesWritten: number;
};

const VAULT_DIRECTORY = "encrypted-vault";

export async function assertOpfsAvailable(): Promise<void> {
  if (!("storage" in navigator) || typeof navigator.storage.getDirectory !== "function") {
    throw new Error("OPFS is not available in this browser.");
  }
}

async function getVaultDirectory(): Promise<FileSystemDirectoryHandle> {
  await assertOpfsAvailable();
  const root = await navigator.storage.getDirectory();
  return root.getDirectoryHandle(VAULT_DIRECTORY, { create: true });
}

export async function writeEncryptedBlob(
  name: string,
  encryptedBytes: EncryptedBytes
): Promise<VaultWriteResult> {
  const safeName = sanitizeVaultName(name);
  const directory = await getVaultDirectory();
  const file = await directory.getFileHandle(safeName, { create: true });
  const writable = await file.createWritable();

  try {
    await writable.write(encryptedBytes);
  } finally {
    await writable.close();
  }

  return {
    path: `${VAULT_DIRECTORY}/${safeName}`,
    bytesWritten: encryptedBytes.byteLength
  };
}

export async function readEncryptedBlob(name: string): Promise<EncryptedBytes> {
  const safeName = sanitizeVaultName(name);
  const directory = await getVaultDirectory();
  const file = await directory.getFileHandle(safeName);
  const blob = await file.getFile();
  const buffer = await blob.arrayBuffer();
  return new Uint8Array(buffer);
}

export async function deleteEncryptedBlob(name: string): Promise<void> {
  const safeName = sanitizeVaultName(name);
  const directory = await getVaultDirectory();
  await directory.removeEntry(safeName);
}

export function sanitizeVaultName(name: string): string {
  const normalized = name.trim().toLowerCase().replace(/[^a-z0-9._-]/g, "-");
  const collapsed = normalized.replace(/-+/g, "-").replace(/^[-.]+|[-.]+$/g, "");

  if (!collapsed) {
    return `${crypto.randomUUID()}.bin`;
  }

  return collapsed.slice(0, 128);
}
