use anchor_lang::prelude::*;

use anchor_spl::token::{self, TransferChecked};

use crate::constants::*;
use crate::errors::EscrowError;
use crate::state::ProtocolSettings;

/// Computes `amount * percent / 100` using checked arithmetic.
pub fn percent_of(amount: u64, percent: u64) -> Result<u64> {
    (amount as u128)
        .checked_mul(percent as u128)
        .and_then(|v| v.checked_div(100))
        .and_then(|v| u64::try_from(v).ok())
        .ok_or_else(|| error!(EscrowError::MathError))
}

pub fn checked_add(a: u64, b: u64) -> Result<u64> {
    a.checked_add(b).ok_or_else(|| error!(EscrowError::Overflow))
}

pub fn checked_sub(a: u64, b: u64) -> Result<u64> {
    a.checked_sub(b).ok_or_else(|| error!(EscrowError::MathError))
}

/// `amount * bps / 10_000`, rounded down.
pub fn bps_of(amount: u64, bps: u16) -> Result<u64> {
    (amount as u128)
        .checked_mul(bps as u128)
        .and_then(|v| v.checked_div(BPS_DENOMINATOR as u128))
        .and_then(|v| u64::try_from(v).ok())
        .ok_or_else(|| error!(EscrowError::MathError))
}

/// Splits a gross release into (net to the payee, protocol fee).
pub fn split_fee(gross: u64, fee_bps: u16) -> Result<(u64, u64)> {
    let fee = bps_of(gross, fee_bps)?;
    Ok((checked_sub(gross, fee)?, fee))
}

fn in_range<T: PartialOrd>(v: T, (lo, hi): (T, T)) -> bool {
    v >= lo && v <= hi
}

/// Every `ProtocolConfig` value must sit inside its range, and the full
/// release can't come before the partial one.
pub fn validate_settings(s: &ProtocolSettings) -> Result<()> {
    require!(
        in_range(s.partial_timeout, PARTIAL_TIMEOUT_RANGE)
            && in_range(s.full_timeout, FULL_TIMEOUT_RANGE)
            && in_range(s.partial_bps, PARTIAL_BPS_RANGE)
            && in_range(s.fee_bps, FEE_BPS_RANGE)
            && in_range(s.min_milestone, MIN_MILESTONE_RANGE)
            && in_range(s.no_delivery_grace, NO_DELIVERY_GRACE_RANGE)
            && s.full_timeout >= s.partial_timeout,
        EscrowError::OutOfRange
    );
    Ok(())
}

/// Moves `amount` out of the gig vault, signed by the vault PDA. No-op for 0.
#[allow(clippy::too_many_arguments)]
pub fn vault_transfer<'info>(
    token_program: &AccountInfo<'info>,
    vault_token_account: &AccountInfo<'info>,
    mint: &AccountInfo<'info>,
    to: &AccountInfo<'info>,
    vault: &AccountInfo<'info>,
    gig_key: &Pubkey,
    vault_bump: u8,
    amount: u64,
    decimals: u8,
) -> Result<()> {
    if amount == 0 {
        return Ok(());
    }
    let signer_seeds: &[&[&[u8]]] = &[&[VAULT_SEED, gig_key.as_ref(), &[vault_bump]]];
    token::transfer_checked(
        CpiContext::new_with_signer(
            token_program.key(),
            TransferChecked {
                from: vault_token_account.clone(),
                mint: mint.clone(),
                to: to.clone(),
                authority: vault.clone(),
            },
            signer_seeds,
        ),
        amount,
        decimals,
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn checked_add_overflows() {
        assert!(checked_add(u64::MAX, 1).is_err());
    }

    #[test]
    fn checked_sub_underflows() {
        assert!(checked_sub(0, 1).is_err());
    }

    #[test]
    fn percent_of_computes_split() {
        assert_eq!(percent_of(1_000_000, 20).unwrap(), 200_000);
        assert_eq!(percent_of(1_000_000, 80).unwrap(), 800_000);
    }

    #[test]
    fn bps_and_fee_split() {
        assert_eq!(bps_of(1_000_000, 2_000).unwrap(), 200_000);
        assert_eq!(split_fee(1_000_000, 50).unwrap(), (995_000, 5_000));
        assert_eq!(split_fee(199, 50).unwrap(), (199, 0)); // fee rounds down
        assert_eq!(split_fee(u64::MAX, 200).unwrap().1, bps_of(u64::MAX, 200).unwrap());
    }

    fn defaults() -> ProtocolSettings {
        ProtocolSettings {
            partial_timeout: PARTIAL_TIMEOUT,
            full_timeout: FULL_TIMEOUT,
            partial_bps: DEFAULT_PARTIAL_BPS,
            fee_bps: DEFAULT_FEE_BPS,
            min_milestone: DEFAULT_MIN_MILESTONE,
            no_delivery_grace: DEFAULT_NO_DELIVERY_GRACE,
        }
    }

    #[test]
    fn settings_ranges() {
        assert!(validate_settings(&defaults()).is_ok());
        let bad = [
            ProtocolSettings { partial_timeout: SECONDS_PER_DAY - 1, ..defaults() },
            ProtocolSettings { full_timeout: 14 * SECONDS_PER_DAY + 1, ..defaults() },
            ProtocolSettings { partial_bps: 5_001, ..defaults() },
            ProtocolSettings { fee_bps: 201, ..defaults() },
            ProtocolSettings { min_milestone: USDC - 1, ..defaults() },
            ProtocolSettings { min_milestone: 100 * USDC + 1, ..defaults() },
            ProtocolSettings { no_delivery_grace: 0, ..defaults() },
            ProtocolSettings { partial_timeout: 5 * SECONDS_PER_DAY, full_timeout: 4 * SECONDS_PER_DAY, ..defaults() },
        ];
        for s in bad {
            assert!(validate_settings(&s).is_err(), "{s:?} should be rejected");
        }
        // Range edges are inclusive.
        let edge = ProtocolSettings { partial_bps: 5_000, fee_bps: 200, min_milestone: USDC, ..defaults() };
        assert!(validate_settings(&edge).is_ok());
    }

    #[test]
    fn percent_of_does_not_overflow_on_max_amount() {
        assert!(percent_of(u64::MAX, 20).is_ok());
    }
}
