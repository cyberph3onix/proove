/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/gig.json`.
 */
export type Gig = {
  "address": "85SttowTEpVzdLhqsVy9YKVBX2DhuwnDicpNqaG38P37",
  "metadata": {
    "name": "gig",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Proove job/gig lifecycle program"
  },
  "instructions": [
    {
      "name": "archiveGig",
      "docs": [
        "Archives a Completed gig."
      ],
      "discriminator": [
        113,
        22,
        10,
        206,
        177,
        249,
        83,
        178
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
        }
      ],
      "args": []
    },
    {
      "name": "assignFreelancer",
      "docs": [
        "Assigns a freelancer to a Published gig, transitioning it to Assigned."
      ],
      "discriminator": [
        27,
        101,
        101,
        33,
        185,
        240,
        49,
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
          "name": "freelancer"
        },
        {
          "name": "gig",
          "writable": true
        }
      ],
      "args": []
    },
    {
      "name": "cancelGig",
      "docs": [
        "Client-driven cancellation before any milestone funding."
      ],
      "discriminator": [
        109,
        142,
        65,
        80,
        226,
        145,
        135,
        185
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
        }
      ],
      "args": []
    },
    {
      "name": "completeGig",
      "docs": [
        "Manual completion path for gigs that never entered escrow."
      ],
      "discriminator": [
        20,
        247,
        132,
        142,
        227,
        28,
        70,
        221
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
        }
      ],
      "args": []
    },
    {
      "name": "initializeGig",
      "docs": [
        "Creates a new gig in Draft status with title, description, category, budget, and deadline."
      ],
      "discriminator": [
        3,
        246,
        83,
        136,
        167,
        171,
        201,
        181
      ],
      "accounts": [
        {
          "name": "client",
          "writable": true,
          "signer": true
        },
        {
          "name": "mint"
        },
        {
          "name": "gig",
          "writable": true,
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
                "path": "client"
              },
              {
                "kind": "arg",
                "path": "id"
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
          "name": "id",
          "type": "u64"
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
        }
      ]
    },
    {
      "name": "markCancelledByEscrow",
      "docs": [
        "CPI-only: escrow signals a cancellation, moving Assigned/InProgress -> Cancelled."
      ],
      "discriminator": [
        146,
        134,
        247,
        15,
        55,
        254,
        60,
        4
      ],
      "accounts": [
        {
          "name": "escrowAuthority",
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
          "name": "gig",
          "writable": true
        }
      ],
      "args": []
    },
    {
      "name": "markCompletedByEscrow",
      "docs": [
        "CPI-only: escrow signals its final milestone release, moving InProgress -> Completed."
      ],
      "discriminator": [
        55,
        185,
        216,
        147,
        65,
        152,
        42,
        91
      ],
      "accounts": [
        {
          "name": "escrowAuthority",
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
          "name": "gig",
          "writable": true
        }
      ],
      "args": []
    },
    {
      "name": "markInProgress",
      "docs": [
        "CPI-only: escrow signals its first milestone funding, moving Assigned -> InProgress."
      ],
      "discriminator": [
        252,
        226,
        224,
        239,
        209,
        124,
        192,
        78
      ],
      "accounts": [
        {
          "name": "escrowAuthority",
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
          "name": "gig",
          "writable": true
        }
      ],
      "args": []
    },
    {
      "name": "publishGig",
      "docs": [
        "Publishes a Draft gig, making it visible for freelancer assignment."
      ],
      "discriminator": [
        79,
        182,
        204,
        78,
        185,
        187,
        134,
        228
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
        }
      ],
      "args": []
    },
    {
      "name": "updateGig",
      "docs": [
        "Updates a Draft gig's metadata."
      ],
      "discriminator": [
        187,
        30,
        139,
        76,
        54,
        228,
        194,
        4
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
        }
      ],
      "args": [
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
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "gig",
      "discriminator": [
        148,
        118,
        103,
        202,
        75,
        208,
        88,
        94
      ]
    }
  ],
  "events": [
    {
      "name": "freelancerAssigned",
      "discriminator": [
        129,
        236,
        196,
        135,
        192,
        56,
        208,
        87
      ]
    },
    {
      "name": "gigArchived",
      "discriminator": [
        16,
        159,
        222,
        128,
        23,
        14,
        53,
        200
      ]
    },
    {
      "name": "gigCancelled",
      "discriminator": [
        125,
        193,
        224,
        148,
        176,
        113,
        250,
        18
      ]
    },
    {
      "name": "gigCompleted",
      "discriminator": [
        42,
        114,
        160,
        40,
        3,
        241,
        149,
        64
      ]
    },
    {
      "name": "gigCreated",
      "discriminator": [
        99,
        221,
        204,
        160,
        24,
        21,
        102,
        174
      ]
    },
    {
      "name": "gigInProgress",
      "discriminator": [
        197,
        5,
        79,
        226,
        170,
        216,
        56,
        161
      ]
    },
    {
      "name": "gigPublished",
      "discriminator": [
        143,
        190,
        119,
        220,
        218,
        194,
        2,
        87
      ]
    },
    {
      "name": "gigUpdated",
      "discriminator": [
        54,
        232,
        48,
        82,
        151,
        228,
        195,
        15
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
      "name": "titleTooLong",
      "msg": "Title exceeds maximum length"
    },
    {
      "code": 6002,
      "name": "descriptionTooLong",
      "msg": "Description exceeds maximum length"
    },
    {
      "code": 6003,
      "name": "skillsTooLong",
      "msg": "Skills string exceeds maximum length"
    },
    {
      "code": 6004,
      "name": "categoryTooLong",
      "msg": "Category exceeds maximum length"
    },
    {
      "code": 6005,
      "name": "invalidDeadline",
      "msg": "Deadline is too soon or in the past"
    },
    {
      "code": 6006,
      "name": "invalidBudget",
      "msg": "Budget must be greater than zero"
    },
    {
      "code": 6007,
      "name": "freelancerAlreadyAssigned",
      "msg": "Freelancer is already assigned to this gig"
    },
    {
      "code": 6008,
      "name": "notDraftStatus",
      "msg": "Gig must be in Draft status"
    },
    {
      "code": 6009,
      "name": "notPublishedStatus",
      "msg": "Gig must be in Published status"
    },
    {
      "code": 6010,
      "name": "notAssignedStatus",
      "msg": "Gig must be in Assigned status"
    },
    {
      "code": 6011,
      "name": "notInProgressStatus",
      "msg": "Gig must be in InProgress status"
    },
    {
      "code": 6012,
      "name": "notCompletedStatus",
      "msg": "Gig must be in Completed status"
    },
    {
      "code": 6013,
      "name": "invalidStatus",
      "msg": "Gig is in a terminal or otherwise invalid status for this transition"
    },
    {
      "code": 6014,
      "name": "overflow",
      "msg": "Arithmetic overflow"
    }
  ],
  "types": [
    {
      "name": "freelancerAssigned",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "gig",
            "type": "pubkey"
          },
          {
            "name": "id",
            "type": "u64"
          },
          {
            "name": "freelancer",
            "type": "pubkey"
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
      "name": "gigArchived",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "gig",
            "type": "pubkey"
          },
          {
            "name": "id",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "gigCancelled",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "gig",
            "type": "pubkey"
          },
          {
            "name": "id",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "gigCompleted",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "gig",
            "type": "pubkey"
          },
          {
            "name": "id",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "gigCreated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "gig",
            "type": "pubkey"
          },
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
            "name": "createdAt",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "gigInProgress",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "gig",
            "type": "pubkey"
          },
          {
            "name": "id",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "gigPublished",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "gig",
            "type": "pubkey"
          },
          {
            "name": "id",
            "type": "u64"
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
      "name": "gigUpdated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "gig",
            "type": "pubkey"
          },
          {
            "name": "id",
            "type": "u64"
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
          }
        ]
      }
    }
  ],
  "constants": [
    {
      "name": "escrowAuthoritySeed",
      "docs": [
        "Seed for the escrow program's CPI-signer PDA. Only a signature derived from",
        "this seed under `ESCROW_PROGRAM_ID` is accepted by the escrow-only instructions."
      ],
      "type": "bytes",
      "value": "[101, 115, 99, 114, 111, 119, 95, 97, 117, 116, 104, 111, 114, 105, 116, 121]"
    },
    {
      "name": "gigSeed",
      "type": "bytes",
      "value": "[103, 105, 103]"
    }
  ]
};
