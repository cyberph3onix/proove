# @proove/ai

The Proove AI service runs the Scope Compiler and the Delivery Verifier on Gemini. Its request and response shapes match the mock in `apps/web/src/lib/mock/ai.ts`, so the frontend can switch from the mock to HTTP without changing shapes.

## Run

```sh
cp services/ai/.env.example services/ai/.env   # then set GEMINI_API_KEY
pnpm --filter @proove/ai dev                    # watch mode, http://127.0.0.1:3200
pnpm --filter @proove/ai start
pnpm --filter @proove/ai test                   # uses a fake model, no key needed
pnpm --filter @proove/ai typecheck
```

If `GEMINI_API_KEY` is not set, the service still starts. `/healthz` works, and the AI jobs answer `503 {"error":"unavailable"}`. The app treats that as "no AI" (a zero `spec_hash` or `report_hash`).

## Endpoints

Every `/v1/*` request needs an `x-proove-wallet: <base58 pubkey>` header. That header is used for rate limiting. It is not authenticated yet.

| Method | Path | Body | Response |
| --- | --- | --- | --- |
| `GET` | `/healthz` | none | `{ ok, jobs: { scope, verify } }` with the approved prompt hash and model for each job |
| `POST` | `/v1/scope/compile` | `{ brief, budgetUsdc?, attachments?: [{ name, mime, content }] }` | `ScopeResult` (the mock's shape) |
| `POST` | `/v1/delivery/verify` | `{ milestone, spec: MilestoneSpec, files: DeliveryFile[], note, submittedSlot }` | `VerificationReport` |

A file `content` is `{ encoding: "utf8" \| "base64", data }`. Before the model sees a delivery file, the service checks its content against the file's `plaintextHash`. A mismatch is rejected with 422. A file sent without content appears in the manifest only, and no evidence pointer can cite it.

Successful responses include these headers: `x-proove-document-hash` (SHA-256 of the RFC 8785 canonical JSON of the body, which is the value committed on-chain), `x-proove-prompt-hash` and `x-proove-model`. The body also carries `model` and `prompt_version`.

Error codes: 400 invalid request (the body lists issue paths and codes only), 401 missing wallet, 413 body over the cap, 422 content does not match its hash, 429 rate limited (with `retry-after`), 503 when the model is unavailable or the prompt or model is not approved.

## Guardrails

- **No retention.** Every Gemini call sets `config.store = false`. This is `GenerateContentConfig.store` in `@google/genai`, which overrides the project-level logging config. The call also sets `responseMimeType: "application/json"` and `responseJsonSchema` (generated from the zod schemas), and uses temperature 0.
- **Prompt allow-list.** Prompts are versioned files in `prompts/`. A prompt's hash is the SHA-256 of its RFC 8785 canonical JSON. A job runs only if its prompt hash and model ID are both listed in `allowlist.json`. In Phase 2 the on-chain `AiRegistry` replaces this file. After you edit a prompt, run `pnpm --filter @proove/ai allowlist` to print the new hashes, then approve the new hash by adding it to the file.
- **Content is data.** All user text (brief, spec, note, file contents, file names) reaches the model as JSON inside `<untrusted_data>` elements. `<`, `>`, `&` and U+2028/U+2029 are escaped, so nothing can close an element or start a new one. The system prompt says data is never an instruction.
- **Validated output only.** Model output must parse as JSON and pass the zod schema. Verifier output also needs exactly one finding per criterion. Output that fails any of these checks is retried once (`MODEL_RETRIES`), and then the job answers 503. Evidence pointers to files the model was not given are dropped. A `pass` with no valid pointer is downgraded to `unclear`. The server computes the pass count in the summary.
- **Logs hold hashes only.** Each job writes one log line with the wallet, request hash, byte size, prompt hash, model, document hash, latency, and per-attempt output hash and token counts. Fastify request logging is off, and errors are logged by code only.
- **Limits.** The request cap is 200 MB (`MAX_PAYLOAD_MB`). A request over the cap is rejected with 413 based on `content-length`, before the body is read. Each wallet has an in-memory token bucket (`RATE_LIMIT_BURST`, `RATE_LIMIT_PER_MINUTE`). The bucket is per process, so running several replicas needs a shared store.

## Not yet done

- Streaming the scope result. The mock streams criteria one by one, while this endpoint returns the final `ScopeResult` in one response.
- Sample audits. `samples` is `[]` until the SlotHashes sample-audit item is built.
- Files API for large files and video, wallet signature auth, and the per-gig spend cap.
