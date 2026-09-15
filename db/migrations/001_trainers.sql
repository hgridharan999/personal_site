CREATE TABLE sessions (
  id              uuid PRIMARY KEY,
  trainer         text NOT NULL CHECK (trainer IN ('zetamac', 'optiver')),
  mode            text NOT NULL CHECK (mode IN ('standard', 'custom', 'drill')),
  config          jsonb NOT NULL,
  config_key      text NOT NULL,
  profile_version int,
  started_at      timestamptz NOT NULL,
  duration_ms     int NOT NULL,
  correct         int NOT NULL,
  wrong           int NOT NULL,
  unanswered      int NOT NULL,
  score           int NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX sessions_series ON sessions (trainer, mode, config_key, started_at);

CREATE TABLE attempts (
  session_id  uuid NOT NULL REFERENCES sessions (id) ON DELETE CASCADE,
  idx         int NOT NULL,
  qtype       text NOT NULL,
  fact_key    text,
  prompt      text NOT NULL,
  answer      text NOT NULL,
  response    text,
  is_correct  boolean NOT NULL,
  time_ms     int,
  corrections int NOT NULL DEFAULT 0,
  PRIMARY KEY (session_id, idx)
);

CREATE INDEX attempts_fact ON attempts (fact_key);
CREATE INDEX attempts_qtype ON attempts (qtype);
