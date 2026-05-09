export function replaceUnsafeControlCharacters(value: string, replacement = " "): string {
  let sanitized = "";

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index] ?? "";
    sanitized += isUnsafeControlCharacter(character) ? replacement : character;
  }

  return sanitized;
}

function isUnsafeControlCharacter(character: string): boolean {
  const code = character.charCodeAt(0);
  return (code >= 0 && code <= 8) || code === 11 || code === 12 || (code >= 14 && code <= 31) || code === 127;
}
