import type { LocalEmbeddingModelManifest } from "./embeddingManifest";
import { LocalEmbeddingProviderError } from "./embeddingProviderErrors";

const MAX_PROMPT_FIELD_LENGTH = 8_000;
const FALLBACK_DOCUMENT_TITLE = "none";

export type EmbeddingDocumentPromptInput = {
  title?: string;
  text: string;
};

export function createEmbeddingQueryPrompt(manifest: LocalEmbeddingModelManifest, query: string): string {
  const policy = requirePromptPolicy(manifest);
  return `${policy.queryPrefix}${sanitizePromptField(query)}`;
}

export function createEmbeddingDocumentPrompt(
  manifest: LocalEmbeddingModelManifest,
  input: EmbeddingDocumentPromptInput
): string {
  const policy = requirePromptPolicy(manifest);
  const title = sanitizePromptField(input.title ?? FALLBACK_DOCUMENT_TITLE) || FALLBACK_DOCUMENT_TITLE;
  const text = sanitizePromptField(input.text);

  return `${policy.documentTitlePrefix}${title}${policy.documentSeparator}${policy.documentTextPrefix}${text}`;
}

function requirePromptPolicy(manifest: LocalEmbeddingModelManifest): NonNullable<LocalEmbeddingModelManifest["promptPolicy"]> {
  if (manifest.promptPolicy === undefined) {
    throw new LocalEmbeddingProviderError("invalid_manifest", "Embedding manifest is missing a prompt policy");
  }

  return manifest.promptPolicy;
}

function sanitizePromptField(value: string): string {
  let sanitized = "";
  let pendingSpace = false;

  for (const character of value) {
    if (sanitized.length >= MAX_PROMPT_FIELD_LENGTH) break;

    if (isPromptFieldSeparator(character)) {
      pendingSpace = sanitized.length > 0;
      continue;
    }

    if (pendingSpace && sanitized.length < MAX_PROMPT_FIELD_LENGTH) {
      sanitized += " ";
    }

    pendingSpace = false;

    if (sanitized.length + character.length > MAX_PROMPT_FIELD_LENGTH) break;
    sanitized += character;
  }

  return sanitized.trimEnd();
}

function isPromptFieldSeparator(character: string): boolean {
  return isUnsafeControlCharacter(character) || character.trim().length === 0;
}

function isUnsafeControlCharacter(character: string): boolean {
  const code = character.charCodeAt(0);
  return (code >= 0 && code <= 8) || code === 11 || code === 12 || (code >= 14 && code <= 31) || code === 127;
}
