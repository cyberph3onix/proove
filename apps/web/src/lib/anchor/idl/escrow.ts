/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/escrow.json`.
 */
export type Escrow = {
  "address": "ekeLPKaiGHb1vSVnCB7BjUeE4EZg5FyVCogMeTu5KQP",
  "metadata": {
    "name": "escrow",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Proove milestone escrow program"
  },
  "instructions": [
    {
      "name": "acceptTerms",
      "docs": [
        "Freelancer signs the milestone's committed spec hash before funding."
      ],
      "discriminator": [
        247,
        234,
        68,
        210,
        107,
        82,
        186,
        229
      ],
      "accounts": [
        {
          "name": "freelancer",
          "signer": true,
          "relations": [
            "gig"
          ]
        },
        {
          "name": "gig"
        },
        {
          "name": "milestone",
          "writable": true
        }
      ],
      "args": [
        {
          "name": "specHash",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        }
      ]
    },
    {
      "name": "approveMilestone",
      "docs": [
        "Client-approved release of the full remaining milestone balance."
      ],
      "discriminator": [
        145,
        85,
        92,
        60,
        50,
        130,
        219,
        106
      ],
      "accounts": [
        {
          "name": "client",
          "signer": true,
          "relations": [
            "gig"
          ]
        },
        {
          "name": "gig",
          "writable": true
        },
        {
          "name": "milestone",
          "writable": true
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "gig"
              }
            ]
          }
        },
        {
          "name": "vaultTokenAccount",
          "writable": true
        },
        {
          "name": "freelancer"
        },
        {
          "name": "freelancerTokenAccount",
          "writable": true
        },
        {
          "name": "mint",
          "relations": [
            "vault"
          ]
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  116,
                  111,
                  99,
                  111,
                  108,
                  95,
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "treasuryTokenAccount",
          "docs": [
            "Receives the protocol fee."
          ],
          "writable": true
        },
        {
          "name": "escrowAuthority",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  115,
                  99,
                  114,
                  111,
                  119,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "gigProgram",
          "address": "85SttowTEpVzdLhqsVy9YKVBX2DhuwnDicpNqaG38P37"
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": []
    },
    {
      "name": "cancelBeforeFunding",
      "docs": [
        "Cancels and closes a milestone that was never funded, cancelling the gig via CPI."
      ],
      "discriminator": [
        197,
        7,
        223,
        222,
        242,
        87,
        53,
        35
      ],
      "accounts": [
        {
          "name": "client",
          "writable": true,
          "signer": true,
          "relations": [
            "gig"
          ]
        },
        {
          "name": "gig",
          "writable": true
        },
        {
          "name": "milestone",
          "writable": true
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "gig"
              }
            ]
          }
        },
        {
          "name": "escrowAuthority",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  115,
                  99,
                  114,
                  111,
                  119,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "gigProgram",
          "address": "85SttowTEpVzdLhqsVy9YKVBX2DhuwnDicpNqaG38P37"
        }
      ],
      "args": []
    },
    {
      "name": "createMilestone",
      "docs": [
        "Creates the next milestone for a gig, awaiting funding."
      ],
      "discriminator": [
        239,
        58,
        201,
        28,
        40,
        186,
        173,
        48
      ],
      "accounts": [
        {
          "name": "client",
          "writable": true,
          "signer": true,
          "relations": [
            "gig"
          ]
        },
        {
          "name": "gig",
          "docs": [
            "Ownership (Gig program), PDA derivation, and freshness are all checked by",
            "the `seeds`/`seeds::program` constraint below, which re-derives the Gig",
            "PDA from its own `id`/`bump` and rejects any account that doesn't match."
          ],
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  105,
                  103
                ]
              },
              {
                "kind": "account",
                "path": "gig.client",
                "account": "gig"
              },
              {
                "kind": "account",
                "path": "gig.id",
                "account": "gig"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                105,
                37,
                105,
                52,
                245,
                118,
                177,
                157,
                27,
                243,
                123,
                49,
                99,
                75,
                81,
                26,
                56,
                37,
                79,
                246,
                10,
                219,
                100,
                73,
                36,
                35,
                15,
                116,
                131,
                90,
                44,
                106
              ]
            }
          }
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "gig"
              }
            ]
          }
        },
        {
          "name": "milestone",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  105,
                  108,
                  101,
                  115,
                  116,
                  111,
                  110,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "gig"
              },
              {
                "kind": "account",
                "path": "vault.milestoneCount",
                "account": "escrowVault"
              }
            ]
          }
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  116,
                  111,
                  99,
                  111,
                  108,
                  95,
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        },
        {
          "name": "specHash",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        }
      ]
    },
    {
      "name": "fullTimeoutRelease",
      "docs": [
        "Permissionless release of the remaining balance after `full_timeout` of client inaction."
      ],
      "discriminator": [
        54,
        135,
        127,
        22,
        185,
        202,
        72,
        229
      ],
      "accounts": [
        {
          "name": "gig",
          "writable": true
        },
        {
          "name": "milestone",
          "writable": true
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "gig"
              }
            ]
          }
        },
        {
          "name": "vaultTokenAccount",
          "writable": true
        },
        {
          "name": "freelancerTokenAccount",
          "writable": true
        },
        {
          "name": "mint",
          "relations": [
            "vault"
          ]
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  116,
                  111,
                  99,
                  111,
                  108,
                  95,
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "treasuryTokenAccount",
          "docs": [
            "Receives the protocol fee."
          ],
          "writable": true
        },
        {
          "name": "escrowAuthority",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  115,
                  99,
                  114,
                  111,
                  119,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "gigProgram",
          "address": "85SttowTEpVzdLhqsVy9YKVBX2DhuwnDicpNqaG38P37"
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": []
    },
    {
      "name": "fundMilestone",
      "docs": [
        "Funds a milestone by transferring USDC from the client into the escrow vault.",
        "On the gig's first funding, CPIs into the gig program to move it InProgress."
      ],
      "discriminator": [
        104,
        130,
        72,
        76,
        84,
        58,
        37,
        181
      ],
      "accounts": [
        {
          "name": "client",
          "writable": true,
          "signer": true,
          "relations": [
            "gig"
          ]
        },
        {
          "name": "gig",
          "writable": true
        },
        {
          "name": "milestone",
          "writable": true
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "gig"
              }
            ]
          }
        },
        {
          "name": "vaultTokenAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "gig"
              },
              {
                "kind": "const",
                "value": [
                  116,
                  111,
                  107,
                  101,
                  110
                ]
              }
            ]
          }
        },
        {
          "name": "clientTokenAccount",
          "writable": true
        },
        {
          "name": "mint",
          "relations": [
            "gig"
          ]
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  116,
                  111,
                  99,
                  111,
                  108,
                  95,
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "escrowAuthority",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  115,
                  99,
                  114,
                  111,
                  119,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "gigProgram",
          "address": "85SttowTEpVzdLhqsVy9YKVBX2DhuwnDicpNqaG38P37"
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "initProtocolConfig",
      "docs": [
        "One-time setup of the protocol config (first caller becomes admin)."
      ],
      "discriminator": [
        91,
        97,
        211,
        137,
        96,
        222,
        139,
        40
      ],
      "accounts": [
        {
          "name": "admin",
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  116,
                  111,
                  99,
                  111,
                  108,
                  95,
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "treasury",
          "docs": [
            "USDC token account that receives protocol fees."
          ]
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "settings",
          "type": {
            "defined": {
              "name": "protocolSettings"
            }
          }
        }
      ]
    },
    {
      "name": "partialTimeoutRelease",
      "docs": [
        "Permissionless partial release (`partial_bps`) after `partial_timeout` of client inaction."
      ],
      "discriminator": [
        249,
        67,
        214,
        14,
        89,
        253,
        246,
        4
      ],
      "accounts": [
        {
          "name": "gig"
        },
        {
          "name": "milestone",
          "writable": true
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "gig"
              }
            ]
          }
        },
        {
          "name": "vaultTokenAccount",
          "writable": true
        },
        {
          "name": "freelancerTokenAccount",
          "writable": true
        },
        {
          "name": "mint",
          "relations": [
            "vault"
          ]
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  116,
                  111,
                  99,
                  111,
                  108,
                  95,
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "treasuryTokenAccount",
          "docs": [
            "Receives the protocol fee."
          ],
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": []
    },
    {
      "name": "rateFreelancer",
      "docs": [
        "Client submits the final 1-5 rating for a completed gig, CPI-attested by escrow."
      ],
      "discriminator": [
        42,
        126,
        71,
        214,
        207,
        110,
        63,
        59
      ],
      "accounts": [
        {
          "name": "client",
          "writable": true,
          "signer": true,
          "relations": [
            "gig"
          ]
        },
        {
          "name": "gig"
        },
        {
          "name": "vault",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "gig"
              }
            ]
          }
        },
        {
          "name": "freelancer"
        },
        {
          "name": "freelancerProfile",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  102,
                  105,
                  108,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "freelancer"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                66,
                73,
                176,
                95,
                1,
                251,
                147,
                244,
                206,
                41,
                170,
                149,
                47,
                0,
                31,
                138,
                227,
                240,
                20,
                41,
                42,
                16,
                54,
                34,
                235,
                132,
                102,
                226,
                5,
                218,
                72,
                27
              ]
            }
          }
        },
        {
          "name": "rating",
          "writable": true
        },
        {
          "name": "escrowAuthority",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  115,
                  99,
                  114,
                  111,
                  119,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "reputationProgram",
          "address": "5Tm5aXm3NRzX6fJL3R7NeRbjhZjxTUfJ4nTLurPxdPc6"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "score",
          "type": "u8"
        },
        {
          "name": "reviewHash",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        }
      ]
    },
    {
      "name": "refundAfterDeadline",
      "docs": [
        "Client reclaims a funded milestone with no delivery after deadline + grace."
      ],
      "discriminator": [
        175,
        189,
        26,
        90,
        209,
        113,
        41,
        159
      ],
      "accounts": [
        {
          "name": "client",
          "signer": true,
          "relations": [
            "gig"
          ]
        },
        {
          "name": "gig",
          "writable": true
        },
        {
          "name": "milestone",
          "writable": true
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "gig"
              }
            ]
          }
        },
        {
          "name": "vaultTokenAccount",
          "writable": true
        },
        {
          "name": "clientTokenAccount",
          "writable": true
        },
        {
          "name": "mint",
          "relations": [
            "gig",
            "vault"
          ]
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  116,
                  111,
                  99,
                  111,
                  108,
                  95,
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "escrowAuthority",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  115,
                  99,
                  114,
                  111,
                  119,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "gigProgram",
          "address": "85SttowTEpVzdLhqsVy9YKVBX2DhuwnDicpNqaG38P37"
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": []
    },
    {
      "name": "setProtocolAdmin",
      "docs": [
        "Admin hands the config to a new admin (the DAO in Phase 2)."
      ],
      "discriminator": [
        48,
        249,
        109,
        189,
        157,
        197,
        31,
        183
      ],
      "accounts": [
        {
          "name": "admin",
          "signer": true,
          "relations": [
            "config"
          ]
        },
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  116,
                  111,
                  99,
                  111,
                  108,
                  95,
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "newAdmin",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "settleReputation",
      "docs": [
        "Permissionlessly notifies the Reputation Program once a gig's vault is",
        "fully released. Callable exactly once per gig."
      ],
      "discriminator": [
        102,
        49,
        59,
        20,
        44,
        124,
        68,
        241
      ],
      "accounts": [
        {
          "name": "gig"
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "gig"
              }
            ]
          }
        },
        {
          "name": "escrowAuthority",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  115,
                  99,
                  114,
                  111,
                  119,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "freelancerProfile",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  102,
                  105,
                  108,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "gig.freelancer",
                "account": "gig"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                66,
                73,
                176,
                95,
                1,
                251,
                147,
                244,
                206,
                41,
                170,
                149,
                47,
                0,
                31,
                138,
                227,
                240,
                20,
                41,
                42,
                16,
                54,
                34,
                235,
                132,
                102,
                226,
                5,
                218,
                72,
                27
              ]
            }
          }
        },
        {
          "name": "reputationProgram",
          "address": "5Tm5aXm3NRzX6fJL3R7NeRbjhZjxTUfJ4nTLurPxdPc6"
        }
      ],
      "args": []
    },
    {
      "name": "submitDelivery",
      "docs": [
        "Records the freelancer's delivery submission."
      ],
      "discriminator": [
        217,
        177,
        33,
        54,
        136,
        185,
        123,
        96
      ],
      "accounts": [
        {
          "name": "freelancer",
          "signer": true,
          "relations": [
            "gig"
          ]
        },
        {
          "name": "gig"
        },
        {
          "name": "milestone",
          "writable": true
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "gig"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "deliveryHash",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        },
        {
          "name": "reportHash",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        }
      ]
    },
    {
      "name": "updateProtocolConfig",
      "docs": [
        "Admin updates protocol settings; every value is range-checked."
      ],
      "discriminator": [
        197,
        97,
        123,
        54,
        221,
        168,
        11,
        135
      ],
      "accounts": [
        {
          "name": "admin",
          "signer": true,
          "relations": [
            "config"
          ]
        },
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  116,
                  111,
                  99,
                  111,
                  108,
                  95,
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "treasury",
          "docs": [
            "Fee destination; pass the current one to keep it."
          ]
        }
      ],
      "args": [
        {
          "name": "settings",
          "type": {
            "defined": {
              "name": "protocolSettings"
            }
          }
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "escrowVault",
      "discriminator": [
        54,
        84,
        41,
        149,
        160,
        181,
        85,
        114
      ]
    },
    {
      "name": "milestone",
      "discriminator": [
        38,
        210,
        239,
        177,
        85,
        184,
        10,
        44
      ]
    },
    {
      "name": "protocolConfig",
      "discriminator": [
        207,
        91,
        250,
        28,
        152,
        179,
        215,
        209
      ]
    }
  ],
  "events": [
    {
      "name": "deliverySubmitted",
      "discriminator": [
        104,
        47,
        131,
        41,
        20,
        153,
        87,
        75
      ]
    },
    {
      "name": "fullReleaseExecuted",
      "discriminator": [
        228,
        199,
        238,
        189,
        216,
        221,
        175,
        99
      ]
    },
    {
      "name": "milestoneApproved",
      "discriminator": [
        40,
        109,
        159,
        144,
        169,
        230,
        35,
        229
      ]
    },
    {
      "name": "milestoneCancelledBeforeFunding",
      "discriminator": [
        76,
        11,
        61,
        236,
        69,
        44,
        164,
        218
      ]
    },
    {
      "name": "milestoneCreated",
      "discriminator": [
        151,
        154,
        159,
        254,
        50,
        174,
        22,
        209
      ]
    },
    {
      "name": "milestoneFunded",
      "discriminator": [
        133,
        223,
        85,
        235,
        56,
        36,
        238,
        240
      ]
    },
    {
      "name": "partialReleaseExecuted",
      "discriminator": [
        236,
        218,
        132,
        125,
        188,
        66,
        191,
        157
      ]
    },
    {
      "name": "protocolConfigUpdated",
      "discriminator": [
        20,
        99,
        32,
        237,
        111,
        86,
        195,
        199
      ]
    },
    {
      "name": "protocolFeeCollected",
      "discriminator": [
        149,
        0,
        167,
        154,
        105,
        146,
        209,
        134
      ]
    },
    {
      "name": "refundedAfterDeadline",
      "discriminator": [
        167,
        167,
        230,
        97,
        229,
        51,
        39,
        91
      ]
    },
    {
      "name": "termsAccepted",
      "discriminator": [
        186,
        49,
        0,
        112,
        165,
        155,
        138,
        79
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "unauthorized",
      "msg": "Signer is not authorized to perform this action"
    },
    {
      "code": 6001,
      "name": "invalidStatus",
      "msg": "Account is not in the required status for this action"
    },
    {
      "code": 6002,
      "name": "alreadyFunded",
      "msg": "Milestone has already been funded"
    },
    {
      "code": 6003,
      "name": "insufficientFunds",
      "msg": "Vault does not hold sufficient funds"
    },
    {
      "code": 6004,
      "name": "invalidMint",
      "msg": "Token mint does not match the expected mint"
    },
    {
      "code": 6005,
      "name": "milestoneAlreadySubmitted",
      "msg": "Milestone has already been submitted"
    },
    {
      "code": 6006,
      "name": "timeoutNotReached",
      "msg": "Timeout window has not yet elapsed"
    },
    {
      "code": 6007,
      "name": "overflow",
      "msg": "Arithmetic overflow"
    },
    {
      "code": 6008,
      "name": "mathError",
      "msg": "Arithmetic error"
    },
    {
      "code": 6009,
      "name": "invalidAmount",
      "msg": "Milestone amount must be greater than zero"
    },
    {
      "code": 6010,
      "name": "gigNotFundable",
      "msg": "Gig must be in Assigned or InProgress status to create/fund a milestone"
    },
    {
      "code": 6011,
      "name": "amountBelowMinimum",
      "msg": "Milestone amount is below the protocol minimum"
    },
    {
      "code": 6012,
      "name": "specHashMismatch",
      "msg": "The spec hash does not match the milestone's committed spec"
    },
    {
      "code": 6013,
      "name": "termsNotAccepted",
      "msg": "The freelancer has not accepted this milestone's terms yet"
    },
    {
      "code": 6014,
      "name": "noFreelancer",
      "msg": "The gig has no assigned freelancer"
    },
    {
      "code": 6015,
      "name": "outOfRange",
      "msg": "A protocol setting is outside its allowed range"
    },
    {
      "code": 6016,
      "name": "gracePeriodActive",
      "msg": "The no-delivery grace period has not passed yet"
    },
    {
      "code": 6017,
      "name": "invalidTreasury",
      "msg": "Treasury token account does not match the protocol config"
    },
    {
      "code": 6018,
      "name": "missingDeliveryHash",
      "msg": "A delivery hash is required"
    }
  ],
  "types": [
    {
      "name": "deliverySubmitted",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "gig",
            "type": "pubkey"
          },
          {
            "name": "milestone",
            "type": "pubkey"
          },
          {
            "name": "submittedAt",
            "type": "i64"
          },
          {
            "name": "submittedSlot",
            "type": "u64"
          },
          {
            "name": "deliveryHash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "reportHash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          }
        ]
      }
    },
    {
      "name": "escrowVault",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "gig",
            "type": "pubkey"
          },
          {
            "name": "tokenAccount",
            "type": "pubkey"
          },
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "totalLocked",
            "type": "u64"
          },
          {
            "name": "totalReleased",
            "type": "u64"
          },
          {
            "name": "milestoneCount",
            "docs": [
              "Milestones created for this gig. Escrow-owned: this is payment-lifecycle",
              "bookkeeping, not gig metadata, so it lives here rather than on the Gig account."
            ],
            "type": "u32"
          },
          {
            "name": "activeMilestone",
            "docs": [
              "Milestones fully released so far."
            ],
            "type": "u32"
          },
          {
            "name": "cancelledMilestones",
            "docs": [
              "Milestones closed via `cancel_before_funding`. Counted separately rather",
              "than decremented from `milestone_count`, because `milestone_count` also",
              "allocates the next milestone's PDA index and must stay monotonic.",
              "Settlement is reached when `active_milestone + cancelled_milestones`",
              "covers every milestone ever created."
            ],
            "type": "u32"
          },
          {
            "name": "reputationSynced",
            "docs": [
              "Set once `settle_reputation` has notified the Reputation Program of this",
              "gig's completion, so the CPI (and its earnings credit) can never fire twice."
            ],
            "type": "bool"
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "totalFees",
            "docs": [
              "Protocol fees sent to the treasury across this gig's milestones."
            ],
            "type": "u64"
          },
          {
            "name": "totalRefunded",
            "docs": [
              "Amount returned to the client across this gig's milestones."
            ],
            "type": "u64"
          },
          {
            "name": "refundedMilestones",
            "docs": [
              "Milestones closed via `refund_after_deadline`; they count as accounted",
              "for in settlement, like cancelled ones."
            ],
            "type": "u32"
          },
          {
            "name": "lateDeliveries",
            "docs": [
              "Deliveries submitted after the gig deadline; any late delivery makes",
              "the job count as not on time in reputation."
            ],
            "type": "u32"
          }
        ]
      }
    },
    {
      "name": "fullReleaseExecuted",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "gig",
            "type": "pubkey"
          },
          {
            "name": "milestone",
            "type": "pubkey"
          },
          {
            "name": "amountReleased",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "gig",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "id",
            "type": "u64"
          },
          {
            "name": "client",
            "type": "pubkey"
          },
          {
            "name": "freelancer",
            "type": "pubkey"
          },
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "status",
            "type": {
              "defined": {
                "name": "gigStatus"
              }
            }
          },
          {
            "name": "createdAt",
            "type": "i64"
          },
          {
            "name": "updatedAt",
            "type": "i64"
          },
          {
            "name": "title",
            "type": "string"
          },
          {
            "name": "description",
            "type": "string"
          },
          {
            "name": "skills",
            "type": "string"
          },
          {
            "name": "category",
            "type": "string"
          },
          {
            "name": "budget",
            "type": "u64"
          },
          {
            "name": "deadline",
            "type": "i64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "gigStatus",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "draft"
          },
          {
            "name": "published"
          },
          {
            "name": "assigned"
          },
          {
            "name": "inProgress"
          },
          {
            "name": "completed"
          },
          {
            "name": "cancelled"
          },
          {
            "name": "archived"
          },
          {
            "name": "disputed"
          }
        ]
      }
    },
    {
      "name": "milestone",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "gig",
            "type": "pubkey"
          },
          {
            "name": "index",
            "type": "u32"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "released",
            "docs": [
              "Net amount paid out to the freelancer (after protocol fees)."
            ],
            "type": "u64"
          },
          {
            "name": "status",
            "type": {
              "defined": {
                "name": "milestoneStatus"
              }
            }
          },
          {
            "name": "submittedAt",
            "type": "i64"
          },
          {
            "name": "approvedAt",
            "type": "i64"
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "specHash",
            "docs": [
              "SHA-256 of the RFC 8785 canonical milestone spec; zero = no spec."
            ],
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "deliveryHash",
            "docs": [
              "SHA-256 of the canonical delivery manifest."
            ],
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "reportHash",
            "docs": [
              "SHA-256 of the canonical verification report; zero = none."
            ],
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "termsAccepted",
            "docs": [
              "Freelancer signed `accept_terms` against `spec_hash`."
            ],
            "type": "bool"
          },
          {
            "name": "submittedSlot",
            "docs": [
              "Slot of `submit_delivery`; the sample audit seeds from `submitted_slot + 2`."
            ],
            "type": "u64"
          },
          {
            "name": "fundedAt",
            "type": "i64"
          },
          {
            "name": "partialTimeout",
            "type": "i64"
          },
          {
            "name": "fullTimeout",
            "type": "i64"
          },
          {
            "name": "partialBps",
            "type": "u16"
          },
          {
            "name": "feeBps",
            "type": "u16"
          },
          {
            "name": "feesPaid",
            "type": "u64"
          },
          {
            "name": "refunded",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "milestoneApproved",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "gig",
            "type": "pubkey"
          },
          {
            "name": "milestone",
            "type": "pubkey"
          },
          {
            "name": "amountReleased",
            "type": "u64"
          },
          {
            "name": "approvedAt",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "milestoneCancelledBeforeFunding",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "gig",
            "type": "pubkey"
          },
          {
            "name": "milestone",
            "type": "pubkey"
          },
          {
            "name": "index",
            "type": "u32"
          }
        ]
      }
    },
    {
      "name": "milestoneCreated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "gig",
            "type": "pubkey"
          },
          {
            "name": "milestone",
            "type": "pubkey"
          },
          {
            "name": "index",
            "type": "u32"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "specHash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          }
        ]
      }
    },
    {
      "name": "milestoneFunded",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "gig",
            "type": "pubkey"
          },
          {
            "name": "milestone",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "milestoneStatus",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "pendingFunding"
          },
          {
            "name": "funded"
          },
          {
            "name": "submitted"
          },
          {
            "name": "partialReleased"
          },
          {
            "name": "completed"
          },
          {
            "name": "refunded"
          },
          {
            "name": "disputed"
          },
          {
            "name": "resolved"
          }
        ]
      }
    },
    {
      "name": "partialReleaseExecuted",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "gig",
            "type": "pubkey"
          },
          {
            "name": "milestone",
            "type": "pubkey"
          },
          {
            "name": "amountReleased",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "protocolConfig",
      "docs": [
        "Singleton protocol settings, owned by escrow. The admin is an",
        "upgrade-authority-held key in Phase 1; Phase 2 hands it to the DAO.",
        "Milestones snapshot the timeout/bps terms when they are funded, so a",
        "change only affects milestones funded afterwards."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "admin",
            "type": "pubkey"
          },
          {
            "name": "treasury",
            "docs": [
              "USDC token account that receives protocol fees."
            ],
            "type": "pubkey"
          },
          {
            "name": "partialTimeout",
            "type": "i64"
          },
          {
            "name": "fullTimeout",
            "type": "i64"
          },
          {
            "name": "partialBps",
            "type": "u16"
          },
          {
            "name": "feeBps",
            "type": "u16"
          },
          {
            "name": "minMilestone",
            "type": "u64"
          },
          {
            "name": "noDeliveryGrace",
            "type": "i64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "protocolConfigUpdated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "admin",
            "type": "pubkey"
          },
          {
            "name": "treasury",
            "type": "pubkey"
          },
          {
            "name": "partialTimeout",
            "type": "i64"
          },
          {
            "name": "fullTimeout",
            "type": "i64"
          },
          {
            "name": "partialBps",
            "type": "u16"
          },
          {
            "name": "feeBps",
            "type": "u16"
          },
          {
            "name": "minMilestone",
            "type": "u64"
          },
          {
            "name": "noDeliveryGrace",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "protocolFeeCollected",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "gig",
            "type": "pubkey"
          },
          {
            "name": "milestone",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "protocolSettings",
      "docs": [
        "Settings passed to `init_protocol_config` / `update_protocol_config`."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "partialTimeout",
            "type": "i64"
          },
          {
            "name": "fullTimeout",
            "type": "i64"
          },
          {
            "name": "partialBps",
            "type": "u16"
          },
          {
            "name": "feeBps",
            "type": "u16"
          },
          {
            "name": "minMilestone",
            "type": "u64"
          },
          {
            "name": "noDeliveryGrace",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "refundedAfterDeadline",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "gig",
            "type": "pubkey"
          },
          {
            "name": "milestone",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "termsAccepted",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "gig",
            "type": "pubkey"
          },
          {
            "name": "milestone",
            "type": "pubkey"
          },
          {
            "name": "freelancer",
            "type": "pubkey"
          },
          {
            "name": "specHash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          }
        ]
      }
    },
    {
      "name": "userProfile",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "authority",
            "type": "pubkey"
          },
          {
            "name": "completedJobs",
            "type": "u64"
          },
          {
            "name": "successfulJobs",
            "type": "u64"
          },
          {
            "name": "cancelledJobs",
            "type": "u64"
          },
          {
            "name": "totalEarnings",
            "type": "u64"
          },
          {
            "name": "ratingSum",
            "docs": [
              "Sum of all submitted ratings, kept alongside `rating_count` so the",
              "average can be recomputed exactly instead of drifting through",
              "repeated incremental updates."
            ],
            "type": "u64"
          },
          {
            "name": "ratingCount",
            "type": "u64"
          },
          {
            "name": "averageRating",
            "docs": [
              "Average rating scaled by `RATING_SCALE` (e.g. 450 == 4.50 stars)."
            ],
            "type": "u32"
          },
          {
            "name": "reputationScore",
            "type": "u64"
          },
          {
            "name": "badgesEarned",
            "type": "u32"
          },
          {
            "name": "createdAt",
            "type": "i64"
          },
          {
            "name": "updatedAt",
            "type": "i64"
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "onTimeJobs",
            "docs": [
              "Jobs where every delivery landed on or before the gig deadline."
            ],
            "type": "u64"
          },
          {
            "name": "disputesWon",
            "docs": [
              "Disputed jobs whose ruling gave the freelancer at least half."
            ],
            "type": "u64"
          },
          {
            "name": "disputesLost",
            "type": "u64"
          }
        ]
      }
    }
  ],
  "constants": [
    {
      "name": "escrowAuthoritySeed",
      "docs": [
        "Seed for escrow's CPI-signer PDA, used to authorize calls into the gig program."
      ],
      "type": "bytes",
      "value": "[101, 115, 99, 114, 111, 119, 95, 97, 117, 116, 104, 111, 114, 105, 116, 121]"
    },
    {
      "name": "milestoneSeed",
      "type": "bytes",
      "value": "[109, 105, 108, 101, 115, 116, 111, 110, 101]"
    },
    {
      "name": "protocolConfigSeed",
      "docs": [
        "Seed for the singleton `ProtocolConfig` PDA."
      ],
      "type": "bytes",
      "value": "[112, 114, 111, 116, 111, 99, 111, 108, 95, 99, 111, 110, 102, 105, 103]"
    },
    {
      "name": "vaultSeed",
      "type": "bytes",
      "value": "[118, 97, 117, 108, 116]"
    }
  ]
};
