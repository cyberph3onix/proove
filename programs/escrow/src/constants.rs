use anchor_lang::prelude::*;

#[constant]
pub const MILESTONE_SEED: &[u8] = b"milestone";

#[constant]
pub const VAULT_SEED: &[u8] = b"vault";

/// Seed for escrow's CPI-signer PDA, used to authorize calls into the gig program.
#[constant]
pub const ESCROW_AUTHORITY_SEED: &[u8] = b"escrow_authority";

pub const SECONDS_PER_DAY: i64 = 86_400;

pub const PARTIAL_RELEASE_PERCENT: u64 = 20;
pub const FULL_RELEASE_PERCENT: u64 = 80;

pub const PARTIAL_TIMEOUT: i64 = 72 * 3_600; // 72 hours
pub const FULL_TIMEOUT: i64 = 7 * SECONDS_PER_DAY; // 7 days

/// Seed for the singleton `ProtocolConfig` PDA.
#[constant]
pub const PROTOCOL_CONFIG_SEED: &[u8] = b"protocol_config";

pub const SECONDS_PER_HOUR: i64 = 3_600;
pub const BPS_DENOMINATOR: u64 = 10_000;
/// USDC base units (6 decimals).
pub const USDC: u64 = 1_000_000;

// Ranges enforced in code for every `ProtocolConfig` field. They mirror
// `apps/web/src/lib/mock/ranges.ts`; change both together.
pub const PARTIAL_TIMEOUT_RANGE: (i64, i64) = (SECONDS_PER_DAY, 14 * SECONDS_PER_DAY);
pub const FULL_TIMEOUT_RANGE: (i64, i64) = (SECONDS_PER_DAY, 14 * SECONDS_PER_DAY);
pub const PARTIAL_BPS_RANGE: (u16, u16) = (0, 5_000);
pub const FEE_BPS_RANGE: (u16, u16) = (0, 200);
pub const MIN_MILESTONE_RANGE: (u64, u64) = (USDC, 100 * USDC);
pub const NO_DELIVERY_GRACE_RANGE: (i64, i64) = (SECONDS_PER_DAY, 14 * SECONDS_PER_DAY);

// Defaults used by `init_protocol_config` callers and tests (PRD values).
pub const DEFAULT_PARTIAL_BPS: u16 = 2_000;
pub const DEFAULT_FEE_BPS: u16 = 0;
pub const DEFAULT_MIN_MILESTONE: u64 = 5 * USDC;
pub const DEFAULT_NO_DELIVERY_GRACE: i64 = 3 * SECONDS_PER_DAY;
