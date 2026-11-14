use anchor_lang::prelude::*;
use gig::Gig;

use crate::errors::EscrowError;
use crate::events::TermsAccepted;
use crate::state::{Milestone, MilestoneStatus};

#[derive(Accounts)]
pub struct AcceptTerms<'info> {
    pub freelancer: Signer<'info>,

    #[account(has_one = freelancer @ EscrowError::Unauthorized)]
    pub gig: Account<'info, Gig>,

    #[account(
        mut,
        constraint = milestone.gig == gig.key() @ EscrowError::Unauthorized,
        constraint = milestone.status == MilestoneStatus::PendingFunding @ EscrowError::InvalidStatus,
    )]
    pub milestone: Account<'info, Milestone>,
}

/// The assigned freelancer signs the milestone's committed spec. Passing the
/// hash they reviewed (rather than a bare "yes") stops a client from swapping
/// the spec between review and acceptance.
pub fn handler(ctx: Context<AcceptTerms>, spec_hash: [u8; 32]) -> Result<()> {
    let milestone = &mut ctx.accounts.milestone;
    require!(milestone.spec_hash == spec_hash, EscrowError::SpecHashMismatch);
    milestone.terms_accepted = true;

    emit!(TermsAccepted {
        gig: ctx.accounts.gig.key(),
        milestone: milestone.key(),
        freelancer: ctx.accounts.freelancer.key(),
        spec_hash,
    });
    Ok(())
}
