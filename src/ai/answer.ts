import type { Decision, TurnPacket } from './types.js';

/** The first balanced `{...}` in the text, or null. Braces inside strings are skipped. */
export function firstJsonObject(text: string): string | null {
  const start = text.indexOf('{');
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
    } else if (ch === '"') inString = true;
    else if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

/** A driver's reply turned into a decision, or null when it is not a usable one. */
export function parseAnswer(text: string, packet: TurnPacket): Decision | null {
  const raw = firstJsonObject(text);
  if (raw === null) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null) return null;
  const o = value as Record<string, unknown>;
  const option = typeof o['option'] === 'string' ? Number(o['option']) : o['option'];
  if (typeof option !== 'number' || !packet.options.some((p) => p.n === option)) return null;
  const cpRaw = typeof o['cp'] === 'number' && Number.isInteger(o['cp']) ? o['cp'] : 0;
  const cp = Math.max(0, Math.min(cpRaw, packet.maxCp));
  const fp = o['fp'] === true && packet.hasFp && cp === 0;
  const decision: Decision = { option, cp, fp };
  const say = o['say'];
  if (typeof say === 'string' && say.trim() !== '') decision.quote = say.trim().slice(0, 140);
  return decision;
}
