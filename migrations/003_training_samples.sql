CREATE TABLE IF NOT EXISTS training_samples (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  chat_id BIGINT NOT NULL,
  message_id BIGINT NOT NULL,
  model TEXT NOT NULL,
  should_delete BOOLEAN NOT NULL,
  probability DOUBLE PRECISION NOT NULL,
  strongest_signal TEXT NOT NULL,
  request JSONB NOT NULL,
  answers JSONB NOT NULL
);
CREATE INDEX IF NOT EXISTS training_samples_created ON training_samples(created_at);
