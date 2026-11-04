import type { Deps } from '../../runtime/deps.js';
import type { Driver } from '../types.js';
import { asList, asRecord, createHttpDriver, num } from './http.js';

export const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const MAX_OUTPUT_TOKENS = 600;

export function createGeminiDriver(opts: {
  model: string;
  key: string | null;
  deps: Pick<Deps, 'now' | 'setTimer' | 'clearTimer' | 'fetch' | 'log'>;
}): Driver {
  return createHttpDriver({
    id: 'gemini',
    model: opts.model,
    key: opts.key,
    deps: opts.deps,
    request: (packet, key, model) => ({
      url: `${GEMINI_BASE}/${encodeURIComponent(model)}:generateContent`,
      headers: { 'x-goog-api-key': key },
      body: {
        systemInstruction: { parts: [{ text: packet.system }] },
        contents: [{ role: 'user', parts: [{ text: packet.user }] }],
        generationConfig: {
          maxOutputTokens: MAX_OUTPUT_TOKENS,
          responseMimeType: 'application/json',
        },
      },
    }),
    read(body) {
      const b = asRecord(body);
      if (!b) return null;
      const content = asRecord(asRecord(asList(b['candidates'])[0])?.['content']);
      const text = asList(content?.['parts'])
        .map((p) => asRecord(p))
        .map((p) => p?.['text'])
        .filter((t): t is string => typeof t === 'string')
        .join('');
      if (text === '') return null;
      const usage = asRecord(b['usageMetadata']);
      return {
        text,
        tokensIn: num(usage?.['promptTokenCount']),
        // Thinking tokens are billed as output.
        tokensOut: num(usage?.['candidatesTokenCount']) + num(usage?.['thoughtsTokenCount']),
      };
    },
  });
}
