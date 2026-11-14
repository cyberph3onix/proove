use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};
use gig::cpi::accounts::MarkCompletedByEscrow;
use gig::Gig;

use crate::constants::{ESCROW_AUTHORITY_SEED, PROTOCOL_CONFIG_SEED, VAULT_SEED};
use crate::errors::EscrowError;
use crate::events::{MilestoneApproved, ProtocolFeeCollected};
use crate::state::{EscrowVault, Milestone, MilestoneStatus, ProtocolConfig};
use crate::utils::{checked_add, split_fee, vault_transfer};

#[derive(Accounts)]
pub struct ApproveMilestone<'info> {
    pub client: Signer<'info>,

    #[account(mut, has_one = client @ EscrowError::Unauthorized)]
    pub gig: Box<Account<'info, Gig>>,

    #[account(
        mut,
        constraint = milestone.gig == gig.key() @ EscrowError::Unauthorized,
        // `PartialReleased` is accepted alongside `Submitted` so the client can
        // still approve (and pay the remaining balance) after the permissionless
        // 72h partial has fired. Gating on `Submitted` alone meant a single
        // partial release permanently removed the client's only payment path
        // until the 7-day full timeout.
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

    /// CHECK: destination ownership validated via `freelancer_token_account.owner` constraint below.
    #[account(address = gig.freelancer @ EscrowError::Unauthorized)]
    pub freelancer: UncheckedAccount<'info>,

    #[account(
        mut,
        constraint = freelancer_token_account.mint == mint.key() @ EscrowError::InvalidMint,
        constraint = freelancer_token_account.owner == freelancer.key() @ EscrowError::Unauthorized,
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

/// Releases the remaining balance of an approved milestone to the freelancer.
/// CPIs into the gig program to mark it Completed once the last milestone clears.
pub fn handler(ctx: Context<ApproveMilestone>) -> Result<()> {
    let remaining = ctx.accounts.milestone.locked().ok_or_else(|| error!(EscrowError::MathError))?;
    require!(remaining > 0, EscrowError::InsufficientFunds);
    let now = Clock::get()?.unix_timestamp;

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

    // Cancelled and refunded milestones count toward "everything is accounted
    // for", so a gig with either can still reach Completed.
    let vault = &mut ctx.accounts.vault;
    let is_last_milestone = vault.accounted_milestones() + 1 >= vault.milestone_count as u64;
    vault.active_milestone = checked_add(vault.active_milestone as u64, 1)? as u32;
    let milestone = &ctx.accounts.milestone;
    if fee > 0 {
        emit!(ProtocolFeeCollected { gig: gig_key, milestone: milestone.key(), amount: fee });
    }

    emit!(MilestoneApproved {
        gig: gig_key,
        milestone: milestone.key(),
        amount_released: net,
        approved_at: now,
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
