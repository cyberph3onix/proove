use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};
use gig::cpi::accounts::MarkCompletedByEscrow;
use gig::Gig;

use crate::constants::{ESCROW_AUTHORITY_SEED, PROTOCOL_CONFIG_SEED, VAULT_SEED};
use crate::errors::EscrowError;
use crate::events::{FullReleaseExecuted, ProtocolFeeCollected};
use crate::state::{EscrowVault, Milestone, MilestoneStatus, ProtocolConfig};
use crate::utils::{checked_add, split_fee, vault_transfer};

#[derive(Accounts)]
pub struct FullTimeoutRelease<'info> {
    #[account(mut)]
    pub gig: Box<Account<'info, Gig>>,

    #[account(
        mut,
        constraint = milestone.gig == gig.key() @ EscrowError::Unauthorized,
        // Both `Submitted` and `PartialReleased` are accepted so the 7-day
        // guarantee stands on its own. Requiring `PartialReleased` made the
        // full release depend on the 72h partial having succeeded first, which
        // is not always possible: for a milestone small enough that 20% rounds
        // down to zero, `partial_timeout_release` rejects, and the funds were
        // then unreachable by any path.
        constraint = milestone.status == MilestoneStatus::Submitted
            || milestone.status == MilestoneStatus::PartialReleased
            @ EscrowError::InvalidStatus,
    )]
    pub milestone: Box<Account<'info, Milestone>>,

    #[account(
        mut,
        seeds = [VAULT_SEED, gig.key().as_ref()],
        bump = vault.bump,
        has_one = mint @ EscrowError::InvalidMint,
    )]
    pub vault: Account<'info, EscrowVault>,

    #[account(mut, address = vault.token_account @ EscrowError::Unauthorized)]
    pub vault_token_account: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = freelancer_token_account.mint == mint.key() @ EscrowError::InvalidMint,
        constraint = freelancer_token_account.owner == gig.freelancer @ EscrowError::Unauthorized,
    )]
    pub freelancer_token_account: Account<'info, TokenAccount>,

    pub mint: Account<'info, Mint>,

    #[account(seeds = [PROTOCOL_CONFIG_SEED], bump = config.bump)]
    pub config: Box<Account<'info, ProtocolConfig>>,

    /// Receives the protocol fee.
    #[account(
        mut,
        address = config.treasury @ EscrowError::InvalidTreasury,
        constraint = treasury_token_account.mint == mint.key() @ EscrowError::InvalidMint,
    )]
    pub treasury_token_account: Box<Account<'info, TokenAccount>>,

    /// CHECK: PDA identity only; used purely as escrow's CPI-signer into the gig program.
    #[account(seeds = [ESCROW_AUTHORITY_SEED], bump)]
    pub escrow_authority: UncheckedAccount<'info>,

    pub gig_program: Program<'info, gig::program::Gig>,

    pub token_program: Program<'info, Token>,
}

/// Permissionlessly releases the remaining balance once 7 days have elapsed
/// since delivery submission without client approval. CPIs into the gig program
/// to mark it Completed once the last milestone clears.
pub fn handler(ctx: Context<FullTimeoutRelease>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let milestone = &ctx.accounts.milestone;
    require!(
        now >= milestone.submitted_at.saturating_add(milestone.full_timeout),
        EscrowError::TimeoutNotReached
    );
    let remaining = milestone.locked().ok_or_else(|| error!(EscrowError::MathError))?;
    require!(remaining > 0, EscrowError::InsufficientFunds);

    let gig_key = ctx.accounts.gig.key();
    let (net, fee) = split_fee(remaining, ctx.accounts.milestone.fee_bps)?;
    let token_program = ctx.accounts.token_program.to_account_info();
    let vault_token = ctx.accounts.vault_token_account.to_account_info();
    let mint = ctx.accounts.mint.to_account_info();
    let vault_info = ctx.accounts.vault.to_account_info();
    let (bump, decimals) = (ctx.accounts.vault.bump, ctx.accounts.mint.decimals);
    vault_transfer(&token_program, &vault_token, &mint,
        &ctx.accounts.freelancer_token_account.to_account_info(), &vault_info, &gig_key, bump, net, decimals)?;
    vault_transfer(&token_program, &vault_token, &mint,
        &ctx.accounts.treasury_token_account.to_account_info(), &vault_info, &gig_key, bump, fee, decimals)?;

    let vault = &mut ctx.accounts.vault;
    vault.total_released = checked_add(vault.total_released, net)?;
    vault.total_fees = checked_add(vault.total_fees, fee)?;

    let milestone = &mut ctx.accounts.milestone;
    milestone.released = checked_add(milestone.released, net)?;
    milestone.fees_paid = checked_add(milestone.fees_paid, fee)?;
    milestone.approved_at = now;
    milestone.status = MilestoneStatus::Completed;

    // Mirrors `approve_milestone`.
    let vault = &mut ctx.accounts.vault;
    let is_last_milestone = vault.accounted_milestones() + 1 >= vault.milestone_count as u64;
    vault.active_milestone = checked_add(vault.active_milestone as u64, 1)? as u32;
    let milestone = &ctx.accounts.milestone;
    if fee > 0 {
        emit!(ProtocolFeeCollected { gig: gig_key, milestone: milestone.key(), amount: fee });
    }

    emit!(FullReleaseExecuted {
        gig: gig_key,
        milestone: milestone.key(),
        amount_released: net,
    });

    if is_last_milestone {
        let authority_bump = ctx.bumps.escrow_authority;
        let authority_signer_seeds: &[&[&[u8]]] = &[&[ESCROW_AUTHORITY_SEED, &[authority_bump]]];

        gig::cpi::mark_completed_by_escrow(CpiContext::new_with_signer(
            ctx.accounts.gig_program.key(),
            MarkCompletedByEscrow {
                escrow_authority: ctx.accounts.escrow_authority.to_account_info(),
                gig: ctx.accounts.gig.to_account_info(),
            },
            authority_signer_seeds,
        ))?;
    }

    Ok(())
}
