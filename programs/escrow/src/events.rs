use anchor_lang::prelude::*;

#[event]
pub struct MilestoneCreated {
    pub gig: Pubkey,
    pub milestone: Pubkey,
    pub index: u32,
    pub amount: u64,
    pub spec_hash: [u8; 32],
}

#[event]
pub struct MilestoneFunded {
    pub gig: Pubkey,
    pub milestone: Pubkey,
    pub amount: u64,
}

#[event]
pub struct DeliverySubmitted {
    pub gig: Pubkey,
    pub milestone: Pubkey,
    pub submitted_at: i64,
    pub submitted_slot: u64,
    pub delivery_hash: [u8; 32],
    pub report_hash: [u8; 32],
}

#[event]
pub struct MilestoneApproved {
    pub gig: Pubkey,
    pub milestone: Pubkey,
    pub amount_released: u64,
    pub approved_at: i64,
}

#[event]
pub struct PartialReleaseExecuted {
    pub gig: Pubkey,
    pub milestone: Pubkey,
    pub amount_released: u64,
}

#[event]
pub struct FullReleaseExecuted {
    pub gig: Pubkey,
    pub milestone: Pubkey,
    pub amount_released: u64,
}

#[event]
pub struct MilestoneCancelledBeforeFunding {
    pub gig: Pubkey,
    pub milestone: Pubkey,
    pub index: u32,
}

#[event]
pub struct ProtocolConfigUpdated {
    pub admin: Pubkey,
    pub treasury: Pubkey,
    pub partial_timeout: i64,
    pub full_timeout: i64,
    pub partial_bps: u16,
    pub fee_bps: u16,
    pub min_milestone: u64,
    pub no_delivery_grace: i64,
}

#[event]
pub struct TermsAccepted {
    pub gig: Pubkey,
    pub milestone: Pubkey,
    pub freelancer: Pubkey,
    pub spec_hash: [u8; 32],
}

#[event]
pub struct ProtocolFeeCollected {
    pub gig: Pubkey,
    pub milestone: Pubkey,
    pub amount: u64,
}

#[event]
pub struct RefundedAfterDeadline {
    pub gig: Pubkey,
    pub milestone: Pubkey,
    pub amount: u64,
}
