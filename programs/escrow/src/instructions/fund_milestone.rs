use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Mint, TransferChecked};
use gig::cpi::accounts::MarkInProgress;
use gig::{Gig, GigStatus};

use crate::constants::{ESCROW_AUTHORITY_SEED, PROTOCOL_CONFIG_SEED, VAULT_SEED};
use crate::errors::EscrowError;
use crate::events::MilestoneFunded;
use crate::state::{EscrowVault, Milestone, MilestoneStatus, ProtocolConfig};
use crate::utils::checked_add;

#[derive(Accounts)]
pub struct FundMilestone<'info> {
    #[account(mut)]
    pub client: Signer<'info>,

    #[account(
        mut,
        has_one = client @ EscrowError::Unauthorized,
        has_one = mint @ EscrowError::InvalidMint,
        constraint = gig.status == GigStatus::Assigned || gig.status == GigStatus::InProgress
            @ EscrowError::GigNotFundable,
    )]
    pub gig: Box<Account<'info, Gig>>,

    #[account(
        mut,
        constraint = milestone.gig == gig.key() @ EscrowError::Unauthorized,
        constraint = milestone.status == MilestoneStatus::PendingFunding @ EscrowError::AlreadyFunded,
        constraint = milestone.spec_hash == [0u8; 32] || milestone.terms_accepted
            @ EscrowError::TermsNotAccepted,
    )]
    pub milestone: Box<Account<'info, Milestone>>,

    #[account(
        mut,
        seeds = [VAULT_SEED, gig.key().as_ref()],
        bump = vault.bump,
    )]
    pub vault: Account<'info, EscrowVault>,

    #[account(
        init_if_needed,
        payer = client,
        token::mint = mint,
        token::authority = vault,
        seeds = [VAULT_SEED, gig.key().as_ref(), b"token"],
        bump,
    )]
    pub vault_token_account: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = client_token_account.mint == mint.key() @ EscrowError::InvalidMint,
        constraint = client_token_account.owner == client.key() @ EscrowError::Unauthorized,
    )]
    pub client_token_account: Account<'info, TokenAccount>,

    pub mint: Account<'info, Mint>,

    #[account(seeds = [PROTOCOL_CONFIG_SEED], bump = config.bump)]
    pub config: Box<Account<'info, ProtocolConfig>>,

    /// CHECK: PDA identity only; used purely as escrow's CPI-signer into the gig program.
    #[account(seeds = [ESCROW_AUTHORITY_SEED], bump)]
    pub escrow_authority: UncheckedAccount<'info>,

    pub gig_program: Program<'info, gig::program::Gig>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

/// Transfers `milestone.amount` in USDC from the client into the gig's escrow vault.
/// On the gig's first funding, CPIs into the gig program to move Assigned -> InProgress.
pub fn handler(ctx: Context<FundMilestone>) -> Result<()> {
    let amount = ctx.accounts.milestone.amount;

    token::transfer_checked(
        CpiContext::new(
            ctx.accounts.token_program.key(),
            TransferChecked {
                from: ctx.accounts.client_token_account.to_account_info(),
                mint: ctx.accounts.mint.to_account_info(),
                to: ctx.accounts.vault_token_account.to_account_info(),
                authority: ctx.accounts.client.to_account_info(),
            },
        ),
        amount,
        ctx.accounts.mint.decimals,
    )?;

    let vault = &mut ctx.accounts.vault;
    if vault.token_account == Pubkey::default() {
        vault.token_account = ctx.accounts.vault_token_account.key();
        vault.mint = ctx.accounts.mint.key();
    } else {
        require_keys_eq!(vault.mint, ctx.accounts.mint.key(), EscrowError::InvalidMint);
    }
    vault.total_locked = checked_add(vault.total_locked, amount)?;

    // Snapshot the protocol terms: later config changes (e.g. a DAO vote)
    // only apply to milestones funded afterwards.
    let config = &ctx.accounts.config;
    let milestone = &mut ctx.accounts.milestone;
    milestone.status = MilestoneStatus::Funded;
    milestone.funded_at = Clock::get()?.unix_timestamp;
    milestone.partial_timeout = config.partial_timeout;
    milestone.full_timeout = config.full_timeout;
    milestone.partial_bps = config.partial_bps;
    milestone.fee_bps = config.fee_bps;

    emit!(MilestoneFunded {
        gig: ctx.accounts.gig.key(),
        milestone: milestone.key(),
        amount,
    });

    if ctx.accounts.gig.status == GigStatus::Assigned {
        let bump = ctx.bumps.escrow_authority;
        let signer_seeds: &[&[&[u8]]] = &[&[ESCROW_AUTHORITY_SEED, &[bump]]];

        gig::cpi::mark_in_progress(CpiContext::new_with_signer(
            ctx.accounts.gig_program.key(),
            MarkInProgress {
                escrow_authority: ctx.accounts.escrow_authority.to_account_info(),
                gig: ctx.accounts.gig.to_account_info(),
            },
            signer_seeds,
        ))?;
    }

    Ok(())
}
