-- Reply-promo hook state (src/promo.ts): caps, seen days, arrivals from other bots' campaigns
CREATE TABLE IF NOT EXISTS promo_kv (
  k TEXT PRIMARY KEY,
  v TEXT NOT NULL,
  at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
