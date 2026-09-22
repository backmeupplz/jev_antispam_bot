CREATE TABLE IF NOT EXISTS known_chats (
  chat_id BIGINT PRIMARY KEY,
  first_seen_at TIMESTAMPTZ NOT NULL,
  last_seen_at TIMESTAMPTZ NOT NULL,
  chat_type TEXT,
  membership_active BOOLEAN,
  successful_deletions BIGINT NOT NULL DEFAULT 0 CHECK (successful_deletions >= 0),
  processed_messages BIGINT NOT NULL DEFAULT 0 CHECK (processed_messages >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE known_chats
  ADD COLUMN IF NOT EXISTS processed_messages BIGINT NOT NULL DEFAULT 0
  CHECK (processed_messages >= 0);

CREATE TABLE IF NOT EXISTS deletion_dedup (
  chat_id BIGINT NOT NULL,
  message_id BIGINT NOT NULL,
  deleted_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (chat_id, message_id)
);

CREATE INDEX IF NOT EXISTS deletion_dedup_deleted_at_idx
  ON deletion_dedup (deleted_at);

CREATE TABLE IF NOT EXISTS classification_attempt_dedup (
  update_id BIGINT PRIMARY KEY,
  chat_id BIGINT NOT NULL,
  message_id BIGINT NOT NULL,
  attempted_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS classification_attempt_dedup_attempted_at_idx
  ON classification_attempt_dedup (attempted_at);
