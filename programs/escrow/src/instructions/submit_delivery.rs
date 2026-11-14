use anchor_lang::prelude::*;
use gig::Gig;

use crate::errors::EscrowError;
use crate::events::DeliverySubmitted;
use crate::constants::VAULT_SEED;
use crate::state::{EscrowVault, Milestone, MilestoneStatus};
use crate::utils::checked_add;

#[derive(Accounts)]
pub struct SubmitDelivery<'info> {
    pub freelancer: Signer<'info>,

    #[account(has_one = freelancer @ EscrowError::Unauthorized)]
    pub gig: Account<'info, Gig>,

    #[account(
        mut,
        constraint = milestone.gig == gig.key() @ EscrowError::Unauthorized,
    )]
    pub milestone: Account<'info, Milestone>,

    #[account(
        mut,
        seeds = [VAULT_SEED, gig.key().as_ref()],
        bump = vault.bump,
    )]
    pub vault: Account<'info, EscrowVault>,
}

/// Records the freelancer's delivery submission and starts the timeout clocks.
/// `delivery_hash` is the canonical delivery manifest hash; `report_hash` the
/// verification report's (zero if none). `submitted_slot` seeds the sample audit.
pub fn handler(
    ctx: Context<SubmitDelivery>,
    delivery_hash: [u8; 32],
    report_hash: [u8; 32],
) -> Result<()> {
    require!(delivery_hash != [0u8; 32], EscrowError::MissingDeliveryHash);
    require!(
        ctx.accounts.milestone.status != MilestoneStatus::Submitted,
        EscrowError::MilestoneAlreadySubmitted
    );
    require!(
        ctx.accounts.milestone.status == MilestoneStatus::Funded,
        EscrowError::InvalidStatus
    );

    let clock = Clock::get()?;
    let now = clock.unix_timestamp;

    let milestone = &mut ctx.accounts.milestone;
    milestone.submitted_at = now;
    milestone.status = MilestoneStatus::Submitted;
    milestone.submitted_slot = clock.slot;
    milestone.delivery_hash = delivery_hash;
    milestone.report_hash = report_hash;

    if now > ctx.accounts.gig.deadline {
        let vault = &mut ctx.accounts.vault;
        vault.late_deliveries = checked_add(vault.late_deliveries as u64, 1)? as u32;
    }

    emit!(DeliverySubmitted {
        gig: ctx.accounts.gig.key(),
        milestone: milestone.key(),
        submitted_at: now,
        submitted_slot: clock.slot,
        delivery_hash,
        report_hash,
    });

    Ok(())
}
