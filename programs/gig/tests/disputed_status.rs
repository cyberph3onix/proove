//! `GigStatus::Disputed` and its escrow-only transitions. The happy path
//! needs escrow's dispute CPI (Phase 2); here we pin that nobody else can
//! drive them and that the enum layout stays v1-compatible.

mod common;

use common::*;
use solana_keypair::Keypair;
use solana_signer::Signer;
use std::sync::atomic::{AtomicU64, Ordering};

static NEXT_ID: AtomicU64 = AtomicU64::new(70_000);
fn next_id() -> u64 {
    NEXT_ID.fetch_add(1, Ordering::Relaxed)
}

#[test]
fn disputed_is_appended_after_v1_variants() {
    assert_eq!(GigStatus::Draft as u8, 0);
    assert_eq!(GigStatus::Archived as u8, 6);
    assert_eq!(GigStatus::Disputed as u8, 7);
}

#[test]
fn mark_disputed_direct_call_rejected() {
    let mut env = setup();
    let gig = init_gig(&mut env, next_id());
    publish_and_assign(&mut env, &gig);
    let attacker = Keypair::new();
    env.svm.airdrop(&attacker.pubkey(), 1_000_000_000).unwrap();
    let err = send(&mut env.svm, &env.payer, &[ix_mark_disputed_by_escrow(&attacker.pubkey(), &gig)], &[&env.payer, &attacker])
        .unwrap_err();
    assert!(err.contains("0x7d6") || err.to_lowercase().contains("seeds"), "expected ConstraintSeeds, got: {err}");
    assert_ne!(read_gig(&env.svm, &gig).status, GigStatus::Disputed);
}

#[test]
fn clear_dispute_direct_call_rejected() {
    let mut env = setup();
    let gig = init_gig(&mut env, next_id());
    let attacker = Keypair::new();
    env.svm.airdrop(&attacker.pubkey(), 1_000_000_000).unwrap();
    let err = send(&mut env.svm, &env.payer, &[ix_clear_dispute_by_escrow(&attacker.pubkey(), &gig)], &[&env.payer, &attacker])
        .unwrap_err();
    assert!(err.contains("0x7d6") || err.to_lowercase().contains("seeds"), "expected ConstraintSeeds, got: {err}");
}

#[test]
fn escrow_pda_without_signature_rejected() {
    let mut env = setup();
    let gig = init_gig(&mut env, next_id());
    publish_and_assign(&mut env, &gig);
    let (authority, _) = escrow_authority_pda();
    let mut ix = ix_mark_disputed_by_escrow(&authority, &gig);
    for m in ix.accounts.iter_mut() {
        if m.pubkey == authority {
            m.is_signer = false;
        }
    }
    assert!(send(&mut env.svm, &env.payer, &[ix], &[&env.payer]).is_err());
}
