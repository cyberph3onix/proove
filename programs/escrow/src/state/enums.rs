use anchor_lang::prelude::*;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
pub enum MilestoneStatus {
    PendingFunding,
    Funded,
    Submitted,
    PartialReleased,
    Completed,
    // Appended in Proove; v1 variants keep their discriminants.
    /// Client refunded after the deadline + grace with no delivery.
    Refunded,
    /// Frozen by an open dispute (Phase 2).
    Disputed,
    /// Settled by a dispute ruling (Phase 2).
    Resolved,
}
