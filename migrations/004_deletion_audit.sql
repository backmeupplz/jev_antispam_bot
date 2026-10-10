-- Initialization runs under a transaction-scoped advisory lock (see audit-outbox.ts).
CREATE TABLE IF NOT EXISTS deletion_audit_sink (
  chat_id BIGINT PRIMARY KEY CHECK (chat_id = -5477973916),
  next_send_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  prepared BIGINT NOT NULL DEFAULT 0,
  refused BIGINT NOT NULL DEFAULT 0,
  expired BIGINT NOT NULL DEFAULT 0,
  expired_undelivered BIGINT NOT NULL DEFAULT 0
);
INSERT INTO deletion_audit_sink(chat_id) VALUES (-5477973916) ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS deletion_audit_outbox (
  id UUID PRIMARY KEY,
  chat_id BIGINT NOT NULL CHECK (chat_id <> -5477973916),
  message_id BIGINT NOT NULL CHECK (message_id > 0),
  report TEXT NOT NULL CHECK (octet_length(report) BETWEEN 1 AND 16000 AND char_length(report) <= 4000),
  state TEXT NOT NULL CHECK (state IN ('intent','delete_failed','delete_unknown','pending','sending','sent','send_unknown','terminal')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  lease_until TIMESTAMPTZ,
  lease_token UUID,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 5),
  UNIQUE (chat_id, message_id),
  CHECK (expires_at > created_at),
  CHECK ((state IN ('intent','sending')) = (lease_until IS NOT NULL)),
  CHECK ((state = 'sending') = (lease_token IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS deletion_audit_pending ON deletion_audit_outbox(next_attempt_at) WHERE state = 'pending';
CREATE INDEX IF NOT EXISTS deletion_audit_expiry ON deletion_audit_outbox(expires_at);
