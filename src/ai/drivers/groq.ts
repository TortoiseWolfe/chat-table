import type { Deps } from '../../runtime/deps.js';
import type { Driver } from '../types.js';
import { asList, asRecord, createHttpDriver, num } from './http.js';

export const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MAX_OUTPUT_TOKENS = 600;

export function createGroqDriver(opts: {
  model: string;
  key: string | null;
  deps: Pick<Deps, 'now' | 'setTimer' | 'clearTimer' | 'fetch' | 'log'>;
}): Driver {
  return createHttpDriver({
    id: 'groq',
    model: opts.model,
    key: opts.key,
    deps: opts.deps,
    request: (packet, key, model) => ({
      url: GROQ_URL,
      headers: { authorization: `Bearer ${key}` },
      body: {
        model,
        max_completion_tokens: MAX_OUTPUT_TOKENS,
        reasoning_effort: 'low',
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: packet.system },
          { role: 'user', content: packet.user },
        ],
      },
    }),
    read(body) {
      const b = asRecord(body);
      if (!b) return null;
      const message = asRecord(asRecord(asList(b['choices'])[0])?.['message']);
      const text = message?.['content'];
      if (typeof text !== 'string') return null;
      const usage = asRecord(b['usage']);
      return {
        text,
        tokensIn: num(usage?.['prompt_tokens']),
        tokensOut: num(usage?.['completion_tokens']),
      };
    },
  });
}
