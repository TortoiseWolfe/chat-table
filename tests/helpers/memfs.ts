import type { FsLike } from '../../src/runtime/deps.js';

export function memFs(): FsLike & { files: Map<string, string>; modes: Map<string, number> } {
  const files = new Map<string, string>();
  const modes = new Map<string, number>();
  const missing = (path: string): Error =>
    Object.assign(new Error(`ENOENT: no such file: ${path}`), { code: 'ENOENT' });
  return {
    files,
    modes,
    readFile(path) {
      const text = files.get(path);
      return text === undefined ? Promise.reject(missing(path)) : Promise.resolve(text);
    },
    writeFile(path, data, mode) {
      files.set(path, data);
      modes.set(path, mode ?? 0o644);
      return Promise.resolve();
    },
    appendFile(path, data) {
      files.set(path, (files.get(path) ?? '') + data);
      if (!modes.has(path)) modes.set(path, 0o644);
      return Promise.resolve();
    },
    rename(from, to) {
      const text = files.get(from);
      if (text === undefined) return Promise.reject(missing(from));
      files.set(to, text);
      files.delete(from);
      const mode = modes.get(from);
      if (mode !== undefined) modes.set(to, mode);
      modes.delete(from);
      return Promise.resolve();
    },
    fsync(path) {
      return files.has(path) ? Promise.resolve() : Promise.reject(missing(path));
    },
    exists(path) {
      return Promise.resolve(files.has(path));
    },
    mkdir() {
      return Promise.resolve();
    },
  };
}
