import type { EncryptedPayload } from "./envelope";

type WorkerRequest =
  | { id: string; type: "initialize" }
  | { id: string; type: "encrypt"; plaintext: string }
  | { id: string; type: "decrypt"; payload: EncryptedPayload }
  | { id: string; type: "clear" };

type WorkerRequestBody =
  | { type: "initialize" }
  | { type: "encrypt"; plaintext: string }
  | { type: "decrypt"; payload: EncryptedPayload }
  | { type: "clear" };

type WorkerResponse =
  | { id: string; ok: true; type: "initialized" }
  | { id: string; ok: true; type: "encrypted"; payload: EncryptedPayload }
  | { id: string; ok: true; type: "decrypted"; plaintext: string }
  | { id: string; ok: true; type: "cleared" }
  | { id: string; ok: false; error: string };

type PendingRequest = {
  resolve: (response: WorkerResponse) => void;
  reject: (error: Error) => void;
  timeoutId: number;
};

const REQUEST_TIMEOUT_MS = 8_000;
const pendingRequests = new Map<string, PendingRequest>();

let worker: Worker | undefined;
let initialized = false;
let initializePromise: Promise<void> | undefined;

export async function initializeCryptoSession(): Promise<void> {
  if (initialized) return;
  initializePromise ??= request({ type: "initialize" })
    .then((response) => {
      if (!response.ok || response.type !== "initialized") {
        throw new Error("Crypto worker failed to initialize");
      }

      initialized = true;
    })
    .catch((error: unknown) => {
      initialized = false;
      initializePromise = undefined;
      terminateWorker();
      throw error;
    });

  return initializePromise;
}

export async function encryptInCryptoWorker(plaintext: string): Promise<EncryptedPayload> {
  await initializeCryptoSession();
  const response = await request({ type: "encrypt", plaintext });

  if (!response.ok || response.type !== "encrypted") {
    throw new Error("Crypto worker encryption failed");
  }

  return response.payload;
}

export async function decryptInCryptoWorker(payload: EncryptedPayload): Promise<string> {
  await initializeCryptoSession();
  const response = await request({ type: "decrypt", payload });

  if (!response.ok || response.type !== "decrypted") {
    throw new Error("Crypto worker decryption failed");
  }

  return response.plaintext;
}

export async function clearCryptoSession(): Promise<void> {
  if (!worker) {
    resetSessionState();
    return;
  }

  try {
    const response = await request({ type: "clear" });
    if (!response.ok || response.type !== "cleared") {
      throw new Error("Crypto worker failed to clear the session");
    }
  } finally {
    resetSessionState();
    terminateWorker();
  }
}

async function request(message: WorkerRequestBody): Promise<WorkerResponse> {
  const activeWorker = getWorker();
  const id = crypto.randomUUID();
  const requestMessage: WorkerRequest = { ...message, id };

  return new Promise<WorkerResponse>((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      pendingRequests.delete(id);
      reject(new Error("Crypto worker request timed out"));
    }, REQUEST_TIMEOUT_MS);

    pendingRequests.set(id, { resolve, reject, timeoutId });
    activeWorker.postMessage(requestMessage);
  }).then((response) => {
    if (!response.ok) {
      throw new Error(response.error);
    }

    return response;
  });
}

function getWorker(): Worker {
  if (worker) return worker;

  worker = new Worker(new URL("./cryptoWorker.ts", import.meta.url), { type: "module" });
  worker.addEventListener("message", handleWorkerMessage);
  worker.addEventListener("error", handleWorkerError);

  return worker;
}

function handleWorkerMessage(event: MessageEvent<WorkerResponse>): void {
  const request = pendingRequests.get(event.data.id);
  if (!request) return;

  window.clearTimeout(request.timeoutId);
  pendingRequests.delete(event.data.id);
  request.resolve(event.data);
}

function handleWorkerError(event: ErrorEvent): void {
  const message = event.message || "Crypto worker failed";

  for (const [id, request] of pendingRequests.entries()) {
    window.clearTimeout(request.timeoutId);
    request.reject(new Error(message));
    pendingRequests.delete(id);
  }

  resetSessionState();
  terminateWorker();
}

function resetSessionState(): void {
  initialized = false;
  initializePromise = undefined;
}

function terminateWorker(): void {
  worker?.terminate();
  worker = undefined;
}
