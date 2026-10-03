CREATE TABLE IF NOT EXISTS spam_verdict_cache (
  fingerprint CHAR(64) PRIMARY KEY CHECK (fingerprint ~ '^[0-9a-f]{64}$'),
  revision CHAR(64) NOT NULL,
  verdict BOOLEAN NOT NULL CHECK (verdict),
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS spam_verdict_cache_expiry ON spam_verdict_cache(expires_at);
