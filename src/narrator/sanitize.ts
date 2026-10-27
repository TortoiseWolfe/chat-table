const MAX_ANSWER = 500;
const LINK = /https?:\/\/|www\.|\.\w{2,}\//i;

/** Clean one model answer for chat, or null when the caller must use the templated line. */
export function sanitize(text: string): string | null {
  const t = text.replace(/\s+/g, ' ').trim();
  if (t === '' || t.length > MAX_ANSWER) return null;
  if (LINK.test(t)) return null;
  if (/@[A-Za-z]/.test(t)) return null;
  if (t.startsWith('/') || t.startsWith('.')) return null;
  return t;
}
