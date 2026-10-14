CREATE TABLE IF NOT EXISTS repeat_sends (
  chat_id BIGINT NOT NULL,
  message_id BIGINT NOT NULL,
  copy_key CHAR(64) NOT NULL CHECK (copy_key ~ '^[0-9a-f]{64}$'),
  sent_at TIMESTAMPTZ NOT NULL,
  handled BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (chat_id, message_id)
);
CREATE INDEX IF NOT EXISTS repeat_sends_copy_key ON repeat_sends(copy_key, sent_at);
CREATE INDEX IF NOT EXISTS repeat_sends_sent_at ON repeat_sends(sent_at);
