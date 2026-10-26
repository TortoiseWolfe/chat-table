"""Content guard, Python stand-in used by CI until src/guard (phase 2) replaces it.

Two checks over every tracked text file (see docs/content-guard.md):
  1. denylist: SHA-256 of every normalised 1-, 2- and 3-word window against guard/denylist.sha256;
  2. compatibility: a line holding a compatibility phrase and the rules system's name.
Prints file:line and the check's name, never the matched words. Exit 1 on any hit.

Usage: python3 -I scripts/guard.py [repo-root]
"""

import hashlib
import re
import subprocess
import sys
import unicodedata

ROOT = sys.argv[1] if len(sys.argv) > 1 else "."
SKIP = {"guard/denylist.sha256"}
COMPAT_EXEMPT = {"OGL.md", "docs/licensing.md"}

# Built from pieces so this file never pairs the two on one normalised line.
SYSTEM_WORDS = {"d" + "6", "open" + "d" + "6"}
COMPAT_PHRASES = [
    "compatible",
    "compatibility",
    "for use with",
    "powered by",
]


def norm(text):
    text = unicodedata.normalize("NFKC", text).lower()
    return re.sub(r"[^a-z0-9]+", " ", text).strip()


def load_hashes(root):
    with open(root + "/guard/denylist.sha256", encoding="utf-8") as f:
        return {l.strip() for l in f if l.strip() and not l.startswith("#")}


def tracked_files(root):
    out = subprocess.run(
        ["git", "-C", root, "ls-files", "-c", "-o", "--exclude-standard"],
        capture_output=True, text=True, check=True,
    ).stdout
    return [f for f in out.splitlines() if f and f not in SKIP]


def denylist_hit(words, hashes):
    for n in (1, 2, 3):
        for j in range(len(words) - n + 1):
            if hashlib.sha256(" ".join(words[j:j + n]).encode()).hexdigest() in hashes:
                return True
    return False


def compat_hit(normalised):
    padded = " " + normalised + " "
    has_phrase = any(" " + p + " " in padded for p in COMPAT_PHRASES)
    return has_phrase and any(w in SYSTEM_WORDS for w in normalised.split())


def main():
    hashes = load_hashes(ROOT)
    hits = 0
    for path in tracked_files(ROOT):
        try:
            with open(ROOT + "/" + path, encoding="utf-8") as f:
                lines = f.read().splitlines()
        except (UnicodeDecodeError, IsADirectoryError, FileNotFoundError):
            continue
        for i, line in enumerate(lines, 1):
            n = norm(line)
            if denylist_hit(n.split(), hashes):
                print(f"HIT {path}:{i} denylisted term")
                hits += 1
            if path not in COMPAT_EXEMPT and compat_hit(n):
                print(f"HIT {path}:{i} compatibility claim")
                hits += 1
    print("hits:", hits)
    sys.exit(1 if hits else 0)


if __name__ == "__main__":
    main()
