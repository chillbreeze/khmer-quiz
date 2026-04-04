-- Khmer Quiz Database Schema

CREATE TABLE IF NOT EXISTS vocab (
    id          SERIAL PRIMARY KEY,
    english     TEXT NOT NULL,
    khmer       TEXT NOT NULL,
    notes       TEXT,
    category    TEXT DEFAULT 'general',
    active      BOOLEAN DEFAULT TRUE,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Future-proofing: stats table per session/user
CREATE TABLE IF NOT EXISTS quiz_results (
    id          SERIAL PRIMARY KEY,
    session_id  TEXT NOT NULL,
    vocab_id    INTEGER REFERENCES vocab(id) ON DELETE SET NULL,
    direction   TEXT CHECK (direction IN ('en_to_km', 'km_to_en')),
    mode        TEXT CHECK (mode IN ('type', 'choice')),
    correct     BOOLEAN NOT NULL,
    answered_at TIMESTAMPTZ DEFAULT NOW()
);

-- Future: users table stub (not used yet)
CREATE TABLE IF NOT EXISTS users (
    id          SERIAL PRIMARY KEY,
    username    TEXT UNIQUE NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast quiz lookups
CREATE INDEX IF NOT EXISTS idx_vocab_active ON vocab(active);
CREATE INDEX IF NOT EXISTS idx_results_session ON quiz_results(session_id);
