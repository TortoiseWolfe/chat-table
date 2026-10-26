export interface Points {
  cp: number;
  fp: number;
}

export function canSpendCp(points: Points, n: number, max: number): boolean {
  return n >= 1 && n <= max && n <= points.cp;
}

export function canSpendFp(points: Points, cpOnThisRoll: number): boolean {
  return points.fp >= 1 && cpOnThisRoll === 0;
}
