/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/achievement.json`.
 */
export type Achievement = {
  "address": "ACMSSsuJaZ23xezUbkqjCNBhXCcUGEqfNe2cTZBogkRo",
  "metadata": {
    "name": "achievement",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "PayGig NFT achievement program"
  },
  "instructions": [
    {
      "name": "claimAchievement",
      "docs": [
        "User-initiated: mints the NFT for a badge already earned in the",
        "Reputation program. Reputation is never queried or modified by this",
        "call beyond reading the existing profile/badge PDAs."
      ],
      "discriminator": [
        107,
        181,
        102,
        247,
        207,
        212,
        251,
        24
      ],
      "accounts": [
        {
          "name": "claimer",
          "writable": true,
          "signer": true
        },
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
                "path": "claimer"
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
          "name": "badge",
          "docs": [
            "Existence of this PDA, owned by the reputation program and derived",
            "from `claimer` + `badge_type`, IS the eligibility proof: reputation's",
            "own `award_badge` instruction already checked the earning criteria",
            "before creating it. Achievement never recomputes or stores that logic."
          ]
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
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
          "name": "achievement",
          "docs": [
            "One PDA per (owner, badge_type); `init` fails outright on a repeat",
            "claim, so duplicate/replay claims are rejected by the runtime itself."
          ],
          "writable": true
        },
        {
          "name": "asset",
          "writable": true,
          "signer": true
        },
        {
          "name": "collection",
          "writable": true
        },
        {
          "name": "mplCoreProgram",
          "address": "CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d"
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
        }
      ]
    },
    {
      "name": "initCollection",
      "docs": [
        "One-time admin setup: creates the shared NFT collection every",
        "achievement is minted into, and records the metadata base URI.",
        "Settlement never touches this program -- claiming is always a",
        "separate, user-initiated transaction."
      ],
      "discriminator": [
        244,
        242,
        133,
        0,
        152,
        187,
        144,
        139
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
          "name": "collection",
          "writable": true,
          "signer": true
        },
        {
          "name": "mplCoreProgram",
          "address": "CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "name",
          "type": "string"
        },
        {
          "name": "uri",
          "type": "string"
        },
        {
          "name": "baseUri",
          "type": "string"
        }
      ]
    },
    {
      "name": "setBaseUri",
      "docs": [
        "Admin-only: repoints badge metadata at a new host. Affects assets",
        "minted after the change; already-minted NFTs keep their URI."
      ],
      "discriminator": [
        227,
        95,
        247,
        32,
        191,
        190,
        124,
        60
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
          "name": "baseUri",
          "type": "string"
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "achievement",
      "discriminator": [
        30,
        253,
        162,
        142,
        30,
        160,
        66,
        62
      ]
    },
    {
      "name": "achievementConfig",
      "discriminator": [
        197,
        134,
        240,
        54,
        119,
        126,
        142,
        204
      ]
    }
  ],
  "events": [
    {
      "name": "achievementClaimed",
      "discriminator": [
        14,
        49,
        71,
        199,
        214,
        248,
        116,
        232
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "collectionAlreadyInitialized",
      "msg": "Achievement collection has already been initialized"
    },
    {
      "code": 6001,
      "name": "badgeNotEarned",
      "msg": "Badge has not been earned by this profile"
    },
    {
      "code": 6002,
      "name": "profileMismatch",
      "msg": "Badge does not belong to the claiming profile"
    },
    {
      "code": 6003,
      "name": "alreadyClaimed",
      "msg": "Achievement has already been claimed"
    },
    {
      "code": 6004,
      "name": "unauthorized",
      "msg": "Signer is not the achievement config admin"
    },
    {
      "code": 6005,
      "name": "baseUriTooLong",
      "msg": "Metadata base URI is empty or exceeds the maximum length"
    }
  ],
  "types": [
    {
      "name": "achievement",
      "docs": [
        "One PDA per (owner, badge_type). Existence + `claimed = true` is the",
        "on-chain record that the badge's NFT has been minted; the PDA's `init`",
        "constraint at claim time is what makes a duplicate claim impossible."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "owner",
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
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "claimed",
            "type": "bool"
          },
          {
            "name": "claimedAt",
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
      "name": "achievementClaimed",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "achievement",
            "type": "pubkey"
          },
          {
            "name": "owner",
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
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "claimedAt",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "achievementConfig",
      "docs": [
        "Singleton config holding the shared Metaplex Core collection that every",
        "claimed achievement NFT is minted into, plus the base URI its metadata is",
        "served from."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "admin",
            "type": "pubkey"
          },
          {
            "name": "collection",
            "type": "pubkey"
          },
          {
            "name": "baseUri",
            "docs": [
              "Base URI for off-chain badge metadata JSON; the badge's slug is appended",
              "(e.g. `<base_uri>/first-gig.json`). Stored on-chain rather than compiled",
              "in as a `const` so a wrong or moved metadata host can be corrected with",
              "`set_base_uri` instead of a program redeploy."
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
      "name": "achievementSeed",
      "type": "bytes",
      "value": "[97, 99, 104, 105, 101, 118, 101, 109, 101, 110, 116]"
    },
    {
      "name": "configSeed",
      "type": "bytes",
      "value": "[99, 111, 110, 102, 105, 103]"
    }
  ]
};
