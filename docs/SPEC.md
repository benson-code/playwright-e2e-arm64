# Quick Transfer — System Specification

[繁體中文](SPEC.zh-TW.md)

| | |
|---|---|
| Version | 1.0 |
| Date | 2026-09-14 |
| Status | Implemented; every rule below was verified against the running system |
| Code | `shared/rules.js` (rules), `api/server.js` (API), `web/src/App.jsx` (UI) |

## 1. Purpose

Quick Transfer is a deliberately small system under test (SUT) for the Playwright suite in
this repository. It models one fintech flow — sending money from your account to another —
with enough business rules to exercise real test design: equivalence classes, boundary
values, error paths, API failures and UI state.

It is not a product. There is no authentication, no database and no persistence (see §8).

Every rule has an ID (`R-xx`, `A-xx`, `E-xx`). Test cases should cite these IDs so coverage
can be traced back to the specification.

## 2. Architecture

```
Browser (Chromium, headless)
   │  http://127.0.0.1:5273
   ▼
Vite dev server ── serves the React UI
   │  /api/*  (proxied, same origin → no CORS)
   ▼
Node API (node:http) ── http://127.0.0.1:8281
   │
   ▼
In-memory accounts + transfer list (reset on restart)
```

Validation rules live in one module, `shared/rules.js`, imported by both the UI and the API,
so the two can never disagree about what is valid. The API re-checks everything the UI
checks: a client can always be bypassed.

## 3. Seed data

The API starts with exactly these accounts. `POST /api/test/reset` restores them (§6.5).

| Account | Owner | Opening balance (TWD) | Role in tests |
|---|---|---:|---|
| `1000000001` | Alice Chen | 30,000 | The signed-in sender (fixed in the UI) |
| `1000000002` | Bob Lin | 5,000 | Valid recipient |
| `1000000003` | Carol Wu | 0 | Valid recipient with a zero balance |
| `1000000099` | — | — | Well-formed but does **not** exist |

The opening balance (30,000) is below the per-transfer limit (50,000) on purpose. Amounts in
30,001–50,000 pass validation but fail on funds, so the two rules can be tested separately.

## 4. Business rules

All amounts are whole New Taiwan Dollars. There are no decimals anywhere in the system.

### 4.1 Recipient account

| ID | Rule | Error code | Message |
|---|---|---|---|
| R-01 | Required. Leading/trailing whitespace is trimmed first, so blank-only input counts as empty. | `RECIPIENT_REQUIRED` | Enter a recipient account. |
| R-02 | Exactly 10 digits (`^\d{10}$`) after trimming. In the API it must be a JSON string; a number is rejected. | `RECIPIENT_FORMAT` | Account number must be 10 digits. |
| R-03 | Must differ from the sender. | `SAME_ACCOUNT` | You cannot transfer to your own account. |
| R-08 | Must exist. Checked by the API only. | `RECIPIENT_NOT_FOUND` | Recipient account not found. |

### 4.2 Amount

| ID | Rule | Error code | Message |
|---|---|---|---|
| R-04 | Required. | `AMOUNT_REQUIRED` | Enter an amount. |
| R-05 | Must be an integer. | `AMOUNT_NOT_INTEGER` | Amount must be a whole number. |
| R-06 | Minimum 1. | `AMOUNT_TOO_SMALL` | Amount must be at least 1. |
| R-07 | Maximum 50,000 per transfer. | `AMOUNT_TOO_LARGE` | Amount cannot exceed 50,000 per transfer. |
| R-09 | Must not exceed the sender's current balance. Equal to the balance is allowed. Checked by the API only. | `INSUFFICIENT_FUNDS` | Insufficient balance. |

### 4.3 How the amount text box is interpreted (UI)

The text is trimmed, then:

| Input | Interpreted as | Result |
|---|---|---|
| *(empty)* | nothing | R-04 |
| `100`, `0100` | 100 (leading zeros ignored) | valid |
| `0` | 0 | R-06 |
| `-5` | -5 | R-06 (not R-05: it is a whole number, just too small) |
| `10.5`, `10.0`, `1,000`, `1e3`, `abc`, `+5` | not an integer | R-05 |
| `50001`, `999999999999999999999` | too large | R-07 |

### 4.4 Boundary summary

| Field | Invalid below | Valid range | Invalid above |
|---|---|---|---|
| Recipient length | 9 digits | 10 digits | 11 digits |
| Amount (limit) | 0 | 1 – 50,000 | 50,001 |
| Amount (funds, Alice) | — | 1 – 30,000 | 30,001 (R-09) |

## 5. User interface

### 5.1 Page elements

Tests should locate elements by accessible role and name first; `data-testid` is used only
for values that have no accessible name.

| Element | How to locate | Content |
|---|---|---|
| Document title | `page` title | `Quick Transfer` |
| Heading | role `heading`, name `Quick Transfer` | — |
| Sender account | test id `sender-account` | `1000000001` |
| Balance | test id `balance` | `Loading...` → `30,000 TWD` or `Unavailable` |
| Recipient input | label `Recipient account` | text |
| Amount input | label `Amount (TWD)` | text |
| Submit button | role `button`, name `Transfer` (`Sending...` while submitting) | — |
| Field error | element referenced by the input's `aria-describedby` | message from §4 |
| Success banner | role `status` | see U-06 |
| Error banner | role `alert` | see U-07 |

### 5.2 Behaviour

| ID | Behaviour |
|---|---|
| U-01 | On load, the UI calls `GET /api/accounts/1000000001`. While waiting the balance reads `Loading...`. |
| U-02 | If that call fails (network error or non-2xx), the balance reads `Unavailable` and the submit button stays disabled. |
| U-03 | Balances are shown with `en-US` thousands separators and the suffix ` TWD`, e.g. `30,000 TWD`, `0 TWD`. |
| U-04 | On submit, the UI checks R-01–R-07 for **both** fields and shows **every** failing field at once. A field with an error gets `aria-invalid="true"`. If any field fails, no request is sent. |
| U-05 | While a request is in flight the button reads `Sending...` and is disabled, so it cannot be submitted twice from the UI. |
| U-06 | On `201`: the banner (role `status`) reads `Sent {amount} TWD to {toAccount}. Reference: {id}` (e.g. `Sent 1,000 TWD to 1000000002. Reference: TX-000001`), the balance updates to `balanceAfter`, and both inputs are cleared. |
| U-07 | On any other response, the banner (role `alert`) shows the message for the returned error code from §4. An unknown code, an unreadable body, HTTP 500 or a network failure all show `Something went wrong. Please try again.` Inputs are kept. |
| U-08 | Each new submit removes the previous banner before validating. |
| U-09 | The recipient is trimmed before it is sent (` 1000000002 ` is sent as `1000000002`). |

## 6. API

### 6.1 Conventions

- Base URL `http://127.0.0.1:8281`; the UI reaches it through the Vite proxy at `/api`.
- Request and response bodies are JSON, UTF-8.
- Every error uses one envelope:

```json
{ "error": { "code": "AMOUNT_TOO_LARGE", "message": "Amount cannot exceed 50,000 per transfer.", "field": "amount" } }
```

`field` is present only when the error belongs to one input (`fromAccount`, `toAccount`, `amount`).

### 6.2 Endpoints

| ID | Method & path | Success | Errors |
|---|---|---|---|
| A-01 | `GET /api/health` | `200 {"status":"ok"}` | — |
| A-02 | `GET /api/accounts/{id}` | `200 {"id","owner","balance"}` | `404 ACCOUNT_NOT_FOUND` |
| A-03 | `POST /api/transfers` | `201` transfer object (§6.4) | see §6.3 |
| A-04 | `POST /api/test/reset` | `204` (test hooks only, §6.5) | `404 NOT_FOUND` when hooks are off |
| A-05 | anything else | — | `404 NOT_FOUND` |

### 6.3 `POST /api/transfers` — request and check order

```json
{ "fromAccount": "1000000001", "toAccount": "1000000002", "amount": 1000 }
```

Checks run in this order. **Only the first failure is returned**, so a request with several
problems reports the earliest one (e.g. a bad recipient and a zero amount → `RECIPIENT_FORMAT`).
This differs from the UI, which shows all field errors together (U-04).

| Step | Check | Status | Code | `field` |
|---:|---|---:|---|---|
| 1 | Body larger than 10,000 bytes | 413 | `PAYLOAD_TOO_LARGE` | — |
| 2 | Body is not valid JSON, or is not a JSON object (`null`, array, number…) | 400 | `INVALID_JSON` | — |
| 3 | `fromAccount` is not a string naming an existing account | 404 | `SENDER_NOT_FOUND` | `fromAccount` |
| 4 | R-01 / R-02 / R-03 | 400 | `RECIPIENT_REQUIRED` / `RECIPIENT_FORMAT` / `SAME_ACCOUNT` | `toAccount` |
| 5 | R-04 / R-05 / R-06 / R-07 — `amount` must be a JSON number; the string `"100"` is `AMOUNT_NOT_INTEGER` | 400 | `AMOUNT_REQUIRED` / `AMOUNT_NOT_INTEGER` / `AMOUNT_TOO_SMALL` / `AMOUNT_TOO_LARGE` | `amount` |
| 6 | R-08 | 404 | `RECIPIENT_NOT_FOUND` | `toAccount` |
| 7 | R-09 | 422 | `INSUFFICIENT_FUNDS` | `amount` |

A failed request changes nothing: no balance moves and no transfer ID is consumed.

### 6.4 Transfer object (201)

```json
{
  "id": "TX-000001",
  "fromAccount": "1000000001",
  "toAccount": "1000000002",
  "amount": 1000,
  "balanceAfter": 29000,
  "createdAt": "2026-09-14T09:15:23.170Z"
}
```

| Field | Meaning |
|---|---|
| `id` | `TX-` + 6-digit sequence, starting at `TX-000001` and increasing by 1 per successful transfer |
| `toAccount` | Trimmed recipient |
| `balanceAfter` | Sender balance after this transfer |
| `createdAt` | Server time, ISO 8601, UTC |

The sender's debit and the recipient's credit happen together (E-03).

### 6.5 Test hooks

| ID | Rule |
|---|---|
| A-06 | `POST /api/test/reset` restores the seed data (§3), empties the transfer list and restarts IDs at `TX-000001`. |
| A-07 | The endpoint exists only when the API is started with `ENABLE_TEST_HOOKS=1`. Otherwise it returns `404 NOT_FOUND`, the same as any unknown path. Playwright sets this variable; `npm run api` does not. |

## 7. Environment and non-functional rules

| ID | Rule |
|---|---|
| E-01 | Ports: UI `5273`, API `8281`, both bound to `127.0.0.1`. Vite uses `strictPort`, so if 5273 is busy it fails instead of moving to another port. |
| E-02 | All data is in memory in one Node process. Restarting the API resets everything. |
| E-03 | A transfer is applied in one synchronous block. Node runs one request handler at a time, so no reader can see a debit without its matching credit. |
| E-04 | `API_PORT` overrides the API port for both the API and the Vite proxy. |
| E-05 | Runtime: Node ≥ 20.19 (required by Vite 8). Verified on Ubuntu 24.04.4 aarch64 with Node 20.20.2. |

## 8. Known limitations (intentional)

These are real gaps in a production payment system. They are left in so they can be
discussed and tested, not because they are acceptable.

| ID | Limitation | Consequence |
|---|---|---|
| L-01 | No authentication; the sender is hard-coded in the UI and trusted from the request body in the API. | Any caller can move money from any account through the API. |
| L-02 | No idempotency key. | Double submission is prevented only by the disabled button (U-05). Two identical API calls create two transfers. |
| L-03 | JSON cannot tell `10` from `10.0`, so the API accepts `10.0` as 10. The UI rejects the text `10.0` (R-05). | UI and API differ for this one input. |
| L-04 | No persistence, no transfer history endpoint. | Verify a transfer through balances (`GET /api/accounts/{id}`) or the 201 body. |
| L-05 | One shared in-memory state for all Playwright workers. | Tests that move money must reset first and must not run in parallel with each other. |
| L-06 | No rate limit, no daily limit, no currency other than TWD. | — |

## 9. Test coverage

| ID | Test | Covers | File |
|---|---|---|---|
| S-01 | Home page loads and shows the balance from the API | A-01, A-02, U-01, U-03 | `tests/smoke.spec.ts` |

Functional test cases for §4–§6 are not written yet; they are the next step in the roadmap.
