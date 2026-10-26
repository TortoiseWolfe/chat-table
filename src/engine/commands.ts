export interface Actor {
  userId: string;
  login: string;
  isMod: boolean;
  isBroadcaster: boolean;
}

export type AdminAction = 'start' | 'pause' | 'stop' | 'skip' | 'kick';

export type Command =
  | { type: 'join'; at: number; actor: Actor; character?: string }
  | { type: 'leave'; at: number; actor: Actor }
  | { type: 'pick'; at: number; actor: Actor; option: number }
  | { type: 'roll'; at: number; actor: Actor; skill: string }
  | { type: 'say'; at: number; actor: Actor; text: string }
  | { type: 'cp'; at: number; actor: Actor; count: number }
  | { type: 'fp'; at: number; actor: Actor }
  | { type: 'query'; at: number; actor: Actor; what: 'sheet' | 'status' | 'characters' | 'help' }
  | { type: 'admin'; at: number; actor: Actor; action: AdminAction; target?: string }
  | { type: 'host'; at: number; action: AdminAction; target?: string }
  | { type: 'tick'; at: number }
  | { type: 'offline'; at: number };
