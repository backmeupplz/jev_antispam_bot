-- Additive, idempotent upgrade under the same advisory transaction lock as 004.
CREATE TABLE IF NOT EXISTS deletion_audit_parts (
  audit_id UUID NOT NULL REFERENCES deletion_audit_outbox(id) ON DELETE CASCADE,
  sequence INTEGER NOT NULL CHECK (sequence BETWEEN 1 AND 256),
  report TEXT NOT NULL CHECK (octet_length(report) BETWEEN 1 AND 16000 AND char_length(report) <= 4000),
  state TEXT NOT NULL CHECK (state IN ('pending','sending','sent','send_unknown','terminal')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 5),
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  lease_until TIMESTAMPTZ,
  lease_token UUID,
  receipt_message_id BIGINT CHECK (receipt_message_id BETWEEN 1 AND 9007199254740991),
  PRIMARY KEY (audit_id,sequence),
  CHECK ((state = 'sending') = (lease_until IS NOT NULL)),
  CHECK ((state = 'sending') = (lease_token IS NOT NULL)),
  CHECK (receipt_message_id IS NULL OR state = 'sent')
);
-- Old sent rows have no recoverable receipt: retain their truthful historic state,
-- never invent an ID and never resend. Old in-flight leases recover as unknown.
INSERT INTO deletion_audit_parts(audit_id,sequence,report,state,attempts,next_attempt_at,lease_until,lease_token)
SELECT id,1,report,CASE WHEN state IN ('sending','sent','send_unknown','terminal') THEN state ELSE 'pending' END,
  attempts,next_attempt_at,CASE WHEN state='sending' THEN lease_until END,CASE WHEN state='sending' THEN lease_token END
FROM deletion_audit_outbox o WHERE NOT EXISTS (SELECT 1 FROM deletion_audit_parts p WHERE p.audit_id=o.id)
ON CONFLICT DO NOTHING;
