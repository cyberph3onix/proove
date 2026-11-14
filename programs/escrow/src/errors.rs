use anchor_lang::prelude::*;

#[error_code]
pub enum EscrowError {
    #[msg("Signer is not authorized to perform this action")]
    Unauthorized,
    #[msg("Account is not in the required status for this action")]
    InvalidStatus,
    #[msg("Milestone has already been funded")]
    AlreadyFunded,
    #[msg("Vault does not hold sufficient funds")]
    InsufficientFunds,
    #[msg("Token mint does not match the expected mint")]
    InvalidMint,
    #[msg("Milestone has already been submitted")]
    MilestoneAlreadySubmitted,
    #[msg("Timeout window has not yet elapsed")]
    TimeoutNotReached,
    #[msg("Arithmetic overflow")]
    Overflow,
    #[msg("Arithmetic error")]
    MathError,
    #[msg("Milestone amount must be greater than zero")]
    InvalidAmount,
    #[msg("Gig must be in Assigned or InProgress status to create/fund a milestone")]
    GigNotFundable,
    // ── Proove additions (appended so v1 error codes keep their numbers) ──
    #[msg("Milestone amount is below the protocol minimum")]
    AmountBelowMinimum,
    #[msg("The spec hash does not match the milestone's committed spec")]
    SpecHashMismatch,
    #[msg("The freelancer has not accepted this milestone's terms yet")]
    TermsNotAccepted,
    #[msg("The gig has no assigned freelancer")]
    NoFreelancer,
    #[msg("A protocol setting is outside its allowed range")]
    OutOfRange,
    #[msg("The no-delivery grace period has not passed yet")]
    GracePeriodActive,
    #[msg("Treasury token account does not match the protocol config")]
    InvalidTreasury,
    #[msg("A delivery hash is required")]
    MissingDeliveryHash,
}
