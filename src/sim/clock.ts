interface Timer {
  id: number;
  at: number;
  fn: () => void;
}

export class FakeClock {
  private t: number;
  private nextId = 1;
  private timers: Timer[] = [];

  constructor(start: number) {
    this.t = start;
  }

  now(): number {
    return this.t;
  }

  setTimer(fn: () => void, ms: number): number {
    const id = this.nextId++;
    this.timers.push({ id, at: this.t + ms, fn });
    return id;
  }

  clearTimer(id: number): void {
    this.timers = this.timers.filter((x) => x.id !== id);
  }

  advanceTo(t: number): void {
    for (;;) {
      let next: Timer | undefined;
      for (const x of this.timers) {
        if (x.at <= t && (!next || x.at < next.at || (x.at === next.at && x.id < next.id))) {
          next = x;
        }
      }
      if (!next) break;
      this.timers = this.timers.filter((x) => x !== next);
      if (next.at > this.t) this.t = next.at;
      next.fn();
    }
    if (t > this.t) this.t = t;
  }
}
