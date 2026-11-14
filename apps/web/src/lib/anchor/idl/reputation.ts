/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/reputation.json`.
 */
export type Reputation = {
  "address": "5Tm5aXm3NRzX6fJL3R7NeRbjhZjxTUfJ4nTLurPxdPc6",
  "metadata": {
    "name": "reputation",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Proove decentralized reputation program"
  },
  "instructions": [
    {
      "name": "awardBadge",
      "docs": [
        "Awards a deterministically-eligible badge to a profile."
      ],
      "discriminator": [
        163,
        255,
        101,
        118,
        140,
        5,
        179,
        99
      ],
      "accounts": [
        {
          "name": "payer",
          "docs": [
            "Permissionless: eligibility is recomputed from the profile's own public",
            "fields (see `is_eligible_for_badge`), so there is no privileged data to",
            "gate here. Only pays the badge account's rent."
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "profile",
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
                "path": "profile.authority",
                "account": "userProfile"
              }
            ]
          }
        },
        {
          "name": "badge",
          "writable": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "badgeType",
          "type": {
            "defined": {
              "name": "badgeType"
            }
          }
        },
        {
          "name": "metadata",
          "type": "string"
        }
      ]
    },
    {
      "name": "getProfile",
      "docs": [
        "Read-only helper returning a profile's current reputation score."
      ],
      "discriminator": [
        85,
        133,
        144,
        124,
        215,
        255,
        164,
        144
      ],
      "accounts": [
        {
          "name": "profile",
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
                "path": "profile.authority",
                "account": "userProfile"
              }
            ]
          }
        }
      ],
      "args": [],
      "returns": "u64"
    },
    {
      "name": "initializeProfile",
      "docs": [
        "Creates a user's reputation profile PDA. Callable once per authority."
      ],
      "discriminator": [
        32,
        145,
        77,
        213,
        58,
        39,
        251,
        234
      ],
      "accounts": [
        {
          "name": "authority",
          "writable": true,
          "signer": true
        },
        {
          "name": "profile",
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
                "path": "authority"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "submitRating",
      "docs": [
        "Client submits an immutable 1-5 rating for a completed job."
      ],
      "discriminator": [
        238,
        207,
        253,
        243,
        170,
        69,
        73,
        199
      ],
      "accounts": [
        {
          "name": "client",
          "writable": true,
          "signer": true
        },
        {
          "name": "escrowAuthority",
          "docs": [
            "Trusted co-signer attesting that `job_id` is a real completed job",
            "between `client` and `freelancer`. Callable only via CPI from escrow,",
            "signed by its `escrow_authority` PDA -- see `UpdateCompletion`."
          ],
          "signer": true,
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
            ],
            "program": {
              "kind": "const",
              "value": [
                9,
                171,
                214,
                136,
                77,
                97,
                135,
                178,
                191,
                149,
                228,
                128,
                226,
                11,
                227,
                123,
                15,
                198,
                5,
                248,
                231,
                97,
                234,
                93,
                145,
                208,
                118,
                44,
                131,
                219,
                236,
                52
              ]
            }
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
            ]
          }
        },
        {
          "name": "rating",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  97,
                  116,
                  105,
                  110,
                  103
                ]
              },
              {
                "kind": "account",
                "path": "client"
              },
              {
                "kind": "arg",
                "path": "jobId"
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
          "name": "jobId",
          "type": "u64"
        },
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
      "name": "updateCompletion",
      "docs": [
        "Records a job completion (success or cancellation) and its earnings."
      ],
      "discriminator": [
        70,
        97,
        149,
        239,
        171,
        74,
        206,
        215
      ],
      "accounts": [
        {
          "name": "escrowAuthority",
          "docs": [
            "Callable only via CPI from escrow, signed by its `escrow_authority` PDA.",
            "A PDA has no private key, so this can never be satisfied by a direct,",
            "top-level transaction -- only escrow's own `invoke_signed` can produce",
            "a valid signature for it."
          ],
          "signer": true,
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
            ],
            "program": {
              "kind": "const",
              "value": [
                9,
                171,
                214,
                136,
                77,
                97,
                135,
                178,
                191,
                149,
                228,
                128,
                226,
                11,
                227,
                123,
                15,
                198,
                5,
                248,
                231,
                97,
                234,
                93,
                145,
                208,
                118,
                44,
                131,
                219,
                236,
                52
              ]
            }
          }
        },
        {
          "name": "profile",
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
                "path": "profile.authority",
                "account": "userProfile"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "successful",
          "type": "bool"
        },
        {
          "name": "earnings",
          "type": "u64"
        },
        {
          "name": "deliveredOnTime",
          "type": "bool"
        },
        {
          "name": "disputedOutcome",
          "type": {
            "option": "u16"
          }
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "badge",
      "discriminator": [
        40,
        127,
        162,
        181,
        177,
        154,
        1,
        48
      ]
    },
    {
      "name": "rating",
      "discriminator": [
        203,
        130,
        231,
        178,
        120,
        130,
        70,
        17
      ]
    },
    {
      "name": "userProfile",
      "discriminator": [
        32,
        37,
        119,
        205,
        179,
        180,
        13,
        194
      ]
    }
  ],
  "events": [
    {
      "name": "badgeAwarded",
      "discriminator": [
        153,
        87,
        158,
        115,
        220,
        200,
        52,
        1
      ]
    },
    {
      "name": "completionUpdated",
      "discriminator": [
        82,
        72,
        75,
        53,
        249,
        120,
        62,
        81
      ]
    },
    {
      "name": "profileCreated",
      "discriminator": [
        134,
        233,
        199,
        153,
        77,
        206,
        128,
        94
      ]
    },
    {
      "name": "profileUpdated",
      "discriminator": [
        186,
        248,
        62,
        98,
        112,
        98,
        161,
        252
      ]
    },
    {
      "name": "ratingSubmitted",
      "discriminator": [
        129,
        135,
        238,
        21,
        26,
        150,
        24,
        219
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "profileAlreadyExists",
      "msg": "Profile already exists"
    },
    {
      "code": 6001,
      "name": "profileNotFound",
      "msg": "Profile not found"
    },
    {
      "code": 6002,
      "name": "invalidRating",
      "msg": "Rating must be between 1 and 5"
    },
    {
      "code": 6003,
      "name": "duplicateRating",
      "msg": "This job has already been rated"
    },
    {
      "code": 6004,
      "name": "badgeAlreadyOwned",
      "msg": "Badge has already been awarded to this profile"
    },
    {
      "code": 6005,
      "name": "badgeNotEligible",
      "msg": "Profile is not eligible for this badge yet"
    },
    {
      "code": 6006,
      "name": "unauthorized",
      "msg": "Signer is not authorized to perform this action"
    },
    {
      "code": 6007,
      "name": "mathOverflow",
      "msg": "Arithmetic overflow"
    },
    {
      "code": 6008,
      "name": "selfDealing",
      "msg": "Client and freelancer must be different accounts"
    },
    {
      "code": 6009,
      "name": "invalidEarnings",
      "msg": "Total earnings must not decrease"
    },
    {
      "code": 6010,
      "name": "metadataTooLong",
      "msg": "Badge metadata exceeds maximum length"
    },
    {
      "code": 6011,
      "name": "invalidDisputeOutcome",
      "msg": "Dispute outcome must be between 0 and 10000 basis points"
    }
  ],
  "types": [
    {
      "name": "badge",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "profile",
            "type": "pubkey"
          },
          {
            "name": "badgeType",
            "type": {
              "defined": {
                "name": "badgeType"
              }
            }
          },
          {
            "name": "issuer",
            "type": "pubkey"
          },
          {
            "name": "issuedAt",
            "type": "i64"
          },
          {
            "name": "metadata",
            "docs": [
              "Free-form metadata (e.g. a URI to badge artwork or criteria snapshot)."
            ],
            "type": "string"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "badgeAwarded",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "badge",
            "type": "pubkey"
          },
          {
            "name": "profile",
            "type": "pubkey"
          },
          {
            "name": "badgeType",
            "type": {
              "defined": {
                "name": "badgeType"
              }
            }
          },
          {
            "name": "issuedAt",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "badgeType",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "firstGig"
          },
          {
            "name": "tenCompletedJobs"
          },
          {
            "name": "hundredCompletedJobs"
          },
          {
            "name": "fiveStarPerformer"
          },
          {
            "name": "trustedFreelancer"
          },
          {
            "name": "fastDeliverer"
          },
          {
            "name": "topRated"
          }
        ]
      }
    },
    {
      "name": "completionUpdated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "profile",
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
            "name": "totalEarnings",
            "type": "u64"
          },
          {
            "name": "reputationScore",
            "type": "u64"
          },
          {
            "name": "onTimeJobs",
            "type": "u64"
          },
          {
            "name": "disputesWon",
            "type": "u64"
          },
          {
            "name": "disputesLost",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "profileCreated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "profile",
            "type": "pubkey"
          },
          {
            "name": "authority",
            "type": "pubkey"
          },
          {
            "name": "createdAt",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "profileUpdated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "profile",
            "type": "pubkey"
          },
          {
            "name": "reputationScore",
            "type": "u64"
          },
          {
            "name": "updatedAt",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "rating",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "jobId",
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
            "name": "score",
            "type": "u8"
          },
          {
            "name": "reviewHash",
            "docs": [
              "Hash (e.g. SHA-256) of the off-chain review text, keeping the raw",
              "review content off-chain while still binding it immutably here."
            ],
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "submittedAt",
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
      "name": "ratingSubmitted",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "rating",
            "type": "pubkey"
          },
          {
            "name": "jobId",
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
            "name": "score",
            "type": "u8"
          },
          {
            "name": "newAverageRating",
            "type": "u32"
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
      "name": "badgeSeed",
      "type": "bytes",
      "value": "[98, 97, 100, 103, 101]"
    },
    {
      "name": "escrowAuthoritySeed",
      "docs": [
        "Seed for the escrow program's CPI-signer PDA. Only a signature derived",
        "from this seed under `ESCROW_PROGRAM_ID` is accepted as the trusted",
        "caller for settlement-triggered instructions."
      ],
      "type": "bytes",
      "value": "[101, 115, 99, 114, 111, 119, 95, 97, 117, 116, 104, 111, 114, 105, 116, 121]"
    },
    {
      "name": "profileSeed",
      "type": "bytes",
      "value": "[112, 114, 111, 102, 105, 108, 101]"
    },
    {
      "name": "ratingSeed",
      "type": "bytes",
      "value": "[114, 97, 116, 105, 110, 103]"
    }
  ]
};
