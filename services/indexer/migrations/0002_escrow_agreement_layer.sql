-- Extended escrow program: protocol config, vault totals, fee/refund lookups.
--
-- The milestone columns marked "pending program change" in 0001 are now
-- written by the escrow events and the Milestone account (only `title`, an
-- off-chain field, stays NULL). Profile on_time_jobs / disputes_won /
-- disputes_lost are written by ProfileCreated, CompletionUpdated and the
-- UserProfile account; rows indexed before that keep NULL until re-snapshotted.

-- Escrow `ProtocolConfig` singleton (PDA [b"protocol_config"]).
CREATE TABLE protocol_config (
  address           text PRIMARY KEY,
  admin             text,
  treasury          text,
  partial_timeout   bigint,
  full_timeout      bigint,
  partial_bps       integer,
  fee_bps           integer,
  min_milestone     bigint,
  no_delivery_grace bigint,
  updated_at        bigint,          -- block time of the last ProtocolConfigUpdated
  slot        bigint NOT NULL DEFAULT 0,
  field_slots jsonb  NOT NULL DEFAULT '{}'
);

-- Escrow `EscrowVault` account (PDA [b"vault", gig]), from account snapshots.
CREATE TABLE vaults (
  address              text PRIMARY KEY,
  gig                  text,
  token_account        text,
  mint                 text,
  total_locked         bigint,
  total_released       bigint,
  total_fees           bigint,
  total_refunded       bigint,
  milestone_count      integer,
  active_milestone     integer,
  cancelled_milestones integer,
  refunded_milestones  integer,
  late_deliveries      integer,
  reputation_synced    boolean,
  slot        bigint NOT NULL DEFAULT 0,
  field_slots jsonb  NOT NULL DEFAULT '{}'
);
CREATE INDEX vaults_gig_idx ON vaults (gig);

-- Treasury totals are summed from events (exact and idempotent, unlike
-- slot-gated counters when several fees land in one slot).
CREATE INDEX events_name_idx ON events (program, name);
