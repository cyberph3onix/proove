# Security policy

Proove's Solana programs (`programs/gig`, `programs/escrow`, `programs/reputation`, `programs/achievement`) hold user funds in escrow, so we take reports seriously.

## Reporting a vulnerability

Report privately through GitHub's security advisories:
https://github.com/cyberph3onix/proove/security/advisories/new

Please don't open a public issue for anything exploitable. Include the program, the instruction, and steps or a test that reproduces the problem.

## Scope

- In scope: the on-chain programs and the services in `services/`.
- The programs are deployed only to devnet and have not yet had an external audit. Don't use them with real funds.

We aim to acknowledge reports within 72 hours. There is no bug bounty yet.
