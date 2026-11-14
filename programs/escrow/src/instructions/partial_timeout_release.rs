use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};
use gig::Gig;

use crate::constants::{PROTOCOL_CONFIG_SEED, VAULT_SEED};
use crate::errors::EscrowError;
use crate::events::{PartialReleaseExecuted, ProtocolFeeCollected};
use crate::state::{EscrowVault, Milestone, MilestoneStatus, ProtocolConfig};
use crate::utils::{bps_of, checked_add, split_fee, vault_transfer};

#[derive(Accounts)]
pub struct PartialTimeoutRelease<'info> {
    pub gig: Box<Account<'info, Gig>>,

    #[account(
        mut,
        constraint = milestone.gig == gig.key() @ EscrowError::Unauthorized,
        constraint = milestone.status == MilestoneStatus::Submitted @ EscrowError::InvalidStatus,
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

    pub token_program: Program<'info, Token>,
}

/// Permissionlessly releases the snapshotted `partial_bps` share of a
/// milestone once `partial_timeout` has elapsed since delivery without client
/// action. The protocol fee comes out of that gross share.
pub fn handler(ctx: Context<PartialTimeoutRelease>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let milestone = &ctx.accounts.milestone;
    require!(
        now >= milestone.submitted_at.saturating_add(milestone.partial_timeout),
        EscrowError::TimeoutNotReached
    );
    let gross = bps_of(milestone.amount, milestone.partial_bps)?;
    require!(gross > 0, EscrowError::InsufficientFunds);

    let gig_key = ctx.accounts.gig.key();
    let (net, fee) = split_fee(gross, ctx.accounts.milestone.fee_bps)?;
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
    milestone.status = MilestoneStatus::PartialReleased;
    if fee > 0 {
        emit!(ProtocolFeeCollected { gig: gig_key, milestone: milestone.key(), amount: fee });
    }

    emit!(PartialReleaseExecuted {
        gig: gig_key,
        milestone: milestone.key(),
        amount_released: net,
    });

    Ok(())
}
