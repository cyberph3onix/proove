pub mod constants;
pub mod errors;
pub mod events;
pub mod instructions;
pub mod state;

use anchor_lang::prelude::*;

pub use constants::*;
pub use errors::*;
pub use events::*;
pub use instructions::*;
pub use reputation::BadgeType;
pub use state::*;

declare_id!("ACMSSsuJaZ23xezUbkqjCNBhXCcUGEqfNe2cTZBogkRo");

#[cfg(not(feature = "no-entrypoint"))]
solana_security_txt::security_txt! {
    name: "Proove Achievement",
    project_url: "https://github.com/cyberph3onix/proove",
    contacts: "link:https://github.com/cyberph3onix/proove/security/advisories/new",
    policy: "https://github.com/cyberph3onix/proove/blob/main/SECURITY.md",
    preferred_languages: "en",
    source_code: "https://github.com/cyberph3onix/proove",
    source_release: env!("CARGO_PKG_VERSION"),
    auditors: "None"
}

#[program]
pub mod achievement {
    use super::*;

    /// One-time admin setup: creates the shared NFT collection every
    /// achievement is minted into, and records the metadata base URI.
    /// Settlement never touches this program -- claiming is always a
    /// separate, user-initiated transaction.
    pub fn init_collection(
        ctx: Context<InitCollection>,
        name: String,
        uri: String,
        base_uri: String,
    ) -> Result<()> {
        init_collection::handler(ctx, name, uri, base_uri)
    }

    /// Admin-only: repoints badge metadata at a new host. Affects assets
    /// minted after the change; already-minted NFTs keep their URI.
    pub fn set_base_uri(ctx: Context<SetBaseUri>, base_uri: String) -> Result<()> {
        set_base_uri::handler(ctx, base_uri)
    }

    /// User-initiated: mints the NFT for a badge already earned in the
    /// Reputation program. Reputation is never queried or modified by this
    /// call beyond reading the existing profile/badge PDAs.
    pub fn claim_achievement(ctx: Context<ClaimAchievement>, badge_type: BadgeType) -> Result<()> {
        claim_achievement::handler(ctx, badge_type)
    }
}
