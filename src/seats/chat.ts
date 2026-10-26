import type { Command } from '../engine/commands.js';
import type { GmCtx } from '../engine/ctx.js';

export function handleChat(ctx: GmCtx, cmd: Command): void {
  throw new Error('not built: ' + cmd.type);
}
