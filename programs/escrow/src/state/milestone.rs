use anchor_lang::prelude::*;

use super::enums::MilestoneStatus;

#[account]
#[derive(Debug)]
pub struct Milestone {
    pub gig: Pubkey,
    pub index: u32,
    pub amount: u64,
    /// Net amount paid out to the freelancer (after protocol fees).
    pub released: u64,
    pub status: MilestoneStatus,
    pub submitted_at: i64,
    pub approved_at: i64,
    pub bump: u8,

    // ── Agreement layer (Proove) ──
    /// SHA-256 of the RFC 8785 canonical milestone spec; zero = no spec.
    pub spec_hash: [u8; 32],
    /// SHA-256 of the canonical delivery manifest.
    pub delivery_hash: [u8; 32],
    /// SHA-256 of the canonical verification report; zero = none.
    pub report_hash: [u8; 32],
    /// Freelancer signed `accept_terms` against `spec_hash`.
    pub terms_accepted: bool,
    /// Slot of `submit_delivery`; the sample audit seeds from `submitted_slot + 2`.
    pub submitted_slot: u64,
    pub funded_at: i64,

    // ── Terms snapshotted from `ProtocolConfig` at funding ──
    pub partial_timeout: i64,
    pub full_timeout: i64,
    pub partial_bps: u16,
    pub fee_bps: u16,

    // ── Accounting: released + refunded + fees_paid + locked == amount ──
    pub fees_paid: u64,
    pub refunded: u64,
}

impl Milestone {
    pub const INIT_SPACE: usize = 8 // discriminator
        + 32 // gig
        + 4 // index
        + 8 // amount
        + 8 // released
        + 1 // status
        + 8 // submitted_at
        + 8 // approved_at
        + 1 // bump
        + 32 // spec_hash
        + 32 // delivery_hash
        + 32 // report_hash
        + 1 // terms_accepted
        + 8 // submitted_slot
        + 8 // funded_at
        + 8 // partial_timeout
        + 8 // full_timeout
        + 2 // partial_bps
        + 2 // fee_bps
        + 8 // fees_paid
        + 8; // refunded

    /// Amount still held in the vault for this milestone.
    pub fn locked(&self) -> Option<u64> {
        self.amount
            .checked_sub(self.released)?
            .checked_sub(self.refunded)?
            .checked_sub(self.fees_paid)
    }
}
