//! Proove additions to escrow: protocol config, the agreement layer
//! (spec hash, accept_terms, delivery/report hashes), protocol fees on every
//! release path, and refund_after_deadline.
//!
//! Grouped by the v1 categories: authorization, PDA forgery, state
//! transitions, timing boundaries, arithmetic. Every money-moving test checks
//! released + refunded + fees + locked = amount.

mod common;

use anchor_lang::solana_program::instruction::Instruction;
use common::*;
use escrow::EscrowError;
use solana_keypair::Keypair;
use solana_pubkey::Pubkey;
use solana_signer::Signer;
use std::sync::atomic::{AtomicU64, Ordering};

static NEXT_ID: AtomicU64 = AtomicU64::new(20_000);
fn next_id() -> u64 {
    NEXT_ID.fetch_add(1, Ordering::Relaxed)
}

const SPEC: [u8; 32] = [0x5e; 32];
const REPORT: [u8; 32] = [0x7a; 32];
const AMOUNT: u64 = 10_000_000; // 10 USDC
const HOUR: i64 = 3_600;
const DAY: i64 = 86_400;

/// Gig created, published and assigned; no milestone yet.
struct Ctx {
    gig: Pubkey,
    milestone: Pubkey,
    vault: Pubkey,
    vault_token_account: Pubkey,
    client_token_account: Pubkey,
    freelancer_token_account: Pubkey,
}

fn assigned_gig(env: &mut Env) -> Pubkey {
    let gig = init_gig(env, next_id());
    publish_and_assign(env, &gig);
    gig
}

fn ctx_for(env: &mut Env, gig: Pubkey, index: u32) -> Ctx {
    let (milestone, _) = milestone_pda(&gig, index);
    let (vault, _) = vault_pda(&gig);
    let (vault_token_account, _) = vault_token_pda(&gig);
    let client_token_account = create_token_account(&mut env.svm, &env.payer, &env.mint.pubkey(), &env.client.pubkey());
    let freelancer_token_account =
        create_token_account(&mut env.svm, &env.payer, &env.mint.pubkey(), &env.freelancer.pubkey());
    Ctx { gig, milestone, vault, vault_token_account, client_token_account, freelancer_token_account }
}

fn client_send(env: &mut Env, ix: Instruction) -> Result<(), String> {
    let client = env.client.insecure_clone();
    env.svm.expire_blockhash(); // identical retries must not be deduplicated
    send(&mut env.svm, &env.payer, &[ix], &[&env.payer, &client])
}

fn freelancer_send(env: &mut Env, ix: Instruction) -> Result<(), String> {
    let freelancer = env.freelancer.insecure_clone();
    env.svm.expire_blockhash(); // identical retries must not be deduplicated
    send(&mut env.svm, &env.payer, &[ix], &[&env.payer, &freelancer])
}

fn anyone_send(env: &mut Env, ix: Instruction) -> Result<(), String> {
    env.svm.expire_blockhash();
    send(&mut env.svm, &env.payer, &[ix], &[&env.payer])
}

fn create_with_spec(env: &mut Env, c: &Ctx, amount: u64, spec: [u8; 32]) -> Result<(), String> {
    let client = env.client.pubkey();
    client_send(env, ix_create_milestone_with_spec(&client, &c.gig, &c.milestone, amount, spec))
}

fn fund_ix(env: &Env, c: &Ctx) -> Instruction {
    ix_fund_milestone(&FundAccounts {
        client: env.client.pubkey(),
        gig: c.gig,
        milestone: c.milestone,
        vault: c.vault,
        vault_token_account: c.vault_token_account,
        client_token_account: c.client_token_account,
        mint: env.mint.pubkey(),
    })
}

fn fund(env: &mut Env, c: &Ctx, amount: u64) -> Result<(), String> {
    let payer = env.payer.insecure_clone();
    mint_to(&mut env.svm, &payer, &env.mint.pubkey(), &payer, &c.client_token_account, amount);
    let ix = fund_ix(env, c);
    client_send(env, ix)
}

fn accept(env: &mut Env, c: &Ctx, spec: [u8; 32]) -> Result<(), String> {
    let freelancer = env.freelancer.pubkey();
    freelancer_send(env, ix_accept_terms(&freelancer, &c.gig, &c.milestone, spec))
}

fn submit(env: &mut Env, c: &Ctx) -> Result<(), String> {
    let freelancer = env.freelancer.pubkey();
    freelancer_send(env, ix_submit_delivery_with(&freelancer, &c.gig, &c.milestone, TEST_DELIVERY_HASH, REPORT))
}

fn release_accts(env: &Env, c: &Ctx) -> ReleaseAccounts {
    ReleaseAccounts {
        client: env.client.pubkey(),
        gig: c.gig,
        milestone: c.milestone,
        vault: c.vault,
        vault_token_account: c.vault_token_account,
        freelancer: env.freelancer.pubkey(),
        freelancer_token_account: c.freelancer_token_account,
        mint: env.mint.pubkey(),
    }
}

fn timeout_accts(env: &Env, c: &Ctx) -> TimeoutAccounts {
    TimeoutAccounts {
        gig: c.gig,
        milestone: c.milestone,
        vault: c.vault,
        vault_token_account: c.vault_token_account,
        freelancer_token_account: c.freelancer_token_account,
        mint: env.mint.pubkey(),
    }
}

fn refund_accts(env: &Env, c: &Ctx) -> RefundAccounts {
    RefundAccounts {
        client: env.client.pubkey(),
        gig: c.gig,
        milestone: c.milestone,
        vault: c.vault,
        vault_token_account: c.vault_token_account,
        client_token_account: c.client_token_account,
        mint: env.mint.pubkey(),
    }
}

/// Spec-committed milestone, accepted, funded and delivered.
fn delivered(env: &mut Env, amount: u64) -> Ctx {
    let gig = assigned_gig(env);
    let c = ctx_for(env, gig, 0);
    create_with_spec(env, &c, amount, SPEC).unwrap();
    accept(env, &c, SPEC).unwrap();
    fund(env, &c, amount).unwrap();
    submit(env, &c).unwrap();
    c
}

fn with_fee(fee_bps: u16) -> ProtocolSettings {
    ProtocolSettings { fee_bps, ..TEST_SETTINGS }
}

/// Seconds from the test clock (1.7e9) to the gig deadline plus grace.
fn until_refund_allowed() -> i64 {
    TEST_DEADLINE - 1_700_000_000 + TEST_SETTINGS.no_delivery_grace
}

// ═══════════════════════════════ protocol config ═══════════════════════════════

#[test]
fn config_init_records_admin_treasury_and_settings() {
    let env = setup();
    let cfg = read_protocol_config(&env.svm);
    assert_eq!(cfg.admin, env.admin.pubkey());
    assert_eq!(cfg.treasury, treasury());
    assert_eq!(cfg.partial_timeout, TEST_SETTINGS.partial_timeout);
    assert_eq!(cfg.full_timeout, TEST_SETTINGS.full_timeout);
    assert_eq!(cfg.partial_bps, TEST_SETTINGS.partial_bps);
    assert_eq!(cfg.fee_bps, TEST_SETTINGS.fee_bps);
    assert_eq!(cfg.min_milestone, TEST_SETTINGS.min_milestone);
    assert_eq!(cfg.no_delivery_grace, TEST_SETTINGS.no_delivery_grace);
}

#[test]
fn config_init_rejects_out_of_range_values() {
    let cases = [
        ProtocolSettings { partial_timeout: DAY - 1, ..TEST_SETTINGS },
        ProtocolSettings { full_timeout: 14 * DAY + 1, ..TEST_SETTINGS },
        ProtocolSettings { partial_bps: 5_001, ..TEST_SETTINGS },
        ProtocolSettings { fee_bps: 201, ..TEST_SETTINGS },
        ProtocolSettings { min_milestone: 999_999, ..TEST_SETTINGS },
        ProtocolSettings { min_milestone: 100_000_001, ..TEST_SETTINGS },
        ProtocolSettings { no_delivery_grace: DAY - 1, ..TEST_SETTINGS },
        ProtocolSettings { partial_timeout: 5 * DAY, full_timeout: 4 * DAY, ..TEST_SETTINGS },
    ];
    for settings in cases {
        let mut env = setup_without_config();
        let admin = env.admin.insecure_clone();
        let r = send(&mut env.svm, &env.payer, &[ix_init_protocol_config(&admin.pubkey(), &treasury(), settings)], &[&env.payer, &admin]);
        assert_escrow_err(r, EscrowError::OutOfRange);
    }
}

#[test]
fn config_init_is_one_time() {
    let mut env = setup();
    let other = Keypair::new();
    env.svm.airdrop(&other.pubkey(), 1_000_000_000).unwrap();
    let r = send(&mut env.svm, &env.payer, &[ix_init_protocol_config(&other.pubkey(), &treasury(), TEST_SETTINGS)], &[&env.payer, &other]);
    assert!(r.is_err(), "a second init must fail");
    assert_eq!(read_protocol_config(&env.svm).admin, env.admin.pubkey());
}

#[test]
fn config_update_by_admin_applies_and_validates() {
    let mut env = setup();
    let admin = env.admin.insecure_clone();
    let new = ProtocolSettings { fee_bps: 50, partial_timeout: 48 * HOUR, ..TEST_SETTINGS };
    send(&mut env.svm, &env.payer, &[ix_update_protocol_config(&admin.pubkey(), &treasury(), new)], &[&env.payer, &admin]).unwrap();
    let cfg = read_protocol_config(&env.svm);
    assert_eq!(cfg.fee_bps, 50);
    assert_eq!(cfg.partial_timeout, 48 * HOUR);

    let bad = ProtocolSettings { fee_bps: 300, ..TEST_SETTINGS };
    let r = send(&mut env.svm, &env.payer, &[ix_update_protocol_config(&admin.pubkey(), &treasury(), bad)], &[&env.payer, &admin]);
    assert_escrow_err(r, EscrowError::OutOfRange);
}

#[test]
fn auth_config_update_rejects_non_admin() {
    let mut env = setup();
    let client = env.client.insecure_clone();
    let r = send(&mut env.svm, &env.payer, &[ix_update_protocol_config(&client.pubkey(), &treasury(), with_fee(100))], &[&env.payer, &client]);
    assert_escrow_err(r, EscrowError::Unauthorized);
    let r = send(&mut env.svm, &env.payer, &[ix_set_protocol_admin(&client.pubkey(), client.pubkey())], &[&env.payer, &client]);
    assert_escrow_err(r, EscrowError::Unauthorized);
}

#[test]
fn config_admin_handoff() {
    let mut env = setup();
    let admin = env.admin.insecure_clone();
    let dao = Keypair::new();
    env.svm.airdrop(&dao.pubkey(), 1_000_000_000).unwrap();
    send(&mut env.svm, &env.payer, &[ix_set_protocol_admin(&admin.pubkey(), dao.pubkey())], &[&env.payer, &admin]).unwrap();
    // Old admin is locked out, new admin can update.
    let r = send(&mut env.svm, &env.payer, &[ix_update_protocol_config(&admin.pubkey(), &treasury(), with_fee(10))], &[&env.payer, &admin]);
    assert_escrow_err(r, EscrowError::Unauthorized);
    send(&mut env.svm, &env.payer, &[ix_update_protocol_config(&dao.pubkey(), &treasury(), with_fee(10))], &[&env.payer, &dao]).unwrap();
    assert_eq!(read_protocol_config(&env.svm).fee_bps, 10);
}

// ═══════════════════════════════ create / accept / fund ═══════════════════════════════

#[test]
fn create_milestone_enforces_minimum() {
    let mut env = setup_with_settings(ProtocolSettings { min_milestone: 5_000_000, ..TEST_SETTINGS });
    let gig = assigned_gig(&mut env);
    let c = ctx_for(&mut env, gig, 0);
    assert_escrow_err(create_with_spec(&mut env, &c, 4_999_999, SPEC), EscrowError::AmountBelowMinimum);
    create_with_spec(&mut env, &c, 5_000_000, SPEC).unwrap();
    let m = read_milestone(&env.svm, &c.milestone);
    assert_eq!(m.spec_hash, SPEC);
    assert!(!m.terms_accepted);
}

#[test]
fn fund_requires_accepted_terms_when_spec_committed() {
    let mut env = setup();
    let gig = assigned_gig(&mut env);
    let c = ctx_for(&mut env, gig, 0);
    create_with_spec(&mut env, &c, AMOUNT, SPEC).unwrap();
    assert_escrow_err(fund(&mut env, &c, AMOUNT), EscrowError::TermsNotAccepted);
    accept(&mut env, &c, SPEC).unwrap();
    fund(&mut env, &c, 0).unwrap(); // tokens were minted by the failed attempt
    assert_eq!(read_milestone(&env.svm, &c.milestone).status, MilestoneStatus::Funded);
}

#[test]
fn fund_without_spec_skips_accept_terms() {
    let mut env = setup();
    let gig = assigned_gig(&mut env);
    let c = ctx_for(&mut env, gig, 0);
    create_with_spec(&mut env, &c, AMOUNT, [0u8; 32]).unwrap();
    fund(&mut env, &c, AMOUNT).unwrap();
}

#[test]
fn accept_terms_rejects_mismatched_spec_hash() {
    let mut env = setup();
    let gig = assigned_gig(&mut env);
    let c = ctx_for(&mut env, gig, 0);
    create_with_spec(&mut env, &c, AMOUNT, SPEC).unwrap();
    assert_escrow_err(accept(&mut env, &c, [0x11; 32]), EscrowError::SpecHashMismatch);
    assert!(!read_milestone(&env.svm, &c.milestone).terms_accepted);
}

#[test]
fn auth_accept_terms_only_assigned_freelancer() {
    let mut env = setup();
    let gig = assigned_gig(&mut env);
    let c = ctx_for(&mut env, gig, 0);
    create_with_spec(&mut env, &c, AMOUNT, SPEC).unwrap();
    let client = env.client.pubkey();
    // The client signing as "freelancer" fails has_one.
    let r = client_send(&mut env, ix_accept_terms(&client, &c.gig, &c.milestone, SPEC));
    assert_escrow_err(r, EscrowError::Unauthorized);
}

#[test]
fn state_accept_terms_only_before_funding() {
    let mut env = setup();
    let c = delivered(&mut env, AMOUNT);
    assert_escrow_err(accept(&mut env, &c, SPEC), EscrowError::InvalidStatus);
}

#[test]
fn fund_snapshots_terms_so_later_config_changes_do_not_apply() {
    let mut env = setup();
    let gig = assigned_gig(&mut env);
    let c = ctx_for(&mut env, gig, 0);
    create_with_spec(&mut env, &c, AMOUNT, [0u8; 32]).unwrap();
    fund(&mut env, &c, AMOUNT).unwrap();

    let admin = env.admin.insecure_clone();
    let changed = ProtocolSettings { partial_timeout: 5 * DAY, full_timeout: 10 * DAY, partial_bps: 4_000, fee_bps: 200, ..TEST_SETTINGS };
    send(&mut env.svm, &env.payer, &[ix_update_protocol_config(&admin.pubkey(), &treasury(), changed)], &[&env.payer, &admin]).unwrap();

    let m = read_milestone(&env.svm, &c.milestone);
    assert_eq!(m.partial_timeout, TEST_SETTINGS.partial_timeout);
    assert_eq!(m.full_timeout, TEST_SETTINGS.full_timeout);
    assert_eq!(m.partial_bps, TEST_SETTINGS.partial_bps);
    assert_eq!(m.fee_bps, TEST_SETTINGS.fee_bps);
    assert!(m.funded_at > 0);
}

// ═══════════════════════════════ submit delivery ═══════════════════════════════

#[test]
fn submit_records_hashes_and_slot() {
    let mut env = setup();
    let c = delivered(&mut env, AMOUNT);
    let m = read_milestone(&env.svm, &c.milestone);
    assert_eq!(m.delivery_hash, TEST_DELIVERY_HASH);
    assert_eq!(m.report_hash, REPORT);
    assert_eq!(m.submitted_slot, env.svm.get_sysvar::<solana_clock::Clock>().slot);
    assert_eq!(m.status, MilestoneStatus::Submitted);
}

#[test]
fn submit_rejects_zero_delivery_hash() {
    let mut env = setup();
    let gig = assigned_gig(&mut env);
    let c = ctx_for(&mut env, gig, 0);
    create_with_spec(&mut env, &c, AMOUNT, [0u8; 32]).unwrap();
    fund(&mut env, &c, AMOUNT).unwrap();
    let freelancer = env.freelancer.pubkey();
    let r = freelancer_send(&mut env, ix_submit_delivery_with(&freelancer, &c.gig, &c.milestone, [0u8; 32], REPORT));
    assert_escrow_err(r, EscrowError::MissingDeliveryHash);
}

// ═══════════════════════════════ protocol fees ═══════════════════════════════

#[test]
fn fee_on_approve() {
    let mut env = setup_with_settings(with_fee(50)); // 0.5%
    let c = delivered(&mut env, AMOUNT);
    let ix = ix_approve_milestone(&release_accts(&env, &c));
    client_send(&mut env, ix).unwrap();

    assert_eq!(token_balance(&env.svm, &c.freelancer_token_account), 9_950_000);
    assert_eq!(token_balance(&env.svm, &treasury()), 50_000);
    let m = read_milestone(&env.svm, &c.milestone);
    assert_eq!((m.released, m.fees_paid, m.refunded), (9_950_000, 50_000, 0));
    assert_milestone_invariant(&env.svm, &c.milestone);
    verify_vault_invariant(&env.svm, &c.vault, &c.vault_token_account);
}

#[test]
fn fee_on_partial_then_full_timeout() {
    let mut env = setup_with_settings(with_fee(200)); // 2% (max)
    let c = delivered(&mut env, AMOUNT);

    warp_seconds(&mut env.svm, TEST_SETTINGS.partial_timeout);
    let ix = ix_partial_timeout_release(&timeout_accts(&env, &c));
    anyone_send(&mut env, ix).unwrap();
    // 20% gross = 2_000_000; 2% fee = 40_000.
    assert_eq!(token_balance(&env.svm, &c.freelancer_token_account), 1_960_000);
    assert_eq!(token_balance(&env.svm, &treasury()), 40_000);
    assert_milestone_invariant(&env.svm, &c.milestone);

    warp_seconds(&mut env.svm, TEST_SETTINGS.full_timeout - TEST_SETTINGS.partial_timeout);
    let ix = ix_full_timeout_release(&timeout_accts(&env, &c));
    anyone_send(&mut env, ix).unwrap();
    // Remaining 8_000_000 gross; 2% fee = 160_000.
    assert_eq!(token_balance(&env.svm, &c.freelancer_token_account), 1_960_000 + 7_840_000);
    assert_eq!(token_balance(&env.svm, &treasury()), 200_000);
    assert_eq!(token_balance(&env.svm, &c.vault_token_account), 0);
    let m = read_milestone(&env.svm, &c.milestone);
    assert_eq!(m.status, MilestoneStatus::Completed);
    assert_eq!(m.released + m.fees_paid, AMOUNT);
    assert_milestone_invariant(&env.svm, &c.milestone);
    verify_vault_invariant(&env.svm, &c.vault, &c.vault_token_account);
}

#[test]
fn fee_on_approve_after_partial() {
    let mut env = setup_with_settings(with_fee(100));
    let c = delivered(&mut env, AMOUNT);
    warp_seconds(&mut env.svm, TEST_SETTINGS.partial_timeout);
    let ix = ix_partial_timeout_release(&timeout_accts(&env, &c));
    anyone_send(&mut env, ix).unwrap();
    let ix = ix_approve_milestone(&release_accts(&env, &c));
    client_send(&mut env, ix).unwrap();
    assert_eq!(token_balance(&env.svm, &treasury()), 100_000); // 1% of everything
    assert_eq!(token_balance(&env.svm, &c.freelancer_token_account), 9_900_000);
    assert_milestone_invariant(&env.svm, &c.milestone);
}

#[test]
fn arithmetic_fee_rounds_down_and_never_exceeds_gross() {
    // 1_000_003 * 0.5% = 5_000.015 -> 5_000.
    let mut env = setup_with_settings(with_fee(50));
    let c = delivered(&mut env, 1_000_003);
    let ix = ix_approve_milestone(&release_accts(&env, &c));
    client_send(&mut env, ix).unwrap();
    assert_eq!(token_balance(&env.svm, &treasury()), 5_000);
    assert_eq!(token_balance(&env.svm, &c.freelancer_token_account), 995_003);
    assert_milestone_invariant(&env.svm, &c.milestone);
}

#[test]
fn fee_uses_snapshotted_rate() {
    let mut env = setup_with_settings(with_fee(0));
    let c = delivered(&mut env, AMOUNT);
    let admin = env.admin.insecure_clone();
    send(&mut env.svm, &env.payer, &[ix_update_protocol_config(&admin.pubkey(), &treasury(), with_fee(200))], &[&env.payer, &admin]).unwrap();
    let ix = ix_approve_milestone(&release_accts(&env, &c));
    client_send(&mut env, ix).unwrap();
    assert_eq!(token_balance(&env.svm, &treasury()), 0);
    assert_eq!(token_balance(&env.svm, &c.freelancer_token_account), AMOUNT);
}

#[test]
fn pda_release_rejects_wrong_treasury() {
    let mut env = setup_with_settings(with_fee(50));
    let c = delivered(&mut env, AMOUNT);
    let attacker = Keypair::new();
    let fake_treasury = create_token_account(&mut env.svm, &env.payer, &env.mint.pubkey(), &attacker.pubkey());

    let mut ix = ix_approve_milestone(&release_accts(&env, &c));
    for meta in ix.accounts.iter_mut() {
        if meta.pubkey == treasury() {
            meta.pubkey = fake_treasury;
        }
    }
    assert_escrow_err(client_send(&mut env, ix), EscrowError::InvalidTreasury);
}

#[test]
fn pda_rejects_forged_protocol_config() {
    let mut env = setup();
    let gig = assigned_gig(&mut env);
    let c = ctx_for(&mut env, gig, 0);
    let client = env.client.pubkey();
    let mut ix = ix_create_milestone_with_spec(&client, &c.gig, &c.milestone, AMOUNT, SPEC);
    let (config, _) = protocol_config_pda();
    let forged = Pubkey::new_unique();
    for meta in ix.accounts.iter_mut() {
        if meta.pubkey == config {
            meta.pubkey = forged;
        }
    }
    assert!(client_send(&mut env, ix).is_err(), "a config that isn't the PDA must be rejected");
}

// ═══════════════════════════════ refund_after_deadline ═══════════════════════════════

fn funded_undelivered(env: &mut Env) -> Ctx {
    let gig = assigned_gig(env);
    let c = ctx_for(env, gig, 0);
    create_with_spec(env, &c, AMOUNT, SPEC).unwrap();
    accept(env, &c, SPEC).unwrap();
    fund(env, &c, AMOUNT).unwrap();
    c
}

#[test]
fn refund_after_deadline_returns_everything_and_cancels_gig() {
    let mut env = setup_with_settings(with_fee(200));
    let c = funded_undelivered(&mut env);
    warp_seconds(&mut env.svm, until_refund_allowed());
    let ix = ix_refund_after_deadline(&refund_accts(&env, &c));
    client_send(&mut env, ix).unwrap();

    assert_eq!(token_balance(&env.svm, &c.client_token_account), AMOUNT);
    assert_eq!(token_balance(&env.svm, &treasury()), 0, "refunds carry no fee");
    let m = read_milestone(&env.svm, &c.milestone);
    assert_eq!(m.status, MilestoneStatus::Refunded);
    assert_eq!(m.refunded, AMOUNT);
    assert_eq!(read_gig(&env.svm, &c.gig).status, GigStatus::Cancelled);
    assert_milestone_invariant(&env.svm, &c.milestone);
    verify_vault_invariant(&env.svm, &c.vault, &c.vault_token_account);
}

#[test]
fn timing_refund_boundary_at_deadline_plus_grace() {
    let mut env = setup();
    let c = funded_undelivered(&mut env);
    warp_seconds(&mut env.svm, until_refund_allowed() - 1);
    let ix = ix_refund_after_deadline(&refund_accts(&env, &c));
    assert_escrow_err(client_send(&mut env, ix.clone()), EscrowError::GracePeriodActive);
    warp_seconds(&mut env.svm, 1);
    env.svm.expire_blockhash();
    client_send(&mut env, ix).unwrap();
}

#[test]
fn state_refund_rejected_after_delivery() {
    let mut env = setup();
    let c = delivered(&mut env, AMOUNT);
    warp_seconds(&mut env.svm, until_refund_allowed());
    let ix = ix_refund_after_deadline(&refund_accts(&env, &c));
    assert_escrow_err(client_send(&mut env, ix), EscrowError::InvalidStatus);
}

#[test]
fn state_refunded_milestone_cannot_be_delivered_or_refunded_again() {
    let mut env = setup();
    let c = funded_undelivered(&mut env);
    warp_seconds(&mut env.svm, until_refund_allowed());
    let ix = ix_refund_after_deadline(&refund_accts(&env, &c));
    client_send(&mut env, ix.clone()).unwrap();
    env.svm.expire_blockhash();
    assert_escrow_err(client_send(&mut env, ix), EscrowError::InvalidStatus);
    assert_escrow_err(submit(&mut env, &c), EscrowError::InvalidStatus);
}

#[test]
fn auth_refund_only_client() {
    let mut env = setup();
    let c = funded_undelivered(&mut env);
    warp_seconds(&mut env.svm, until_refund_allowed());
    let mut a = refund_accts(&env, &c);
    a.client = env.freelancer.pubkey();
    let r = freelancer_send(&mut env, ix_refund_after_deadline(&a));
    assert_escrow_err(r, EscrowError::Unauthorized);
}

#[test]
fn refund_of_one_milestone_after_another_was_paid_completes_gig() {
    let mut env = setup();
    let gig = assigned_gig(&mut env);
    // Milestone 0: delivered and approved.
    let c0 = ctx_for(&mut env, gig, 0);
    create_with_spec(&mut env, &c0, AMOUNT, [0u8; 32]).unwrap();
    // Milestone 1: funded, never delivered.
    let c1 = ctx_for(&mut env, gig, 1);
    create_with_spec(&mut env, &c1, AMOUNT, [0u8; 32]).unwrap();
    fund(&mut env, &c0, AMOUNT).unwrap();
    fund(&mut env, &c1, AMOUNT).unwrap();
    submit(&mut env, &c0).unwrap();
    let ix = ix_approve_milestone(&release_accts(&env, &c0));
    client_send(&mut env, ix).unwrap();
    assert_eq!(read_gig(&env.svm, &gig).status, GigStatus::InProgress, "milestone 1 is still open");

    warp_seconds(&mut env.svm, until_refund_allowed());
    let ix = ix_refund_after_deadline(&refund_accts(&env, &c1));
    client_send(&mut env, ix).unwrap();
    assert_eq!(read_gig(&env.svm, &gig).status, GigStatus::Completed);
    let v = read_vault(&env.svm, &c0.vault);
    assert_eq!((v.total_released, v.total_refunded, v.refunded_milestones), (AMOUNT, AMOUNT, 1));
    verify_vault_invariant(&env.svm, &c0.vault, &c0.vault_token_account);
}

#[test]
fn approve_last_milestone_after_refund_of_other_completes_gig() {
    let mut env = setup();
    let gig = assigned_gig(&mut env);
    let c0 = ctx_for(&mut env, gig, 0);
    create_with_spec(&mut env, &c0, AMOUNT, [0u8; 32]).unwrap();
    let c1 = ctx_for(&mut env, gig, 1);
    create_with_spec(&mut env, &c1, AMOUNT, [0u8; 32]).unwrap();
    fund(&mut env, &c0, AMOUNT).unwrap();
    fund(&mut env, &c1, AMOUNT).unwrap();
    submit(&mut env, &c0).unwrap();

    warp_seconds(&mut env.svm, until_refund_allowed());
    let ix = ix_refund_after_deadline(&refund_accts(&env, &c1));
    client_send(&mut env, ix).unwrap();
    assert_eq!(read_gig(&env.svm, &gig).status, GigStatus::InProgress);

    let ix = ix_approve_milestone(&release_accts(&env, &c0));
    client_send(&mut env, ix).unwrap();
    assert_eq!(read_gig(&env.svm, &gig).status, GigStatus::Completed);
}

// ═══════════════════════════════ reputation settlement ═══════════════════════════════

fn profile_of(env: &Env) -> Pubkey {
    reputation_profile_pda(&env.freelancer.pubkey()).0
}

fn settle(env: &mut Env, c: &Ctx) {
    let profile = profile_of(env);
    anyone_send(env, ix_settle_reputation(&c.gig, &c.vault, &profile)).unwrap();
}

#[test]
fn settle_counts_on_time_delivery() {
    let mut env = setup();
    let f = env.freelancer.insecure_clone();
    init_reputation_profile(&mut env, &f);
    let c = delivered(&mut env, AMOUNT);
    let ix = ix_approve_milestone(&release_accts(&env, &c));
    client_send(&mut env, ix).unwrap();
    settle(&mut env, &c);
    let p = read_reputation_profile(&env.svm, &profile_of(&env));
    assert_eq!((p.completed_jobs, p.successful_jobs, p.on_time_jobs), (1, 1, 1));
    assert_eq!((p.disputes_won, p.disputes_lost), (0, 0));
}

#[test]
fn settle_late_delivery_is_not_on_time() {
    let mut env = setup();
    let f = env.freelancer.insecure_clone();
    init_reputation_profile(&mut env, &f);
    let gig = assigned_gig(&mut env);
    let c = ctx_for(&mut env, gig, 0);
    create_with_spec(&mut env, &c, AMOUNT, [0u8; 32]).unwrap();
    fund(&mut env, &c, AMOUNT).unwrap();
    // Deliver one second after the gig deadline.
    warp_seconds(&mut env.svm, TEST_DEADLINE - 1_700_000_000 + 1);
    submit(&mut env, &c).unwrap();
    assert_eq!(read_vault(&env.svm, &c.vault).late_deliveries, 1);
    let ix = ix_approve_milestone(&release_accts(&env, &c));
    client_send(&mut env, ix).unwrap();
    settle(&mut env, &c);
    let p = read_reputation_profile(&env.svm, &profile_of(&env));
    assert_eq!((p.completed_jobs, p.successful_jobs, p.on_time_jobs), (1, 1, 0));
}

#[test]
fn timing_delivery_exactly_at_deadline_is_on_time() {
    let mut env = setup();
    let gig = assigned_gig(&mut env);
    let c = ctx_for(&mut env, gig, 0);
    create_with_spec(&mut env, &c, AMOUNT, [0u8; 32]).unwrap();
    fund(&mut env, &c, AMOUNT).unwrap();
    warp_seconds(&mut env.svm, TEST_DEADLINE - 1_700_000_000);
    submit(&mut env, &c).unwrap();
    assert_eq!(read_vault(&env.svm, &c.vault).late_deliveries, 0);
}

#[test]
fn settle_refunded_gig_counts_as_cancelled_and_not_on_time() {
    let mut env = setup();
    let f = env.freelancer.insecure_clone();
    init_reputation_profile(&mut env, &f);
    let c = funded_undelivered(&mut env);
    warp_seconds(&mut env.svm, until_refund_allowed());
    let ix = ix_refund_after_deadline(&refund_accts(&env, &c));
    client_send(&mut env, ix).unwrap();
    settle(&mut env, &c);
    let p = read_reputation_profile(&env.svm, &profile_of(&env));
    assert_eq!((p.completed_jobs, p.successful_jobs, p.cancelled_jobs, p.on_time_jobs), (1, 0, 1, 0));
    assert_eq!(p.total_earnings, 0);
}
