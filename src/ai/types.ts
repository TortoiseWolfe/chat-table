export type DriverId = 'bot' | 'claude' | 'gemini' | 'groq';

export interface DriverSpec {
  id: DriverId;
  model: string;
}

export interface Caps {
  tokensPerTurn: number;
  callsPerTurn: number;
  tokensPerSession: number;
  callsPerSession: number;
}

export interface SeatConfig {
  seat: 0 | 1 | 2 | 3;
  /** Shown on the overlay, for example "Claude Haiku". */
  label: string;
  primary: DriverSpec;
  backup: DriverSpec;
  caps: Caps;
}

export interface TurnPacket {
  seat: number;
  round: number;
  /** Fixed role text, the same for every driver. */
  system: string;
  /** The seat's own view of this round. */
  user: string;
  options: { n: number; label: string }[];
  maxCp: number;
  hasFp: boolean;
}

export interface Decision {
  option: number;
  cp: number;
  fp: boolean;
  quote?: string;
}

export type Outcome = 'ok' | 'bad-answer' | 'http-error' | 'timeout' | 'capped' | 'no-key';

export interface DriverResult {
  decision: Decision | null;
  tokensIn: number;
  tokensOut: number;
  latencyMs: number;
  outcome: Outcome;
}

export interface Driver {
  readonly id: DriverId;
  readonly model: string;
  /** Asks for one decision. Never throws; failures come back as an outcome. */
  decide(packet: TurnPacket, deadlineAt: number): Promise<DriverResult>;
}

/** What a seat remembers between turns, whoever drives it. */
export interface SeatMemory {
  history: string[];
}
