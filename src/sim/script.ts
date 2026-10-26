export interface ScriptLine {
  kind: 'once' | 'every';
  offsetMs: number;
  login: string;
  text: string;
  line: number;
}

export function parseScript(text: string): ScriptLine[] {
  const out: ScriptLine[] = [];
  text.split(/\r?\n/).forEach((raw, i) => {
    const n = i + 1;
    const trimmed = raw.trim();
    if (trimmed === '' || trimmed.startsWith('#')) return;
    const m = /^(every\s+)?(\S+)\s+(\S+)\s+(\S[\s\S]*)$/.exec(trimmed);
    if (!m) throw new Error(`script line ${n}: expected "<seconds> <login> <chat text>"`);
    const seconds = Number(m[2]);
    if (!Number.isFinite(seconds) || seconds < 0) {
      throw new Error(`script line ${n}: bad seconds "${m[2] ?? ''}"`);
    }
    out.push({
      kind: m[1] ? 'every' : 'once',
      offsetMs: Math.round(seconds * 1000),
      login: m[3] ?? '',
      text: m[4] ?? '',
      line: n,
    });
  });
  return out;
}
