use anchor_lang::prelude::*;

use crate::constants::{ESCROW_AUTHORITY_SEED, ESCROW_PROGRAM_ID, PROFILE_SEED};
use crate::errors::ReputationError;
use crate::events::CompletionUpdated;
use crate::state::UserProfile;
use crate::utils::{checked_add, compute_reputation_score};

#[derive(Accounts)]
pub struct UpdateCompletion<'info> {
    /// Callable only via CPI from escrow, signed by its `escrow_authority` PDA.
    /// A PDA has no private key, so this can never be satisfied by a direct,
    /// top-level transaction -- only escrow's own `invoke_signed` can produce
    /// a valid signature for it.
    #[account(
        seeds = [ESCROW_AUTHORITY_SEED],
        bump,
        seeds::program = ESCROW_PROGRAM_ID,
    )]
    pub escrow_authority: Signer<'info>,

    #[account(
        mut,
        seeds = [PROFILE_SEED, profile.authority.as_ref()],
        bump = profile.bump,
    )]
    pub profile: Account<'info, UserProfile>,
}

/// Records the outcome of a completed job: increments `completed_jobs`
/// and either `successful_jobs` or `cancelled_jobs`, adds any earnings,
/// records on-time delivery and any dispute outcome, and recomputes the
/// deterministic reputation score.
///
/// `earnings` is credited regardless of outcome, because it reports money the
/// freelancer was actually paid out of the vault -- a gig can end Cancelled
/// with earlier milestones already released, and dropping that credit would
/// understate lifetime earnings. The success/cancel split is the outcome
/// signal; `total_earnings` is the payment record.
///
/// `disputed_outcome` is the ruling in basis points to the freelancer when
/// the job went through a dispute (Phase 2), `None` otherwise. A ruling of
/// at least half counts as a dispute won.
pub fn handler(
    ctx: Context<UpdateCompletion>,
    successful: bool,
    earnings: u64,
    delivered_on_time: bool,
    disputed_outcome: Option<u16>,
) -> Result<()> {
    if let Some(bps) = disputed_outcome {
        require!(bps <= 10_000, ReputationError::InvalidDisputeOutcome);
    }
    let now = Clock::get()?.unix_timestamp;
    let profile = &mut ctx.accounts.profile;

    profile.completed_jobs = checked_add(profile.completed_jobs, 1)?;
    if successful {
        profile.successful_jobs = checked_add(profile.successful_jobs, 1)?;
    } else {
        profile.cancelled_jobs = checked_add(profile.cancelled_jobs, 1)?;
    }
    profile.total_earnings = checked_add(profile.total_earnings, earnings)?;
    if delivered_on_time {
        profile.on_time_jobs = checked_add(profile.on_time_jobs, 1)?;
    }
    match disputed_outcome {
        Some(bps) if bps >= 5_000 => profile.disputes_won = checked_add(profile.disputes_won, 1)?,
        Some(_) => profile.disputes_lost = checked_add(profile.disputes_lost, 1)?,
        None => {}
    }

    profile.reputation_score = compute_reputation_score(profile)?;
    profile.updated_at = now;

    emit!(CompletionUpdated {
        profile: profile.key(),
        completed_jobs: profile.completed_jobs,
        successful_jobs: profile.successful_jobs,
        total_earnings: profile.total_earnings,
        reputation_score: profile.reputation_score,
        on_time_jobs: profile.on_time_jobs,
        disputes_won: profile.disputes_won,
        disputes_lost: profile.disputes_lost,
    });

    Ok(())
}
