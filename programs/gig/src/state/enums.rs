use anchor_lang::prelude::*;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
pub enum GigStatus {
    Draft,
    Published,
    Assigned,
    /// Entered only via escrow's CPI when the first milestone is funded.
    InProgress,
    Completed,
    Cancelled,
    Archived,
    /// Appended in Proove (v1 discriminants unchanged). Entered and left only
    /// via escrow CPI while a milestone is frozen by a dispute (Phase 2).
    Disputed,
}
