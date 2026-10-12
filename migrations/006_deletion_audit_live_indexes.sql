-- Additive and idempotent, under the same advisory transaction lock as 004/005. Each index is created
-- only when missing: CREATE INDEX IF NOT EXISTS would still lock the table on every startup.
-- Capacity, stale-lease recovery and claims touch only live rows, so retained finished rows stay off the hot path.
-- 004 is skipped once the schema exists; keep its sink-row guarantee (row lock only).
INSERT INTO deletion_audit_sink(chat_id) VALUES (-5477973916) ON CONFLICT DO NOTHING;
DO $$
BEGIN
  IF to_regclass('deletion_audit_parts_live') IS NULL OR to_regclass('deletion_audit_outbox_leased') IS NULL
     OR to_regclass('deletion_audit_outbox_live') IS NULL THEN
    -- Every prepare/tick transaction takes the sink row before parts/outbox. Holding it first means a live
    -- replica cannot hold one table while waiting for the other, so the SHARE locks below cannot deadlock.
    PERFORM 1 FROM deletion_audit_sink FOR UPDATE;
    CREATE INDEX IF NOT EXISTS deletion_audit_parts_live ON deletion_audit_parts(audit_id) WHERE state IN ('pending','sending');
    -- Finished parents (delete_failed etc.) keep pending parts, so both sides of the capacity join need a live index.
    CREATE INDEX IF NOT EXISTS deletion_audit_outbox_live ON deletion_audit_outbox(id) WHERE state IN ('intent','pending','sending');
    CREATE INDEX IF NOT EXISTS deletion_audit_outbox_leased ON deletion_audit_outbox(lease_until) WHERE state IN ('intent','sending');
  END IF;
END $$;
