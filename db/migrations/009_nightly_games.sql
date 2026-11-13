-- db/migrations/009_nightly_games.sql
-- Nightly games persistence (nightly games spec section 5).
-- Dates are America/New_York calendar dates; read them as night::text.
-- 004 created nightly_game_results keyed by session and never used it. Re-key it by night.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM nightly_game_results) THEN
    RAISE EXCEPTION '009: nightly_game_results is not empty, refusing to drop it';
  END IF;
END;
$$ LANGUAGE plpgsql;

DROP TABLE nightly_game_results;

CREATE TABLE nightly_game_results (
  night      date NOT NULL,                                  -- the night's Eastern date
  game       text NOT NULL,                                  -- a catalog key, or puzzle_sprint / puzzle_flaw
  score      numeric NOT NULL,
  detail     jsonb,
  logged_at  timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (night, game)
);

CREATE TABLE nightly_puzzles (
  night date PRIMARY KEY,
  flaw       jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Puzzle results are final: only Hari's own catalog scores can be corrected.
CREATE FUNCTION nightly_puzzle_results_final() RETURNS trigger AS $$
BEGIN
  IF OLD.game LIKE 'puzzle\_%' THEN
    RAISE EXCEPTION 'nightly_game_results: puzzle results are final and cannot be updated';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER nightly_puzzle_results_final
  BEFORE UPDATE ON nightly_game_results
  FOR EACH ROW EXECUTE FUNCTION nightly_puzzle_results_final();
