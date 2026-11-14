use anchor_lang::prelude::*;

use crate::constants::{ESCROW_AUTHORITY_SEED, ESCROW_PROGRAM_ID};
use crate::errors::GigError;
use crate::events::GigDisputed;
use crate::state::{Gig, GigStatus};

/// Callable only via CPI from the escrow program, signed by escrow's own
/// `escrow_authority` PDA. The seeds::program constraint means the Solana
/// runtime itself rejects any signer whose PDA wasn't derived — and signed
/// for — by the escrow program, so no other caller can forge this signature.
#[derive(Accounts)]
pub struct MarkDisputedByEscrow<'info> {
    #[account(
        seeds = [ESCROW_AUTHORITY_SEED],
        bump,
        seeds::program = ESCROW_PROGRAM_ID,
    )]
    pub escrow_authority: Signer<'info>,

    #[account(
        mut,
        constraint = gig.status == GigStatus::InProgress @ GigError::NotInProgressStatus,
    )]
    pub gig: Account<'info, Gig>,
}

/// Escrow calls this when a dispute freezes one of the gig's milestones
/// (Phase 2), moving the gig from InProgress to Disputed.
pub fn handler(ctx: Context<MarkDisputedByEscrow>) -> Result<()> {
    let gig = &mut ctx.accounts.gig;
    gig.status = GigStatus::Disputed;
    gig.updated_at = Clock::get()?.unix_timestamp;

    emit!(GigDisputed {
        gig: gig.key(),
        id: gig.id,
    });

    Ok(())
}
