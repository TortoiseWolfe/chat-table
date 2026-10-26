import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import {
  SPECIAL_DIE_NAME,
  SPECIAL_DIE_SHORT,
  specialDieName,
} from '../../src/engine/terms.js';

function getTsFiles(dir: string): string[] {
  let files: string[] = [];
  try {
    const entries = readdirSync(dir);
    for (const entry of entries) {
      const fullPath = join(dir, entry);
      const stat = statSync(fullPath);
      if (stat.isDirectory()) {
        files = files.concat(getTsFiles(fullPath));
      } else if (fullPath.endsWith('.ts')) {
        files.push(fullPath);
      }
    }
  } catch {
    // Directory might not exist yet
  }
  return files;
}

describe('terms', () => {
  it('returns the constant when there is no pack override', () => {
    expect(specialDieName()).toBe(SPECIAL_DIE_NAME);
    expect(specialDieName({})).toBe(SPECIAL_DIE_NAME);
    expect(specialDieName({ terms: {} })).toBe(SPECIAL_DIE_NAME);
  });

  it('returns the pack override when provided', () => {
    expect(specialDieName({ terms: { specialDie: 'Spark Die' } })).toBe('Spark Die');
  });

  it('no other file under src/ or packs/ contains the constant value', () => {
    const files = [...getTsFiles('src'), ...getTsFiles('packs')];
    for (const file of files) {
      const normalizedPath = file.replace(/\\/g, '/');
      if (normalizedPath.endsWith('src/engine/terms.ts')) {
        continue;
      }
      const content = readFileSync(file, 'utf8');
      expect(content).not.toContain(SPECIAL_DIE_NAME);
    }
  });

  it('exports SPECIAL_DIE_SHORT', () => {
    expect(SPECIAL_DIE_SHORT).toBe('WD');
  });
});
