/** Unicode NFKC, lowercase, every run outside [a-z0-9] becomes one space, trimmed. */
export function normalise(text: string): string {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Every window of 1 to `max` consecutive words, joined by single spaces. */
export function windows(words: string[], max: number): string[] {
  const out: string[] = [];
  for (let n = 1; n <= max; n++) {
    for (let j = 0; j + n <= words.length; j++) out.push(words.slice(j, j + n).join(' '));
  }
  return out;
}
