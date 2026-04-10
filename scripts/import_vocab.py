#!/usr/bin/env python3
"""
Import vocabulary from a published Google Sheets CSV into the khmer_quiz PostgreSQL database.

Column A = English, Column B = Khmer phonetic.

Usage:
  python3 import_vocab.py

Run inside the app container:
  docker exec khmer_quiz_app python3 /import_vocab.py

The script is idempotent: it skips duplicates (matched on english+khmer).
"""

import csv
import io
import os
import urllib.request

import psycopg2

SHEETS_CSV_URL = (
    "https://docs.google.com/spreadsheets/d/e/"
    "2PACX-1vSFeHAKYQgMzzcSKJue8Zzc3A1R_pw6uc9ewiTcWY_jRNbpFUWpHrhwCQdkWZLiaTar8naN9SsPd4v6"
    "/pub?gid=0&single=true&output=csv"
)

DATABASE_URL = os.environ.get("DATABASE_URL")
if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL environment variable is required")


def fetch_words():
    with urllib.request.urlopen(SHEETS_CSV_URL) as response:
        content = response.read().decode("utf-8")

    words = []
    reader = csv.reader(io.StringIO(content))
    next(reader, None)  # skip header row
    for row in reader:
        if len(row) < 2:
            continue
        english = row[0].strip()
        khmer   = row[1].strip()
        if english and khmer:
            words.append((english, khmer))
    return words


def import_words(words):
    conn = psycopg2.connect(DATABASE_URL)
    cur  = conn.cursor()
    added   = 0
    skipped = 0
    for english, khmer in words:
        cur.execute(
            "SELECT id FROM vocab WHERE LOWER(english)=%s AND LOWER(khmer)=%s",
            (english.lower(), khmer.lower())
        )
        if cur.fetchone():
            skipped += 1
            continue
        cur.execute(
            "INSERT INTO vocab (english, khmer, category) VALUES (%s, %s, %s)",
            (english, khmer, "general")
        )
        added += 1
    conn.commit()
    conn.close()
    return added, skipped


def main():
    print(f"Fetching vocab from Google Sheets…")
    words = fetch_words()
    print(f"Parsed {len(words)} words")
    added, skipped = import_words(words)
    print(f"✓ Added: {added}  |  Skipped (duplicate): {skipped}")


if __name__ == "__main__":
    main()
