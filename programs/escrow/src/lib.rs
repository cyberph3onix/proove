pub mod constants;
pub mod errors;
pub mod events;
pub mod instructions;
pub mod state;
pub mod utils;

use anchor_lang::prelude::*;

pub use constants::*;
pub use errors::*;
pub use events::*;
pub use instructions::*;
pub use state::*;

declare_id!("ekeLPKaiGHb1vSVnCB7BjUeE4EZg5FyVCogMeTu5KQP");

#[cfg(not(feature = "no-entrypoint"))]
solana_security_txt::security_txt! {
    name: "Proove Escrow",
    project_url: "https://github.com/cyberph3onix/proove",
    contacts: "link:https://github.com/cyberph3onix/proove/security/advisories/new",
    policy: "https://github.com/cyberph3onix/proove/blob/main/SECURITY.md",
    preferred_languages: "en",
    source_code: "https://github.com/cyberph3onix/proove",
    source_release: env!("CARGO_PKG_VERSION"),
    auditors: "None"
}

#[program]
pub mod escrow {
    use super::*;

    /// Creates the next milestone for a gig, awaiting funding.
    pub fn create_milestone(
        ctx: Context<CreateMilestone>,
        amount: u64,
        spec_hash: [u8; 32],
    ) -> Result<()> {
        create_milestone::handler(ctx, amount, spec_hash)
    }

    /// Freelancer signs the milestone's committed spec hash before funding.
    pub fn accept_terms(ctx: Context<AcceptTerms>, spec_hash: [u8; 32]) -> Result<()> {
        accept_terms::handler(ctx, spec_hash)
    }

    /// Funds a milestone by transferring USDC from the client into the escrow vault.
    /// On the gig's first funding, CPIs into the gig program to move it InProgress.
    pub fn fund_milestone(ctx: Context<FundMilestone>) -> Result<()> {
        fund_milestone::handler(ctx)
    }

    /// Records the freelancer's delivery submission.
    pub fn submit_delivery(
        ctx: Context<SubmitDelivery>,
        delivery_hash: [u8; 32],
        report_hash: [u8; 32],
    ) -> Result<()> {
        submit_delivery::handler(ctx, delivery_hash, report_hash)
    }

    /// Client-approved release of the full remaining milestone balance.
    pub fn approve_milestone(ctx: Context<ApproveMilestone>) -> Result<()> {
        approve_milestone::handler(ctx)
    }

    /// Permissionless partial release (`partial_bps`) after `partial_timeout` of client inaction.
    pub fn partial_timeout_release(ctx: Context<PartialTimeoutRelease>) -> Result<()> {
        partial_timeout_release::handler(ctx)
    }

    /// Permissionless release of the remaining balance after `full_timeout` of client inaction.
    pub fn full_timeout_release(ctx: Context<FullTimeoutRelease>) -> Result<()> {
        full_timeout_release::handler(ctx)
    }

    /// Cancels and closes a milestone that was never funded, cancelling the gig via CPI.
    pub fn cancel_before_funding(ctx: Context<CancelBeforeFunding>) -> Result<()> {
        cancel_before_funding::handler(ctx)
    }

    /// Client submits the final 1-5 rating for a completed gig, CPI-attested by escrow.
    pub fn rate_freelancer(
        ctx: Context<RateFreelancer>,
        score: u8,
        review_hash: [u8; 32],
    ) -> Result<()> {
        rate_freelancer::handler(ctx, score, review_hash)
    }

    /// Permissionlessly notifies the Reputation Program once a gig's vault is
    /// fully released. Callable exactly once per gig.
    pub fn settle_reputation(ctx: Context<SettleReputation>) -> Result<()> {
        settle_reputation::handler(ctx)
    }

    /// Client reclaims a funded milestone with no delivery after deadline + grace.
    pub fn refund_after_deadline(ctx: Context<RefundAfterDeadline>) -> Result<()> {
        refund_after_deadline::handler(ctx)
    }

    /// One-time setup of the protocol config (first caller becomes admin).
    pub fn init_protocol_config(
        ctx: Context<InitProtocolConfig>,
        settings: ProtocolSettings,
    ) -> Result<()> {
        config_admin::init_handler(ctx, settings)
    }

    /// Admin updates protocol settings; every value is range-checked.
    pub fn update_protocol_config(
        ctx: Context<UpdateProtocolConfig>,
        settings: ProtocolSettings,
    ) -> Result<()> {
        config_admin::update_handler(ctx, settings)
    }

    /// Admin hands the config to a new admin (the DAO in Phase 2).
    pub fn set_protocol_admin(ctx: Context<SetProtocolAdmin>, new_admin: Pubkey) -> Result<()> {
        config_admin::set_admin_handler(ctx, new_admin)
    }
}
