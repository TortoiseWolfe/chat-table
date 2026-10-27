import type { Deps } from '../runtime/deps.js';

export interface NarratorConfig {
  url: string;
  model: string;
  apiKey?: string;
  timeoutMs: number;
}

export type ClientDeps = Pick<Deps, 'fetch' | 'setTimer' | 'clearTimer'>;

export type ChatResult = { ok: true; content: string } | { ok: false; reason: string };

interface Message {
  role: 'system' | 'user';
  content: string;
}

/** One chat-completions call. Never throws; the reason is a short word, never the response body. */
export async function chatCompletion(
  cfg: NarratorConfig,
  deps: ClientDeps,
  messages: Message[]
): Promise<ChatResult> {
  const controller = new AbortController();
  const timer = deps.setTimer(() => controller.abort(), cfg.timeoutMs);
  try {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (cfg.apiKey) headers['authorization'] = `Bearer ${cfg.apiKey}`;
    const res = await deps.fetch(`${cfg.url.replace(/\/+$/, '')}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: cfg.model,
        max_tokens: 120,
        temperature: 0.8,
        messages,
      }),
      signal: controller.signal,
    });
    if (!res.ok) return { ok: false, reason: `status ${String(res.status)}` };
    const body = (await res.json()) as {
      choices?: { message?: { content?: unknown } }[];
    } | null;
    const content = body?.choices?.[0]?.message?.content;
    if (typeof content !== 'string') return { ok: false, reason: 'no content' };
    return { ok: true, content };
  } catch {
    return { ok: false, reason: controller.signal.aborted ? 'timeout' : 'request failed' };
  } finally {
    deps.clearTimer(timer);
  }
}
