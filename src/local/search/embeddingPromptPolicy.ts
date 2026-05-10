import { replaceUnsafeControlCharacters } from "../../shared/textSanitation";
import type { LocalEmbeddingModelManifest } from "./embeddingManifest";
import { LocalEmbeddingProviderError } from "./embeddingProviderErrors";

const MAX_PROMPT_FIELD_LENGTH = 8_000;
const MAX_PROMPT_SANITATION_INPUT_LENGTH = 16_000;
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
  const boundedInput = value.slice(0, MAX_PROMPT_SANITATION_INPUT_LENGTH);

  return replaceUnsafeControlCharacters(boundedInput)
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_PROMPT_FIELD_LENGTH);
}
