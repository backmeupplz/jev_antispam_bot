CREATE TABLE IF NOT EXISTS known_chats (
  chat_id BIGINT PRIMARY KEY,
  first_seen_at TIMESTAMPTZ NOT NULL,
  last_seen_at TIMESTAMPTZ NOT NULL,
  chat_type TEXT,
  membership_active BOOLEAN,
  successful_deletions BIGINT NOT NULL DEFAULT 0 CHECK (successful_deletions >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS deletion_dedup (
  chat_id BIGINT NOT NULL,
  message_id BIGINT NOT NULL,
  deleted_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (chat_id, message_id)
);

CREATE INDEX IF NOT EXISTS deletion_dedup_deleted_at_idx
  ON deletion_dedup (deleted_at);
