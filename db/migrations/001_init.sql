-- Preader initial schema
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE users (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email           text NOT NULL,
  name            text NOT NULL,
  password_hash   text NOT NULL,
  preferences     jsonb NOT NULL DEFAULT '{}'::jsonb,
  voice_sample_enc text,
  failed_logins   integer NOT NULL DEFAULT 0,
  locked_until    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_email_lower_idx ON users (lower(email));

-- Session ids are SHA-256 hashes of the random cookie token; the raw token is never stored.
CREATE TABLE sessions (
  id           text PRIMARY KEY,
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at   timestamptz NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  user_agent   text
);
CREATE INDEX sessions_user_idx ON sessions (user_id);
CREATE INDEX sessions_expires_idx ON sessions (expires_at);

-- Document content is encrypted at the application layer (AES-256-GCM).
CREATE TABLE rewrites (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title_enc        text NOT NULL,
  original_enc     text NOT NULL,
  result_enc       text NOT NULL,
  mode             text NOT NULL,
  options          jsonb NOT NULL,
  words_in         integer NOT NULL,
  words_out        integer NOT NULL,
  flagged_count    integer NOT NULL DEFAULT 0,
  high_risk_count  integer NOT NULL DEFAULT 0,
  model            text NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX rewrites_user_created_idx ON rewrites (user_id, created_at DESC);

CREATE TABLE usage_events (
  id         bigserial PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind       text NOT NULL,
  words      integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX usage_user_created_idx ON usage_events (user_id, created_at);

-- Fixed-window rate limiting shared across all app instances.
CREATE TABLE rate_limits (
  key          text NOT NULL,
  window_start timestamptz NOT NULL,
  count        integer NOT NULL DEFAULT 0,
  PRIMARY KEY (key, window_start)
);
CREATE INDEX rate_limits_window_idx ON rate_limits (window_start);
