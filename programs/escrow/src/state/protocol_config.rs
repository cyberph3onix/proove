use anchor_lang::prelude::*;

/// Singleton protocol settings, owned by escrow. The admin is an
/// upgrade-authority-held key in Phase 1; Phase 2 hands it to the DAO.
/// Milestones snapshot the timeout/bps terms when they are funded, so a
/// change only affects milestones funded afterwards.
#[account]
pub struct ProtocolConfig {
    pub admin: Pubkey,
    /// USDC token account that receives protocol fees.
    pub treasury: Pubkey,
    pub partial_timeout: i64,
    pub full_timeout: i64,
    pub partial_bps: u16,
    pub fee_bps: u16,
    pub min_milestone: u64,
    pub no_delivery_grace: i64,
    pub bump: u8,
}

impl ProtocolConfig {
    pub const INIT_SPACE: usize = 8 // discriminator
        + 32 // admin
        + 32 // treasury
        + 8 // partial_timeout
        + 8 // full_timeout
        + 2 // partial_bps
        + 2 // fee_bps
        + 8 // min_milestone
        + 8 // no_delivery_grace
        + 1; // bump
}

/// Settings passed to `init_protocol_config` / `update_protocol_config`.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq)]
pub struct ProtocolSettings {
    pub partial_timeout: i64,
    pub full_timeout: i64,
    pub partial_bps: u16,
    pub fee_bps: u16,
    pub min_milestone: u64,
    pub no_delivery_grace: i64,
}
