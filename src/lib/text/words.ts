const WORD = /\p{N}+(?:[.,]\p{N}+)*|[\p{L}\p{N}][\p{L}\p{N}'’\-]*/gu;

export function countWords(text: string): number {
  return text.match(WORD)?.length ?? 0;
}

export function words(text: string): string[] {
  return text.match(WORD) ?? [];
}

export function countChars(text: string): number {
  return [...text].length;
}

export function readingMinutes(wordCount: number): number {
  return Math.max(1, Math.round(wordCount / 230));
}
