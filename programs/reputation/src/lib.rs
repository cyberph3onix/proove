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

declare_id!("5Tm5aXm3NRzX6fJL3R7NeRbjhZjxTUfJ4nTLurPxdPc6");

#[cfg(not(feature = "no-entrypoint"))]
solana_security_txt::security_txt! {
    name: "Proove Reputation",
    project_url: "https://github.com/cyberph3onix/proove",
    contacts: "link:https://github.com/cyberph3onix/proove/security/advisories/new",
    policy: "https://github.com/cyberph3onix/proove/blob/main/SECURITY.md",
    preferred_languages: "en",
    source_code: "https://github.com/cyberph3onix/proove",
    source_release: env!("CARGO_PKG_VERSION"),
    auditors: "None"
}

#[program]
pub mod reputation {
    use super::*;

    /// Creates a user's reputation profile PDA. Callable once per authority.
    pub fn initialize_profile(ctx: Context<InitializeProfile>) -> Result<()> {
        initialize_profile::handler(ctx)
    }

    /// Client submits an immutable 1-5 rating for a completed job.
    pub fn submit_rating(
        ctx: Context<SubmitRating>,
        job_id: u64,
        score: u8,
        review_hash: [u8; 32],
    ) -> Result<()> {
        submit_rating::handler(ctx, job_id, score, review_hash)
    }

    /// Records a job completion (success or cancellation) and its earnings.
    pub fn update_completion(
        ctx: Context<UpdateCompletion>,
        successful: bool,
        earnings: u64,
        delivered_on_time: bool,
        disputed_outcome: Option<u16>,
    ) -> Result<()> {
        update_completion::handler(ctx, successful, earnings, delivered_on_time, disputed_outcome)
    }

    /// Awards a deterministically-eligible badge to a profile.
    pub fn award_badge(
        ctx: Context<AwardBadge>,
        badge_type: BadgeType,
        metadata: String,
    ) -> Result<()> {
        award_badge::handler(ctx, badge_type, metadata)
    }

    /// Read-only helper returning a profile's current reputation score.
    pub fn get_profile(ctx: Context<GetProfile>) -> Result<u64> {
        get_profile::handler(ctx)
    }
}
