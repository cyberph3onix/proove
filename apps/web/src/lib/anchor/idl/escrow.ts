/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/escrow.json`.
 */
export type Escrow = {
  "address": "7cvNPW6wKmQLVaygQi1cwrSHz1GNLtzQsurENYyfAkd4",
  "metadata": {
    "name": "escrow",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "PayGig milestone escrow program"
  },
  "instructions": [
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
          "address": "ALa1EKfsHHMefH139SYuSNxd2XbUPj9EN3xRTbPHQNwA"
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
          "address": "ALa1EKfsHHMefH139SYuSNxd2XbUPj9EN3xRTbPHQNwA"
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
                138,
                188,
                137,
                16,
                99,
                11,
                27,
                215,
                184,
                253,
                198,
                73,
                162,
                239,
                8,
                26,
                161,
                238,
                101,
                151,
                242,
                194,
                220,
                219,
                190,
                222,
                104,
                75,
                207,
                217,
                154,
                17
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
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "fullTimeoutRelease",
      "docs": [
        "Permissionless release of the remaining balance after 7 days of client inaction."
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
          "address": "ALa1EKfsHHMefH139SYuSNxd2XbUPj9EN3xRTbPHQNwA"
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
          "address": "ALa1EKfsHHMefH139SYuSNxd2XbUPj9EN3xRTbPHQNwA"
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
      "name": "partialTimeoutRelease",
      "docs": [
        "Permissionless 20% release after 72 hours of client inaction."
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
                241,
                252,
                49,
                238,
                150,
                64,
                144,
                100,
                18,
                111,
                254,
                150,
                181,
                168,
                229,
                211,
                48,
                181,
                141,
                8,
                58,
                158,
                243,
                115,
                238,
                100,
                218,
                177,
                77,
                204,
                86,
                33
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
          "address": "HHcJGbKX7fzaPE1UYxqfhGgToDHCDhiWCMawbkumewtt"
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
                241,
                252,
                49,
                238,
                150,
                64,
                144,
                100,
                18,
                111,
                254,
                150,
                181,
                168,
                229,
                211,
                48,
                181,
                141,
                8,
                58,
                158,
                243,
                115,
                238,
                100,
                218,
                177,
                77,
                204,
                86,
                33
              ]
            }
          }
        },
        {
          "name": "reputationProgram",
          "address": "HHcJGbKX7fzaPE1UYxqfhGgToDHCDhiWCMawbkumewtt"
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
        }
      ],
      "args": []
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
      "name": "vaultSeed",
      "type": "bytes",
      "value": "[118, 97, 117, 108, 116]"
    }
  ]
};
