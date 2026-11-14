use anchor_lang::prelude::*;
use anchor_spl::token::TokenAccount;

use crate::constants::PROTOCOL_CONFIG_SEED;
use crate::errors::EscrowError;
use crate::events::ProtocolConfigUpdated;
use crate::state::{ProtocolConfig, ProtocolSettings};
use crate::utils::validate_settings;

#[derive(Accounts)]
pub struct InitProtocolConfig<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        init,
        payer = admin,
        space = ProtocolConfig::INIT_SPACE,
        seeds = [PROTOCOL_CONFIG_SEED],
        bump,
    )]
    pub config: Account<'info, ProtocolConfig>,

    /// USDC token account that receives protocol fees.
    pub treasury: Account<'info, TokenAccount>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateProtocolConfig<'info> {
    pub admin: Signer<'info>,

    #[account(
        mut,
        seeds = [PROTOCOL_CONFIG_SEED],
        bump = config.bump,
        has_one = admin @ EscrowError::Unauthorized,
    )]
    pub config: Account<'info, ProtocolConfig>,

    /// Fee destination; pass the current one to keep it.
    pub treasury: Account<'info, TokenAccount>,
}

#[derive(Accounts)]
pub struct SetProtocolAdmin<'info> {
    pub admin: Signer<'info>,

    #[account(
        mut,
        seeds = [PROTOCOL_CONFIG_SEED],
        bump = config.bump,
        has_one = admin @ EscrowError::Unauthorized,
    )]
    pub config: Account<'info, ProtocolConfig>,
}

fn apply(config: &mut ProtocolConfig, treasury: Pubkey, s: &ProtocolSettings) -> Result<()> {
    validate_settings(s)?;
    config.treasury = treasury;
    config.partial_timeout = s.partial_timeout;
    config.full_timeout = s.full_timeout;
    config.partial_bps = s.partial_bps;
    config.fee_bps = s.fee_bps;
    config.min_milestone = s.min_milestone;
    config.no_delivery_grace = s.no_delivery_grace;
    emit!(ProtocolConfigUpdated {
        admin: config.admin,
        treasury,
        partial_timeout: s.partial_timeout,
        full_timeout: s.full_timeout,
        partial_bps: s.partial_bps,
        fee_bps: s.fee_bps,
        min_milestone: s.min_milestone,
        no_delivery_grace: s.no_delivery_grace,
    });
    Ok(())
}

/// One-time setup of the singleton config. Like achievement's `init_collection`
/// this is first-caller-wins, so the deploy script must call it in the same run
/// as the deployment.
pub fn init_handler(ctx: Context<InitProtocolConfig>, settings: ProtocolSettings) -> Result<()> {
    let config = &mut ctx.accounts.config;
    config.admin = ctx.accounts.admin.key();
    config.bump = ctx.bumps.config;
    apply(config, ctx.accounts.treasury.key(), &settings)
}

pub fn update_handler(ctx: Context<UpdateProtocolConfig>, settings: ProtocolSettings) -> Result<()> {
    let treasury = ctx.accounts.treasury.key();
    apply(&mut ctx.accounts.config, treasury, &settings)
}

/// Hands the admin role to a new key (Phase 2: the DAO governance PDA).
pub fn set_admin_handler(ctx: Context<SetProtocolAdmin>, new_admin: Pubkey) -> Result<()> {
    ctx.accounts.config.admin = new_admin;
    Ok(())
}
