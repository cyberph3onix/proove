//! End-to-end mint against the real Metaplex Core program (dumped from
//! devnet into tests/fixtures/mpl_core.so): a claimed badge carries the
//! PermanentFreezeDelegate plugin with no authority, so it can never be
//! transferred.

mod common;

use common::*;
use mpl_core::instructions::TransferV1Builder;
use solana_keypair::Keypair;
use solana_pubkey::Pubkey;
use solana_signer::Signer;

const MPL_CORE_SO: &[u8] = include_bytes!("fixtures/mpl_core.so");

fn setup_with_core() -> Env {
    let mut env = setup();
    env.svm.add_program(mpl_core::ID, MPL_CORE_SO).unwrap();
    env
}

/// Real `init_collection` through the mpl-core CPI.
fn init_collection(env: &mut Env) -> (Pubkey, Pubkey) {
    let (config, _) = config_pda();
    let collection = Keypair::new();
    let payer = env.payer.insecure_clone();
    send(
        &mut env.svm,
        &payer,
        &[ix_init_collection(
            &payer.pubkey(),
            &config,
            &collection.pubkey(),
            &mpl_core::ID,
            "Proove Achievements".to_string(),
            "https://example.invalid/collection.json".to_string(),
            String::new(),
        )],
        &[&payer, &collection],
    )
    .unwrap();
    (config, collection.pubkey())
}

fn claim(env: &mut Env, config: Pubkey, collection: Pubkey) -> Pubkey {
    let user = env.user.insecure_clone();
    let profile = init_reputation_profile(env, &user);
    set_completed_jobs(env, &profile, 1);
    let badge = award_badge(env, &user.pubkey(), &profile, BadgeType::FirstGig);
    let asset = Keypair::new();
    let (achievement, _) = achievement_pda(&user.pubkey(), BadgeType::FirstGig);
    let payer = env.payer.insecure_clone();
    send(
        &mut env.svm,
        &payer,
        &[ix_claim_achievement(
            &ClaimAccounts {
                claimer: user.pubkey(),
                profile,
                badge,
                config,
                achievement,
                asset: asset.pubkey(),
                collection,
                mpl_core_program: mpl_core::ID,
            },
            BadgeType::FirstGig,
        )],
        &[&payer, &user, &asset],
    )
    .unwrap();
    asset.pubkey()
}

#[test]
fn claimed_badge_is_minted_to_the_claimer() {
    let mut env = setup_with_core();
    let (config, collection) = init_collection(&mut env);
    let asset = claim(&mut env, config, collection);

    let account = env.svm.get_account(&asset).expect("asset account exists");
    assert_eq!(account.owner, mpl_core::ID);
    // BaseAssetV1 layout: key (1 byte) then owner (32 bytes).
    assert_eq!(&account.data[1..33], env.user.pubkey().as_ref());
    let (achievement, _) = achievement_pda(&env.user.pubkey(), BadgeType::FirstGig);
    assert_eq!(read_achievement(&env.svm, &achievement).mint, asset);
}

#[test]
fn claimed_badge_cannot_be_transferred() {
    let mut env = setup_with_core();
    let (config, collection) = init_collection(&mut env);
    let asset = claim(&mut env, config, collection);

    let user = env.user.insecure_clone();
    let buyer = Keypair::new();
    let transfer = TransferV1Builder::new()
        .asset(asset)
        .collection(Some(collection))
        .payer(user.pubkey())
        .authority(Some(user.pubkey()))
        .new_owner(buyer.pubkey())
        .instruction();
    let r = send(&mut env.svm, &user, &[transfer], &[&user]);
    let err = r.expect_err("a frozen badge must not transfer");
    // mpl-core reports a plugin rejection as InvalidAuthority (0x9); see the control test below.
    assert!(err.contains("0x9"), "got: {err}");

    let account = env.svm.get_account(&asset).unwrap();
    assert_eq!(&account.data[1..33], user.pubkey().as_ref(), "owner is unchanged");
}

/// Control: the same transfer instruction succeeds on an unfrozen asset and
/// fails on one carrying the freeze plugin, so the rejection above comes
/// from the plugin and not from a malformed transfer.
#[test]
fn freeze_plugin_is_what_blocks_transfer() {
    use mpl_core::instructions::CreateV2Builder;
    use mpl_core::types::{DataState, PermanentFreezeDelegate, Plugin, PluginAuthority, PluginAuthorityPair};

    let mut env = setup_with_core();
    let user = env.user.insecure_clone();
    let mint = |env: &mut Env, frozen: bool| -> Pubkey {
        let asset = Keypair::new();
        let mut b = CreateV2Builder::new();
        b.asset(asset.pubkey())
            .payer(user.pubkey())
            .owner(Some(user.pubkey()))
            .data_state(DataState::AccountState)
            .name("control".to_string())
            .uri("https://example.invalid/a.json".to_string());
        if frozen {
            b.plugins(vec![PluginAuthorityPair {
                plugin: Plugin::PermanentFreezeDelegate(PermanentFreezeDelegate { frozen: true }),
                authority: Some(PluginAuthority::None),
            }]);
        }
        send(&mut env.svm, &user, &[b.instruction()], &[&user, &asset]).unwrap();
        asset.pubkey()
    };
    let transfer = |asset: Pubkey, to: Pubkey| {
        TransferV1Builder::new().asset(asset).payer(user.pubkey()).authority(Some(user.pubkey())).new_owner(to).instruction()
    };

    let plain = mint(&mut env, false);
    send(&mut env.svm, &user, &[transfer(plain, Pubkey::new_unique())], &[&user]).expect("unfrozen asset transfers");

    let frozen = mint(&mut env, true);
    let err = send(&mut env.svm, &user, &[transfer(frozen, Pubkey::new_unique())], &[&user]).unwrap_err();
    assert!(err.contains("0x9"), "plugin rejection surfaces as InvalidAuthority, got: {err}");
}
