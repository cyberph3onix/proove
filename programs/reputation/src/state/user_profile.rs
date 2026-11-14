use anchor_lang::prelude::*;

#[account]
pub struct UserProfile {
    pub authority: Pubkey,
    pub completed_jobs: u64,
    pub successful_jobs: u64,
    pub cancelled_jobs: u64,
    pub total_earnings: u64,
    /// Sum of all submitted ratings, kept alongside `rating_count` so the
    /// average can be recomputed exactly instead of drifting through
    /// repeated incremental updates.
    pub rating_sum: u64,
    pub rating_count: u64,
    /// Average rating scaled by `RATING_SCALE` (e.g. 450 == 4.50 stars).
    pub average_rating: u32,
    pub reputation_score: u64,
    pub badges_earned: u32,
    pub created_at: i64,
    pub updated_at: i64,
    pub bump: u8,
    // ── Proove additions, reported by escrow at settlement ──
    /// Jobs where every delivery landed on or before the gig deadline.
    pub on_time_jobs: u64,
    /// Disputed jobs whose ruling gave the freelancer at least half.
    pub disputes_won: u64,
    pub disputes_lost: u64,
}

impl UserProfile {
    pub const INIT_SPACE: usize = 8 // discriminator
        + 32 // authority
        + 8 // completed_jobs
        + 8 // successful_jobs
        + 8 // cancelled_jobs
        + 8 // total_earnings
        + 8 // rating_sum
        + 8 // rating_count
        + 4 // average_rating
        + 8 // reputation_score
        + 4 // badges_earned
        + 8 // created_at
        + 8 // updated_at
        + 1 // bump
        + 8 // on_time_jobs
        + 8 // disputes_won
        + 8; // disputes_lost
}
