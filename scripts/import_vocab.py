#!/usr/bin/env python3
"""
Import Anki tab-separated export into the khmer_quiz PostgreSQL database.

Usage:
  python3 import_vocab.py path/to/Khmer_-_Palynath.txt

Run this from the host, pointing at the DB through the exposed port,
OR exec into the app container and run it there.

The script is idempotent: it skips duplicates (matched on english+khmer).
"""

import sys
import re
import html
import psycopg2

# ── Config ─────────────────────────────────────────────────────────────────────
# If running from host with port 5432 exposed, use localhost.
# If running inside the app container, use 'db'.
import os
DATABASE_URL = os.environ.get("DATABASE_URL")
if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL environment variable is required")

def strip_html(text: str) -> str:
    """Remove HTML tags and decode HTML entities."""
    text = re.sub(r'<br\s*/?>', ' / ', text, flags=re.IGNORECASE)
    text = re.sub(r'<[^>]+>', '', text)
    text = html.unescape(text)
    text = re.sub(r'\s+', ' ', text).strip()
    return text


def parse_file(path: str):
    """Parse Anki txt export. Returns list of (english, khmer) tuples."""
    words = []
    with open(path, encoding='utf-8') as f:
        for line in f:
            line = line.rstrip('\n')
            # Skip comment / metadata lines
            if line.startswith('#') or not line.strip():
                continue
            parts = line.split('\t')
            if len(parts) < 2:
                continue
            english = strip_html(parts[0])
            khmer   = strip_html(parts[1])
            if english and khmer:
                words.append((english, khmer))
    return words


def import_words(words):
    conn = psycopg2.connect(DATABASE_URL)
    cur  = conn.cursor()
    added   = 0
    skipped = 0
    for english, khmer in words:
        # Check for duplicate
        cur.execute(
            "SELECT id FROM vocab WHERE LOWER(english)=%s AND LOWER(khmer)=%s",
            (english.lower(), khmer.lower())
        )
        if cur.fetchone():
            skipped += 1
            continue
        cur.execute(
            "INSERT INTO vocab (english, khmer, category) VALUES (%s, %s, %s)",
            (english, khmer, 'general')
        )
        added += 1
    conn.commit()
    conn.close()
    return added, skipped


def main():
    if len(sys.argv) < 2:
        print("Usage: python3 import_vocab.py <path-to-anki.txt>")
        sys.exit(1)
    path  = sys.argv[1]
    words = parse_file(path)
    print(f"Parsed {len(words)} words from {path}")
    added, skipped = import_words(words)
    print(f"✓ Added: {added}  |  Skipped (duplicate): {skipped}")


if __name__ == "__main__":
    main()
