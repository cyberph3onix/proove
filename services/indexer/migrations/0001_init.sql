-- Proove indexer schema, v1.
--
-- Every entity table carries provenance: its key (`address` or `account`) is the on-chain address
-- the row mirrors, `slot` the highest slot any value was written at, and
-- `field_slots` the slot each column was last written at (writes older than
-- a column's slot are ignored, so events and account snapshots can arrive in
-- any order). Columns marked "pending program change" are not carried by the
-- v1 programs yet and stay NULL until the extended programs ship.

CREATE TABLE ingest_cursors (
  program        text PRIMARY KEY,
  last_signature text,
  last_slot      bigint,
  updated_at     timestamptz NOT NULL DEFAULT now()
);

-- One row per decoded Anchor event; idempotent on (signature, event_index).
-- Shaped after the `ChainEvent` domain type.
CREATE TABLE events (
  signature   text    NOT NULL,
  event_index integer NOT NULL,
  slot        bigint  NOT NULL,
  block_time  bigint,
  program     text    NOT NULL,
  name        text    NOT NULL,
  data        jsonb   NOT NULL,
  actors      text[]  NOT NULL DEFAULT '{}',
  gig         text,
  milestone   text,
  case_address text,
  amount      bigint,
  receipt     text    NOT NULL DEFAULT '',
  PRIMARY KEY (signature, event_index)
);
CREATE INDEX events_slot_idx ON events (slot DESC, signature DESC, event_index DESC);
CREATE INDEX events_actors_idx ON events USING GIN (actors);
CREATE INDEX events_gig_idx ON events (gig);
CREATE INDEX events_milestone_idx ON events (milestone);

-- Gig program `Gig` account; shaped after the `Gig` domain type.
CREATE TABLE gigs (
  address     text PRIMARY KEY,
  id          bigint,
  client      text,
  freelancer  text,
  mint        text,
  status      text NOT NULL DEFAULT 'draft',
  created_at  bigint,
  updated_at  bigint,
  title       text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  -- On-chain skills are one comma-separated string; `skills` is the parsed list.
  skills_raw  text NOT NULL DEFAULT '',
  skills      text[] NOT NULL DEFAULT '{}',
  category    text NOT NULL DEFAULT '',
  budget      bigint NOT NULL DEFAULT 0,
  deadline    bigint,
  -- Off-chain (API) data, not written by the indexer yet.
  applicants  text[] NOT NULL DEFAULT '{}',
  brief       text,
  slot        bigint NOT NULL DEFAULT 0,
  field_slots jsonb  NOT NULL DEFAULT '{}',
  search      tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('english'::regconfig, coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english'::regconfig, coalesce(skills_raw, '')), 'B') ||
    setweight(to_tsvector('english'::regconfig, coalesce(category, '')), 'B') ||
    setweight(to_tsvector('english'::regconfig, coalesce(description, '')), 'C')
  ) STORED
);
CREATE INDEX gigs_search_idx ON gigs USING GIN (search);
CREATE INDEX gigs_skills_idx ON gigs USING GIN (skills);
CREATE INDEX gigs_category_idx ON gigs (lower(category));
CREATE INDEX gigs_budget_idx ON gigs (budget);
CREATE INDEX gigs_client_idx ON gigs (client);
CREATE INDEX gigs_freelancer_idx ON gigs (freelancer);
CREATE INDEX gigs_created_idx ON gigs (created_at DESC, address DESC);

-- Escrow program `Milestone` account; shaped after the `Milestone` domain type.
CREATE TABLE milestones (
  address        text PRIMARY KEY,
  gig            text,
  index          integer,
  title          text,              -- pending program change (off-chain spec title)
  amount         bigint NOT NULL DEFAULT 0,
  released       bigint NOT NULL DEFAULT 0,
  fees_paid      bigint,            -- pending program change
  refunded       bigint,            -- pending program change
  status         text NOT NULL DEFAULT 'pendingFunding',
  spec_hash      text,              -- pending program change
  delivery_hash  text,              -- pending program change
  report_hash    text,              -- pending program change
  terms_accepted boolean,           -- pending program change
  created_at     bigint,            -- from the MilestoneCreated block time
  funded_at      bigint,            -- from the MilestoneFunded block time
  submitted_at   bigint,
  submitted_slot bigint,            -- pending program change (filled from the DeliverySubmitted slot meanwhile)
  approved_at    bigint,
  partial_timeout bigint,           -- pending program change (snapshotted terms)
  full_timeout    bigint,           -- pending program change
  partial_bps     integer,          -- pending program change
  fee_bps         integer,          -- pending program change
  slot        bigint NOT NULL DEFAULT 0,
  field_slots jsonb  NOT NULL DEFAULT '{}'
);
CREATE INDEX milestones_gig_idx ON milestones (gig, index);

-- Reputation program `UserProfile` account, keyed by its PDA.
CREATE TABLE profiles (
  account          text PRIMARY KEY,
  authority        text,
  completed_jobs   bigint,
  successful_jobs  bigint,
  cancelled_jobs   bigint,
  on_time_jobs     bigint,          -- pending program change
  total_earnings   bigint,
  rating_sum       bigint,
  rating_count     bigint,
  average_rating   bigint,
  reputation_score bigint,
  badges_earned    bigint,
  disputes_won     bigint,          -- pending program change
  disputes_lost    bigint,          -- pending program change
  created_at       bigint,
  updated_at       bigint,
  slot        bigint NOT NULL DEFAULT 0,
  field_slots jsonb  NOT NULL DEFAULT '{}'
);
CREATE UNIQUE INDEX profiles_authority_idx ON profiles (authority);

CREATE TABLE ratings (
  account      text PRIMARY KEY,
  job_id       bigint,
  gig          text,                -- pending program change (v1 ratings carry job_id only)
  client       text,
  freelancer   text,
  score        integer,
  review_hash  text,
  submitted_at bigint,
  slot        bigint NOT NULL DEFAULT 0,
  field_slots jsonb  NOT NULL DEFAULT '{}'
);
CREATE INDEX ratings_freelancer_idx ON ratings (freelancer);

CREATE TABLE badges (
  account     text PRIMARY KEY,
  profile     text,
  badge_type  text,
  issuer      text,
  issued_at   bigint,
  metadata    text,
  slot        bigint NOT NULL DEFAULT 0,
  field_slots jsonb  NOT NULL DEFAULT '{}'
);
CREATE INDEX badges_profile_idx ON badges (profile);

CREATE TABLE achievements (
  account     text PRIMARY KEY,
  owner       text,
  badge_type  text,
  mint        text,
  claimed     boolean,
  claimed_at  bigint,
  slot        bigint NOT NULL DEFAULT 0,
  field_slots jsonb  NOT NULL DEFAULT '{}'
);
CREATE INDEX achievements_owner_idx ON achievements (owner);
