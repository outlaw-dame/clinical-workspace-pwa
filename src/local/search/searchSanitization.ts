import { replaceUnsafeControlCharacters } from "../../shared/textSanitation";
import type { SanitizedSearchQuery } from "./searchTypes";

const MAX_QUERY_LENGTH = 240;
const MAX_TOKEN_COUNT = 12;
const MIN_TOKEN_LENGTH = 2;
const TOKEN_PATTERN = /[\p{L}\p{N}][\p{L}\p{N}'-]*/gu;

export function sanitizeSearchQuery(value: string): SanitizedSearchQuery {
  const raw = replaceUnsafeControlCharacters(value)
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_QUERY_LENGTH);
  const normalized = raw.toLowerCase();
  const tokens = Array.from(normalized.matchAll(TOKEN_PATTERN), ([match]) => match)
    .map((token) => token.replace(/^[-']+|[-']+$/g, ""))
    .filter((token) => token.length >= MIN_TOKEN_LENGTH)
    .slice(0, MAX_TOKEN_COUNT);

  return { raw, normalized, tokens };
}

export function createSafePreview(value: string, query: SanitizedSearchQuery, maxLength = 180): string {
  const normalizedBody = replaceUnsafeControlCharacters(value, "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .trim();

  if (!normalizedBody) return "No body text.";

  const lowerBody = normalizedBody.toLowerCase();
  const firstMatchIndex = query.tokens.reduce<number | undefined>((nearest, token) => {
    const index = lowerBody.indexOf(token);
    if (index < 0) return nearest;
    return nearest === undefined ? index : Math.min(nearest, index);
  }, undefined);

  const start = Math.max(0, (firstMatchIndex ?? 0) - 48);
  const sliced = normalizedBody.slice(start, start + maxLength).trim();
  const prefix = start > 0 ? "…" : "";
  const suffix = start + maxLength < normalizedBody.length ? "…" : "";

  return `${prefix}${sliced}${suffix}`;
}
