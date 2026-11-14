-- db/migrations/004_nightly.sql
-- Nightly feature persistence (spec sections 3 and 4).
-- Dates are America/New_York calendar dates; read them as date::text.
-- Only the first three tables are used in this build; forecasts and game results are reserved.

CREATE TABLE nightly_sessions (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date date NOT NULL UNIQUE,                       -- the night's Eastern date
  stories               jsonb,                                       -- [{headline, summary, url, source}] x3
  niche                 jsonb,                                       -- {topic, headline, summary, url, source}
  questions             jsonb,                                       -- [{type, story_index, prompt}] x3
  status                text NOT NULL CHECK (status IN ('generating','generated','submitted','grading','graded','complete','missed')),
  generation_started_at timestamptz,                                 -- claim time, stale after 6 minutes
  grading_started_at    timestamptz,                                 -- lease time, stale after 6 minutes
  grade_error           text,                                        -- last grading failure, for Retry
  submitted_at          timestamptz,
  graded_at             timestamptz,
  completed_at          timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT nightly_sessions_brief_present CHECK (
    status IN ('generating','missed') OR
    (stories IS NOT NULL AND niche IS NOT NULL AND questions IS NOT NULL)
  )
);

CREATE TABLE nightly_answers (
  session_id    uuid NOT NULL REFERENCES nightly_sessions (id) ON DELETE CASCADE,
  idx           smallint NOT NULL CHECK (idx >= 0),                  -- no upper bound: makeup nights need more than three
  question_type text NOT NULL,
  prompt        text NOT NULL,
  answer        text NOT NULL,
  score         smallint CHECK (score BETWEEN 1 AND 5),              -- NULL until graded
  feedback      text,
  submitted_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (session_id, idx)
);

CREATE TABLE nightly_takes (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id   uuid NOT NULL UNIQUE REFERENCES nightly_sessions (id) ON DELETE CASCADE,
  story_index smallint NOT NULL CHECK (story_index BETWEEN 0 AND 2),
  body         text NOT NULL,
  model_take   text,
  follow_up    text,
  published    boolean NOT NULL DEFAULT false,
  published_at timestamptz
);

CREATE TABLE nightly_forecasts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  uuid NOT NULL REFERENCES nightly_sessions (id) ON DELETE CASCADE,
  claim       text NOT NULL,
  probability numeric NOT NULL CHECK (probability BETWEEN 0 AND 1),
  resolve_by  date,
  outcome     boolean,                                               -- NULL until resolved
  resolved_at timestamptz
);

CREATE TABLE nightly_game_results (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES nightly_sessions (id) ON DELETE CASCADE,
  game       text NOT NULL,
  score      numeric NOT NULL,
  logged_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, game)
);

-- Immutability: what Hari wrote cannot change after insert.
CREATE FUNCTION nightly_answers_immutable() RETURNS trigger AS $$
BEGIN
  IF NEW.answer IS DISTINCT FROM OLD.answer
     OR NEW.prompt IS DISTINCT FROM OLD.prompt
     OR NEW.question_type IS DISTINCT FROM OLD.question_type
     OR NEW.idx IS DISTINCT FROM OLD.idx
     OR NEW.session_id IS DISTINCT FROM OLD.session_id THEN
    RAISE EXCEPTION 'nightly_answers: answer, prompt, question_type, idx and session_id are immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER nightly_answers_immutable
  BEFORE UPDATE ON nightly_answers
  FOR EACH ROW EXECUTE FUNCTION nightly_answers_immutable();

CREATE FUNCTION nightly_takes_immutable() RETURNS trigger AS $$
BEGIN
  IF OLD.published THEN
    RAISE EXCEPTION 'nightly_takes: a published take cannot be updated';
  END IF;
  IF NEW.body IS DISTINCT FROM OLD.body
     OR NEW.story_index IS DISTINCT FROM OLD.story_index
     OR NEW.session_id IS DISTINCT FROM OLD.session_id THEN
    RAISE EXCEPTION 'nightly_takes: body, story_index and session_id are immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER nightly_takes_immutable
  BEFORE UPDATE ON nightly_takes
  FOR EACH ROW EXECUTE FUNCTION nightly_takes_immutable();

-- Nothing Hari wrote is ever deleted. App code never deletes answers or takes; the only session delete
-- (releaseClaim) removes a 'generating' session, which has no children, so the cascade never fires.
CREATE FUNCTION nightly_no_delete() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '%: rows cannot be deleted', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER nightly_answers_no_delete
  BEFORE DELETE ON nightly_answers
  FOR EACH ROW EXECUTE FUNCTION nightly_no_delete();

CREATE TRIGGER nightly_takes_no_delete
  BEFORE DELETE ON nightly_takes
  FOR EACH ROW EXECUTE FUNCTION nightly_no_delete();

-- The brief is frozen once the night leaves 'generating'.
CREATE FUNCTION nightly_sessions_brief_frozen() RETURNS trigger AS $$
BEGIN
  IF OLD.status <> 'generating'
     AND (NEW.stories IS DISTINCT FROM OLD.stories
          OR NEW.niche IS DISTINCT FROM OLD.niche
          OR NEW.questions IS DISTINCT FROM OLD.questions) THEN
    RAISE EXCEPTION 'nightly_sessions: stories, niche and questions are frozen once generated';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER nightly_sessions_brief_frozen
  BEFORE UPDATE ON nightly_sessions
  FOR EACH ROW EXECUTE FUNCTION nightly_sessions_brief_frozen();
