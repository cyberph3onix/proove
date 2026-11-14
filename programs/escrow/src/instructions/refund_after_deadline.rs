use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};
use gig::cpi::accounts::{MarkCancelledByEscrow, MarkCompletedByEscrow};
use gig::{Gig, GigStatus};

use crate::constants::{ESCROW_AUTHORITY_SEED, PROTOCOL_CONFIG_SEED, VAULT_SEED};
use crate::errors::EscrowError;
use crate::events::RefundedAfterDeadline;
use crate::state::{EscrowVault, Milestone, MilestoneStatus, ProtocolConfig};
use crate::utils::{checked_add, vault_transfer};

#[derive(Accounts)]
pub struct RefundAfterDeadline<'info> {
    pub client: Signer<'info>,

    #[account(
        mut,
        has_one = client @ EscrowError::Unauthorized,
        has_one = mint @ EscrowError::InvalidMint,
    )]
    pub gig: Box<Account<'info, Gig>>,

    #[account(
        mut,
        constraint = milestone.gig == gig.key() @ EscrowError::Unauthorized,
        // Only an undelivered milestone: once the freelancer has submitted, the
        // timeout releases (or, in Phase 2, a dispute) decide the outcome.
        constraint = milestone.status == MilestoneStatus::Funded @ EscrowError::InvalidStatus,
    )]
    pub milestone: Box<Account<'info, Milestone>>,

    #[account(
        mut,
        seeds = [VAULT_SEED, gig.key().as_ref()],
        bump = vault.bump,
        has_one = mint @ EscrowError::InvalidMint,
    )]
    pub vault: Box<Account<'info, EscrowVault>>,

    #[account(mut, address = vault.token_account @ EscrowError::Unauthorized)]
    pub vault_token_account: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        constraint = client_token_account.mint == mint.key() @ EscrowError::InvalidMint,
        constraint = client_token_account.owner == client.key() @ EscrowError::Unauthorized,
    )]
    pub client_token_account: Box<Account<'info, TokenAccount>>,

    pub mint: Box<Account<'info, Mint>>,

    #[account(seeds = [PROTOCOL_CONFIG_SEED], bump = config.bump)]
    pub config: Box<Account<'info, ProtocolConfig>>,

    /// CHECK: PDA identity only; used purely as escrow's CPI-signer into the gig program.
    #[account(seeds = [ESCROW_AUTHORITY_SEED], bump)]
    pub escrow_authority: UncheckedAccount<'info>,

    pub gig_program: Program<'info, gig::program::Gig>,
    pub token_program: Program<'info, Token>,
}

/// Returns a funded-but-undelivered milestone to the client once the gig
/// deadline plus the no-delivery grace period has passed. No protocol fee:
/// fees apply to releases, not refunds.
pub fn handler(ctx: Context<RefundAfterDeadline>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    require!(
        now >= ctx.accounts.gig.deadline.saturating_add(ctx.accounts.config.no_delivery_grace),
        EscrowError::GracePeriodActive
    );

    let refund = ctx.accounts.milestone.locked().ok_or_else(|| error!(EscrowError::MathError))?;
    let gig_key = ctx.accounts.gig.key();

    vault_transfer(
        &ctx.accounts.token_program.to_account_info(),
        &ctx.accounts.vault_token_account.to_account_info(),
        &ctx.accounts.mint.to_account_info(),
        &ctx.accounts.client_token_account.to_account_info(),
        &ctx.accounts.vault.to_account_info(),
        &gig_key,
        ctx.accounts.vault.bump,
        refund,
        ctx.accounts.mint.decimals,
    )?;

    let milestone = &mut ctx.accounts.milestone;
    milestone.refunded = checked_add(milestone.refunded, refund)?;
    milestone.status = MilestoneStatus::Refunded;

    let vault = &mut ctx.accounts.vault;
    vault.total_refunded = checked_add(vault.total_refunded, refund)?;
    vault.refunded_milestones = checked_add(vault.refunded_milestones as u64, 1)? as u32;
    let all_accounted = vault.accounted_milestones() >= vault.milestone_count as u64;
    let any_released = vault.active_milestone > 0;

    emit!(RefundedAfterDeadline { gig: gig_key, milestone: milestone.key(), amount: refund });

    // Close out the gig once every milestone is settled: Completed if the
    // freelancer was paid for any of it, otherwise Cancelled (which
    // `settle_reputation` records as a cancelled job).
    if all_accounted && ctx.accounts.gig.status == GigStatus::InProgress {
        let bump = ctx.bumps.escrow_authority;
        let signer_seeds: &[&[&[u8]]] = &[&[ESCROW_AUTHORITY_SEED, &[bump]]];
        let program = ctx.accounts.gig_program.key();
        let escrow_authority = ctx.accounts.escrow_authority.to_account_info();
        let gig = ctx.accounts.gig.to_account_info();
        if any_released {
            gig::cpi::mark_completed_by_escrow(CpiContext::new_with_signer(
                program,
                MarkCompletedByEscrow { escrow_authority, gig },
                signer_seeds,
            ))?;
        } else {
            gig::cpi::mark_cancelled_by_escrow(CpiContext::new_with_signer(
                program,
                MarkCancelledByEscrow { escrow_authority, gig },
                signer_seeds,
            ))?;
        }
    }
    Ok(())
}
