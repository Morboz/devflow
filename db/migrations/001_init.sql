-- Phase 0 schema. Encodes:
--   ADR-0014  Feature identity is a synthetic id in our DB (GitHub numbers are pointers).
--   ADR-0015  Stage Run (domain) and Job (execution) are separate tables.
--   ADR-0016  Idempotency key is trigger_key (generalized from comment id).
--   ADR-0010  Active Stage Run Exclusivity via partial unique index.
--   ADR-0018  Jobs carry a lease; expiry fails the run (worker logic, not schema).

-- features ----------------------------------------------------------------
CREATE TABLE features (
  id                   BIGSERIAL PRIMARY KEY,
  repo_owner           TEXT NOT NULL,
  repo_name            TEXT NOT NULL,
  source_issue_number  BIGINT NOT NULL,   -- the Intake / triggering issue number
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One feature per (repo, source issue): re-triggering the same source issue
-- reuses the feature (find-or-create).
CREATE UNIQUE INDEX features_repo_source_uniq
  ON features (repo_owner, repo_name, source_issue_number);

-- stage_runs (domain view) ------------------------------------------------
CREATE TABLE stage_runs (
  id            BIGSERIAL PRIMARY KEY,
  feature_id    BIGINT NOT NULL REFERENCES features(id),
  stage         TEXT NOT NULL CHECK (stage IN ('refinement','decomposition','implementation','review')),
  status        TEXT NOT NULL CHECK (status IN ('running','awaiting_plan_approval','done','failed')),
  trigger_key   TEXT NOT NULL,            -- 'comment:<id>' | 'issue-label:<n>' (ADR-0016)
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Idempotency: the same trigger never creates a second run (ADR-0004/0016).
CREATE UNIQUE INDEX stage_runs_trigger_key_uniq
  ON stage_runs (feature_id, stage, trigger_key);

-- Active Stage Run Exclusivity: at most one non-terminal run per (feature, stage)
-- (ADR-0010). Built for both non-terminal values from day one.
CREATE UNIQUE INDEX stage_runs_exclusivity_uniq
  ON stage_runs (feature_id, stage)
  WHERE status IN ('running', 'awaiting_plan_approval');

-- jobs (execution view / the queue) ---------------------------------------
CREATE TABLE jobs (
  id               BIGSERIAL PRIMARY KEY,
  stage_run_id     BIGINT NOT NULL REFERENCES stage_runs(id),
  status           TEXT NOT NULL CHECK (status IN ('pending','running','done','failed')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  claimed_at       TIMESTAMPTZ,
  lease_expires_at TIMESTAMPTZ,
  finished_at      TIMESTAMPTZ
);

CREATE INDEX jobs_status_created_idx ON jobs (status, created_at);
