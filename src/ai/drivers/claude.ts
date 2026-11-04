import type { Deps } from '../../runtime/deps.js';
import type { Driver } from '../types.js';
import { asList, asRecord, createHttpDriver, num } from './http.js';

export const CLAUDE_URL = 'https://api.anthropic.com/v1/messages';
const MAX_OUTPUT_TOKENS = 150;

export function createClaudeDriver(opts: {
  model: string;
  key: string | null;
  deps: Pick<Deps, 'now' | 'setTimer' | 'clearTimer' | 'fetch' | 'log'>;
}): Driver {
  return createHttpDriver({
    id: 'claude',
    model: opts.model,
    key: opts.key,
    deps: opts.deps,
    request: (packet, key, model) => ({
      url: CLAUDE_URL,
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: {
        model,
        max_tokens: MAX_OUTPUT_TOKENS,
        system: packet.system,
        messages: [{ role: 'user', content: packet.user }],
      },
    }),
    read(body) {
      const b = asRecord(body);
      if (!b) return null;
      const text = asList(b['content'])
        .map((c) => asRecord(c))
        .find((c) => c?.['type'] === 'text')?.['text'];
      if (typeof text !== 'string') return null;
      const usage = asRecord(b['usage']);
      return {
        text,
        tokensIn: num(usage?.['input_tokens']),
        tokensOut: num(usage?.['output_tokens']),
      };
    },
  });
}
