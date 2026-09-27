# Plan 3 — The money gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A paid deposit becomes a Sales Order, a Payment Entry, a Project with onboarding Tasks and a `/start` token — exactly once, and only when the payment is genuinely ours and genuinely complete.

**Architecture:** Payfast posts an ITN to `n8n.santi.co.za/webhook/santi-deposit`. n8n runs five checks (signature, source, Payfast's own confirmation, ownership, amount) before any write, inserts a `Payfast ITN` row whose autoname makes a replay fail at the database, then creates the records and emails the receipt. Signature checking and Payfast communication stay inside the `santi-pay` Worker; n8n never holds the passphrase.

**Tech Stack:** Cloudflare Workers, n8n, Frappe REST API, `node --test`, Python 3.

## Global Constraints

Plans 1 and 2 constraints still apply, plus:

- **This is the money boundary. Every field in an ITN is hostile input.** No ERPNext write happens before all five checks pass.
- **There is no Payfast sandbox.** Resu's README states it plainly: Payfast "is live and takes real money — there is no working sandbox path." Acceptance is a small **real** payment, then cleanup. Do not fabricate a sandbox run and call it proof.
- The merchant account is **shared with Resu**, so a valid Resu ITN body has a valid signature here. `ownsPayment()` is what separates the two systems, and it is not optional.
- The webhook responds **200 immediately** and processes afterwards. Payfast retries slow or failed responses, and a retry mid-write is how duplicates are made.
- A receipt is **never** emailed for a record that does not exist. On a failed write: `Payfast ITN.status = Failed`, payload kept, Telegram alert, client silent.
- Never edit, rename or deactivate a `Resu —` workflow. Task 7 is the only task that touches Resu, it is optional, and it is additive.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/core/itn.js` | pure decision functions: ownership, amount, status, and a single `classify()` verdict |
| `src/worker/pay.js` (modify) | `/_itn/validate` also asks Payfast to confirm; new `/_itn/source` resolves Payfast's hosts over DoH |
| `test/itn.test.js` | the decision functions, including the cross-system replay case |
| `test/n8n-deposit-nodes.test.js` | executes the deployed gate node code from the committed export |
| `tools/create-deposit-workflow.py` | builds the W3 workflow |
| `n8n/workflows/santi-deposit-gate-v0-1.json` | committed export |

---

### Task 1: The decision functions

**Files:**
- Create: `test/itn.test.js`, `src/core/itn.js`

**Interfaces:**
- Consumes: `ownsPayment` from `src/core/deposit.js` (Plan 2 Task 6).
- Produces: `classify({ itn, valid, confirmed, sourceOk, expectedAmount })` → `{ ok: boolean, reason: string }` where `reason` is one of `ok`, `bad-signature`, `bad-source`, `unconfirmed`, `not-ours`, `amount-mismatch`, `not-complete`. The n8n gate branches on `reason`, and each Telegram alert names it.

- [ ] **Step 1: Write the failing test**

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classify } from '../src/core/itn.js';

const ours = {
  m_payment_id: 'SANTI-SAL-QTN-2026-00007',
  custom_str1: 'a'.repeat(64),
  payment_status: 'COMPLETE',
  amount_gross: '9250.00'
};
const base = { itn: ours, valid: true, confirmed: true, sourceOk: true, expectedAmount: '9250.00' };

test('a genuine, complete, correctly priced payment of ours passes', () => {
  assert.deepEqual(classify(base), { ok: true, reason: 'ok' });
});

test('checks are reported in a fixed order so an alert names the first real fault', () => {
  // Everything wrong at once must report the signature, not the amount.
  const out = classify({ ...base, valid: false, sourceOk: false, confirmed: false, expectedAmount: '1.00' });
  assert.deepEqual(out, { ok: false, reason: 'bad-signature' });
});

test('a bad source is refused even with a valid signature', () => {
  assert.deepEqual(classify({ ...base, sourceOk: false }), { ok: false, reason: 'bad-source' });
});

test('an unconfirmed payment is refused even when the signature checks out', () => {
  // Payfast's own confirmation is the only thing that proves the callback is
  // not a forgery that happens to satisfy the other checks.
  assert.deepEqual(classify({ ...base, confirmed: false }), { ok: false, reason: 'unconfirmed' });
});

test("a Resu payment arriving at Santi's endpoint is rejected as not ours", () => {
  // Same merchant account, so the signature is valid. This is the whole reason
  // ownership exists as a separate check.
  const resu = { ...ours, m_payment_id: 'thabo-nkosi', custom_str1: '' };
  assert.deepEqual(classify({ ...base, itn: resu }), { ok: false, reason: 'not-ours' });
});

test('a tampered amount is rejected, over and under', () => {
  assert.deepEqual(classify({ ...base, itn: { ...ours, amount_gross: '1.00' } }), { ok: false, reason: 'amount-mismatch' });
  assert.deepEqual(classify({ ...base, itn: { ...ours, amount_gross: '9250.01' } }), { ok: false, reason: 'amount-mismatch' });
});

test('a cent of floating point slop is tolerated, a cent of difference is not', () => {
  assert.equal(classify({ ...base, expectedAmount: 9250 }).ok, true);
  assert.equal(classify({ ...base, expectedAmount: 9250.004 }).ok, true);
  assert.equal(classify({ ...base, expectedAmount: 9250.02 }).ok, false);
});

test('an incomplete payment is not an activation', () => {
  for (const status of ['FAILED', 'CANCELLED', 'PENDING', '']) {
    assert.deepEqual(classify({ ...base, itn: { ...ours, payment_status: status } }), { ok: false, reason: 'not-complete' });
  }
});

test('a missing expected amount is a mismatch, never a pass', () => {
  assert.deepEqual(classify({ ...base, expectedAmount: null }), { ok: false, reason: 'amount-mismatch' });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npm test`
Expected: FAIL — `Cannot find module '../src/core/itn.js'`.

- [ ] **Step 3: Write the implementation**

```javascript
// The gate's verdict, as a pure function so every branch is testable without
// a payment. Order matters: the first failing check is the one reported, so an
// alert names the real fault rather than a downstream symptom.
import { ownsPayment } from './deposit.js';

export function classify({ itn = {}, valid, confirmed, sourceOk, expectedAmount } = {}) {
  if (!valid) return { ok: false, reason: 'bad-signature' };
  if (!sourceOk) return { ok: false, reason: 'bad-source' };
  if (!confirmed) return { ok: false, reason: 'unconfirmed' };
  if (!ownsPayment(itn)) return { ok: false, reason: 'not-ours' };

  const expected = Number(expectedAmount);
  const gross = Number(itn.amount_gross);
  if (!Number.isFinite(expected) || !Number.isFinite(gross)) return { ok: false, reason: 'amount-mismatch' };
  if (Math.abs(expected - gross) >= 0.01) return { ok: false, reason: 'amount-mismatch' };

  if (String(itn.payment_status).toUpperCase() !== 'COMPLETE') return { ok: false, reason: 'not-complete' };
  return { ok: true, reason: 'ok' };
}
```

- [ ] **Step 4: Run the tests**

Run: `npm test`
Expected: all passing.

- [ ] **Step 5: Commit**

```bash
git add src/core/itn.js test/itn.test.js
git commit -m "ITN gate: the five checks as one pure verdict function"
```

---

### Task 2: Worker asks Payfast to confirm, and resolves Payfast's hosts

**Files:**
- Modify: `src/worker/pay.js`

**Interfaces:**
- Produces: `POST /_itn/validate` (bearer) → `{ valid, confirmed, fields }` — `confirmed` is Payfast's own answer; and `GET /_itn/source?ip=<addr>` (bearer) → `{ sourceOk: boolean }`.
- Task 3's n8n gate calls both and passes the results into `classify()`.

Why the Worker and not n8n: the Worker already holds the passphrase and is the only component that talks to Payfast. DNS resolution over DoH is also trivial in a Worker and awkward in an n8n Code node.

- [ ] **Step 1: Add Payfast confirmation and source resolution**

Replace `itnValidate` in `src/worker/pay.js` and add the new handler:

```javascript
// Payfast's published hosts for notification sources. Resolved at run time over
// DNS-over-HTTPS rather than hardcoded, because their addresses change and a
// stale hardcoded list fails closed on a real payment.
const PAYFAST_HOSTS = [
  'www.payfast.co.za',
  'w1w.payfast.co.za',
  'w2w.payfast.co.za',
  'sandbox.payfast.co.za',
];

let sourceCache = { at: 0, ips: new Set() };

async function payfastIps() {
  if (Date.now() - sourceCache.at < 3600_000 && sourceCache.ips.size) return sourceCache.ips;
  const ips = new Set();
  for (const host of PAYFAST_HOSTS) {
    for (const type of ['A', 'AAAA']) {
      const response = await fetch(
        `https://cloudflare-dns.com/dns-query?name=${host}&type=${type}`,
        { headers: { accept: 'application/dns-json' } }
      ).catch(() => null);
      if (!response || !response.ok) continue;
      const data = await response.json().catch(() => null);
      for (const answer of (data?.Answer || [])) {
        if (answer.type === 1 || answer.type === 28) ips.add(answer.data);
      }
    }
  }
  // Only replace a good cache with a good result: a DNS blip must not empty it.
  if (ips.size) sourceCache = { at: Date.now(), ips };
  return sourceCache.ips;
}

async function itnSource(request, env) {
  if (!authorised(request, env)) return json({ error: 'unauthorised' }, 401);
  const ip = new URL(request.url).searchParams.get('ip') || '';
  const ips = await payfastIps();
  // Fails closed: an empty set means we could not resolve, which is not a pass.
  return json({ sourceOk: ips.size > 0 && ips.has(ip), resolved: ips.size });
}

async function itnValidate(request, env) {
  if (!authorised(request, env)) return json({ error: 'unauthorised' }, 401);
  const raw = await request.text();
  const fields = {};
  for (const pair of raw.split('&')) {
    if (!pair) continue;
    const index = pair.indexOf('=');
    const key = decodeURIComponent((index === -1 ? pair : pair.slice(0, index)).replace(/\+/g, ' '));
    const value = index === -1 ? '' : decodeURIComponent(pair.slice(index + 1).replace(/\+/g, ' '));
    fields[key] = value;
  }

  const valid = validateNotify(fields, env.PAYFAST_PASSPHRASE || null);

  // Payfast's own server-side confirmation. This is what distinguishes a real
  // notification from a forgery that satisfies every local check.
  let confirmed = false;
  if (valid) {
    const response = await fetch(env.PAYFAST_VALIDATE_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: raw,
    }).catch(() => null);
    const text = response && response.ok ? (await response.text().catch(() => '')) : '';
    confirmed = text.trim().toUpperCase().startsWith('VALID');
  }

  return json({ valid, confirmed, fields });
}
```

Register the new route in `fetch`, before the `/pay/` match:

```javascript
if (pathname === '/_itn/source' && request.method === 'GET') return itnSource(request, env);
```

And add to `wrangler.pay.toml` under `[vars]`:

```toml
PAYFAST_VALIDATE_URL = "https://www.payfast.co.za/eng/query/validate"
```

**Confirm that URL and the host list against Payfast's current documentation before deploying.** Payfast has rebranded and moved endpoints before; this is exactly the kind of value that should be read from their docs on the day, not from memory. If the validate URL has moved, only this one `[vars]` line changes.

- [ ] **Step 2: Deploy and smoke-test both endpoints**

```bash
cd "/Users/santiu/Documents/Santi Office"
npx wrangler deploy --config wrangler.pay.toml
TOKEN=<the WORKER_TOKEN you set in Plan 2>

# source check: a Payfast IP passes, a random one does not
PF_IP=$(dig +short www.payfast.co.za | head -1)
curl -s -H "Authorization: Bearer $TOKEN" "https://pay.santiu.co.za/_itn/source?ip=$PF_IP"
curl -s -H "Authorization: Bearer $TOKEN" "https://pay.santiu.co.za/_itn/source?ip=8.8.8.8"

# validate: a forged body must come back valid:false
curl -s -H "Authorization: Bearer $TOKEN" -X POST \
  --data 'm_payment_id=SANTI-TEST&pf_payment_id=1&payment_status=COMPLETE&amount_gross=9250.00&signature=00000000000000000000000000000000' \
  https://pay.santiu.co.za/_itn/validate
```

Expected: `{"sourceOk":true,...}` then `{"sourceOk":false,...}`; and `{"valid":false,"confirmed":false,...}`. **`confirmed` must never be true when `valid` is false** — the code returns early, and this curl proves it.

- [ ] **Step 3: Commit**

```bash
git add src/worker/pay.js wrangler.pay.toml
git commit -m "Worker: Payfast server-side confirmation and DoH source checking"
```

---

### Task 3: W3 — the gate

**Files:**
- Create: `tools/create-deposit-workflow.py`
- Modify: `n8n/workflows/` via re-export

**Interfaces:**
- Consumes: the Worker's `/_itn/validate` and `/_itn/source`; `classify()` inlined into a Code node; ERPNext `svc-n8n` credentials; the custom fields and `Payfast ITN` doctype from Plan 2.
- Produces: webhook `POST /webhook/santi-deposit`, and a node named **`Verdict`** whose `jsCode` Task 4's test executes by name.

Node order, ported from `Resu — PayFast Handler v0.1` with Cloudflare KV replaced by ERPNext and WhatsApp replaced by email:

| # | Node | Notes |
|---|---|---|
| 1 | `Webhook — Payfast Notify` | POST, path `santi-deposit`, raw body kept, **Respond: Immediately** |
| 2 | `Prepare Raw Body` | Code: pass the raw form-encoded string through untouched — the signature is computed over exactly what arrived |
| 3 | `Worker — Validate ITN` | POST `/_itn/validate`, bearer, raw body. Response format **file**, decoded with `getBinaryDataBuffer` (this n8n returns an un-drained stream otherwise — a known trap, documented in Resu's own handler) |
| 4 | `Worker — Check Source` | GET `/_itn/source?ip={{ $('Webhook — Payfast Notify').first().json.headers['x-forwarded-for']?.split(',')[0]?.trim() }}` |
| 5 | `ERP — Find Quotation By Token` | GET Quotation filtered on `custom_quote_token = custom_str1`, fields incl. `custom_deposit_amount`, `customer`, `contact_email`, `title`, `name` |
| 6 | `Verdict` | Code: inline `classify()` + `ownsPayment()`, return `{ verdict, reason, itn, quotation }` |
| 7 | `IF — Verdict OK?` | false → `Alert — Rejected` (Telegram, names `reason`) → `ERP — Log Rejected ITN` (`status: Rejected`) → end |
| 8 | `ERP — Insert ITN` | POST `Payfast ITN` with `status: Verified`. **A duplicate insert fails here — that is the replay lock.** `neverError: true` so the failure is data, not a crash |
| 9 | `IF — Insert Succeeded?` | false → `Alert — Replay Ignored` → end (no records, no email) |
| 10 | `ERP — Create Sales Order` | from the Quotation, `docstatus` submitted, `custom_pf_payment_id` set |
| 11 | `ERP — Create Payment Entry` | Receive, party = Customer, allocated against that Sales Order as an advance, submitted |
| 12 | `ERP — Create Project` | `project_template: Client Onboarding`, `custom_start_token` (new 64-hex), `custom_start_expires` = +90 days, `custom_brief_status: Awaiting` |
| 13 | `ERP — Mark ITN Processed` | `status: Processed`, `sales_order`, `quotation` |
| 14 | `Send Receipt Email` | amount, date, reference, project name, `/start` link |
| 15 | `ERP — Comment On Project` | records that the receipt was sent, so the trail is on the record |
| 16 | `Alert — Paid` | Telegram |
| 17 | error path from 10–13 | `ERP — Mark ITN Failed` (`status: Failed`, `error`) → `Alert — Write Failed`. **No client email on this path** |

- [ ] **Step 1: Write the builder script scaffold**

```python
"""Builds the Santi deposit gate in n8n.

The Verdict node's body is read from src/core/ so the tested code and the
deployed code cannot drift. Everything else is node configuration, laid out to
match the table in the plan.
"""
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from n8n_api import list_workflows

ROOT = Path(__file__).resolve().parent.parent
NAME = 'Santi — Deposit Gate v0.1'
APPLY = '--apply' in sys.argv


def core(filename):
    return re.sub(r'^export ', '', (ROOT / 'src' / 'core' / filename).read_text(), flags=re.M)


verdict_code = core('deposit.js') + core('itn.js').replace(
    "import { ownsPayment } from './deposit.js';", ''
) + '''
// --- n8n entry point ---------------------------------------------------------
const validate = $('Worker — Validate ITN').first().json;
const source = $('Worker — Check Source').first().json;
const rows = $('ERP — Find Quotation By Token').first().json.data || [];
const quotation = rows[0] || null;

const out = classify({
  itn: validate.fields || {},
  valid: validate.valid === true,
  confirmed: validate.confirmed === true,
  sourceOk: source.sourceOk === true,
  expectedAmount: quotation ? quotation.custom_deposit_amount : null
});

return [{ json: {
  verdict: out.ok,
  reason: quotation ? out.reason : (out.ok ? 'unknown-quotation' : out.reason),
  itn: validate.fields || {},
  quotation
} }];
'''

if not APPLY:
    print('verdict node body:', len(verdict_code), 'chars')
    print('existing workflow:', [w['id'] for w in list_workflows() if w['name'] == NAME] or 'none')
    raise SystemExit('dry run — build the nodes per the plan table, then re-run with --apply')
```

Note the deliberate detail in that entry point: a passing verdict with **no** Quotation found is reported as `unknown-quotation`, not `ok`. Without that line, a payment whose token no longer resolves could pass with `expectedAmount: null` — which `classify` already refuses, but the reason would be misleading in the alert.

- [ ] **Step 2: Build the nodes and save the workflow inactive**

Run: `python3 tools/create-deposit-workflow.py`, then build the 17 nodes per the table. Save **inactive**.

- [ ] **Step 3: Export and write the node test**

```bash
python3 tools/export-workflows.py --write
```

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Runs the real deployed Verdict code. If someone edits the gate in the n8n UI
// and weakens a check, this fails.
const WORKFLOW = process.env.SANTI_DEPOSIT_WORKFLOW || 'n8n/workflows/santi-deposit-gate-v0-1.json';

function verdictCode() {
  const workflow = JSON.parse(readFileSync(WORKFLOW, 'utf8'));
  const node = workflow.nodes.find(n => n.name === 'Verdict');
  assert.ok(node, `${WORKFLOW} has no "Verdict" node`);
  return node.parameters.jsCode;
}

function runVerdict({ fields, valid = true, confirmed = true, sourceOk = true, quotation }) {
  const sources = {
    'Worker — Validate ITN': { valid, confirmed, fields },
    'Worker — Check Source': { sourceOk },
    'ERP — Find Quotation By Token': { data: quotation ? [quotation] : [] }
  };
  const $ = name => ({ first: () => ({ json: sources[name] }) });
  return new Function('$', verdictCode())($)[0].json;
}

const ours = {
  m_payment_id: 'SANTI-SAL-QTN-2026-00007',
  custom_str1: 'a'.repeat(64),
  payment_status: 'COMPLETE',
  amount_gross: '9250.00'
};
const quote = { name: 'SAL-QTN-2026-00007', custom_deposit_amount: 9250, customer: 'Clinic' };

test('the deployed gate passes a genuine deposit', () => {
  const out = runVerdict({ fields: ours, quotation: quote });
  assert.equal(out.verdict, true);
  assert.equal(out.reason, 'ok');
});

test('the deployed gate rejects a Resu payment as not ours', () => {
  const out = runVerdict({ fields: { ...ours, m_payment_id: 'thabo-nkosi', custom_str1: '' }, quotation: quote });
  assert.equal(out.verdict, false);
  assert.equal(out.reason, 'not-ours');
});

test('the deployed gate rejects a tampered amount', () => {
  const out = runVerdict({ fields: { ...ours, amount_gross: '1.00' }, quotation: quote });
  assert.equal(out.verdict, false);
  assert.equal(out.reason, 'amount-mismatch');
});

test('the deployed gate refuses an unconfirmed payment', () => {
  assert.equal(runVerdict({ fields: ours, confirmed: false, quotation: quote }).reason, 'unconfirmed');
});

test('the deployed gate refuses a payment from an unknown source', () => {
  assert.equal(runVerdict({ fields: ours, sourceOk: false, quotation: quote }).reason, 'bad-source');
});

test('a payment whose token no longer resolves never passes', () => {
  const out = runVerdict({ fields: ours, quotation: null });
  assert.equal(out.verdict, false);
  assert.equal(out.reason, 'unknown-quotation');
});
```

Run: `npm test`
Expected: all passing.

- [ ] **Step 4: Commit**

```bash
git add tools/create-deposit-workflow.py test/n8n-deposit-nodes.test.js n8n/workflows
git commit -m "W3: the deposit gate, five checks before any write"
```

---

### Task 4: Prove the replay lock and the failure path without paying

**Files:** none changed — verification by direct webhook calls.

- [ ] **Step 1: Confirm a forged ITN is rejected**

Activate the workflow, then:

```bash
curl -s -o /dev/null -w '%{http_code}\n' -X POST \
  --data 'm_payment_id=SANTI-FAKE&pf_payment_id=FORGED-1&payment_status=COMPLETE&amount_gross=9250.00&signature=00000000000000000000000000000000' \
  https://n8n.santi.co.za/webhook/santi-deposit
```

Expected: `200` (always 200 to Payfast), a Telegram alert naming `bad-signature`, **no** Sales Order, and a `Payfast ITN` row with `status: Rejected`:

```bash
cd erpnext && python3 -c "import lib; print(lib.get('Payfast ITN', fields=['name','status'], limit=5)); print(lib.get('Sales Order', fields=['name']))"
```

- [ ] **Step 2: Confirm the replay lock, using the doctype directly**

The signature cannot be forged, so the lock is proved at the layer that enforces it — the same check as Plan 2 Task 4 Step 3, now with the gate's own status values:

```bash
cd erpnext && python3 - <<'EOF'
import lib
row = dict(pf_payment_id='REPLAY-PROOF-1', payment_status='COMPLETE', amount_gross=9250, status='Verified')
print('first :', lib.create('Payfast ITN', row)['name'])
try:
    lib.create('Payfast ITN', row)
    raise SystemExit('FAIL: duplicate accepted — the gate can double-process a retry')
except lib.ErpError:
    print('second: rejected, as the gate relies on')
lib._request('DELETE', '/api/resource/Payfast ITN/REPLAY-PROOF-1')
EOF
```

- [ ] **Step 3: Confirm the failure path emails nobody**

In n8n, temporarily break `ERP — Create Sales Order` (point its URL at `/api/resource/NoSuchDoctype`), replay the forged request from Step 1 with a *valid* verdict path if you have one, or trigger the node manually with n8n's *Execute Node*. Expected: `Payfast ITN.status = Failed` with `error` populated, a Telegram alert, and **no receipt email in your inbox**. Then restore the URL.

- [ ] **Step 4: Clean up and record**

```bash
cd erpnext && python3 -c "
import lib
for row in lib.get('Payfast ITN', fields=['name'], limit=50):
    if row['name'].startswith(('FORGED-','REPLAY-PROOF-','TEST-')):
        lib._request('DELETE', '/api/resource/Payfast ITN/' + row['name']); print('deleted', row['name'])
"
```

- [ ] **Step 5: Commit the verification record**

```bash
cat >> docs-verified.md <<'EOF'
## Plan 3 — gate verified without payment
Forged ITN rejected (bad-signature), logged Rejected, no Sales Order, 200 returned.
Duplicate Payfast ITN insert rejected by autonaming. Write-failure path sets
status Failed and sends no client email.
EOF
git add docs-verified.md && git commit -m "Record gate verification (forged, replayed, failed-write)"
```

---

### Task 5: Live acceptance — one real payment

**Files:** none changed.

There is no sandbox. This is the only way to prove the gate, and it is how Resu was proved.

- [ ] **Step 1: Create a minimum-value throwaway Quotation**

```bash
cd erpnext && python3 - <<'EOF'
import lib
company = lib.get('Company', fields=['name'])[0]['name']
customer = lib.get('Customer', fields=['name'])[0]['name']
q = lib.create('Quotation', {
    'quotation_to': 'Customer', 'party_name': customer, 'company': company,
    'title': 'GATE ACCEPTANCE 2026-09-27 — do not deliver',
    'contact_email': 'zukosanti@gmail.com', 'custom_deposit_percent': 50,
    'items': [{'item_code': 'SVC-WEB', 'qty': 1, 'rate': 10}],
})
print(q['name'], 'deposit will be R5.00')
EOF
```

- [ ] **Step 2: Submit it, then record the before-state**

Submit in the UI (W2 fires, token stored, email to you). Then:

```bash
cd erpnext && python3 -c "
import lib
for dt in ('Sales Order','Project','Payfast ITN'):
    print(dt, len(lib.get(dt, fields=['name'], limit=500)))
"
```

- [ ] **Step 3: Pay the R5 deposit for real**

Open the `/quote` link from the email, click through, and complete the payment with a real card. **This charges R5.**

- [ ] **Step 4: Assert exactly one of each**

```bash
cd erpnext && python3 - <<'EOF'
import lib
itn = lib.get('Payfast ITN', fields=['name','status','amount_gross','sales_order'], limit=5)
print('itn:', itn)
so = lib.get('Sales Order', fields=['name','grand_total','custom_pf_payment_id'], limit=5)
print('sales orders:', so)
projects = lib.get('Project', fields=['name','project_name','custom_start_token','custom_brief_status'], limit=5)
print('projects:', projects)
pe = lib.get('Payment Entry', fields=['name','paid_amount'], limit=5)
print('payment entries:', pe)
EOF
```

Expected, exactly: one `Payfast ITN` with `status: Processed` and `amount_gross: 5`; one Sales Order carrying `custom_pf_payment_id`; one Project with a 64-hex `custom_start_token` and `custom_brief_status: Awaiting`; one Payment Entry of R5. A receipt email in your inbox. A Telegram `Alert — Paid`.

- [ ] **Step 5: Prove the replay defence against the real ITN**

In n8n, open the successful execution of `Webhook — Payfast Notify`, copy the raw body, and POST it again:

```bash
curl -s -o /dev/null -w '%{http_code}\n' -X POST --data '<the exact raw body>' https://n8n.santi.co.za/webhook/santi-deposit
```

Expected: `200`, a Telegram `Alert — Replay Ignored`, and **no second** Sales Order, Payment Entry or Project. Re-run the Step 4 query to confirm the counts are unchanged. This is the single most important assertion in the plan.

- [ ] **Step 6: Confirm Resu was not disturbed**

```bash
cd /Users/santiu/Documents/Resu/Source && npm test 2>&1 | tail -5
```

Expected: Resu's suite still passes. Also check Telegram for any `Resu —` alert fired during the test: a Santi ITN must not have reached Resu's handler. If one did, Resu correctly rejected it as an unknown slug, but the noise is worth knowing about.

- [ ] **Step 7: Clean up and record**

Cancel the acceptance Sales Order, Payment Entry and Quotation in ERPNext (cancel, do not delete — the numbering series and the audit trail stay honest). Delete the acceptance Project's Tasks then the Project. Write off the R5.

```bash
cat >> docs-verified.md <<'EOF'
## 2026-09-27 — gate accepted live
One real R5 deposit produced exactly one Payfast ITN (Processed), one Sales
Order, one Payment Entry and one Project with a start token; the receipt email
arrived. Replaying the identical raw ITN produced no second records. Resu's
suite still passed afterwards. Acceptance records cancelled; R5 written off.
EOF
git add docs-verified.md && git commit -m "Record live acceptance of the deposit gate"
```

---

### Task 6: Turn it on

- [ ] **Step 1: Confirm the whole chain is active**

`Santi — Quote & Pay Link v0.1` active, `Santi — Deposit Gate v0.1` active, the Frappe Quotation webhook enabled, `santi-pay` deployed, `/quote` live on santi.co.za.

- [ ] **Step 2: Remove the Plan 2 safety rule from your own habits**

Plan 2 forbade sending a quote to a real client because no gate existed. That restriction is now lifted. Quotes may go to clients.

- [ ] **Step 3: Send the first real quote and watch it**

Pick one real enquiry. Raise the Quotation, submit, confirm the email and `/quote` page look right, and watch the Telegram alerts. Do not batch — one client through the whole flow first.

- [ ] **Step 4: Commit the state note**

```bash
cat >> docs-verified.md <<'EOF'
## Gate live
Quote -> deposit -> Sales Order + Payment Entry + Project + /start token is live
end to end. /start itself is Plan 4; until then the receipt email's link 404s,
so keep the link out of the receipt template until Plan 4 ships.
EOF
git add docs-verified.md && git commit -m "Gate is live"
```

**Read that note carefully:** the Project's `/start` token exists from now on, but the page that consumes it does not until Plan 4. Until then the **receipt email must not contain the `/start` link** — it would 404 on a paying client. Either hold the link back in the template or ship Plan 4 immediately after.

---

### Task 7 (optional): Backport the two missing checks to Resu

Resu takes real money with no source check and no Payfast server-side confirmation. Additive change only.

- [ ] **Step 1: Copy the two handlers across**

Port `itnSource` and the `confirmed` half of `itnValidate` from `Santi Office/src/worker/pay.js` into `Resu/Source/src/worker/pay.js`, add `PAYFAST_VALIDATE_URL` to `wrangler.pay.toml`.

- [ ] **Step 2: Run Resu's suite before deploying anything**

Run: `cd /Users/santiu/Documents/Resu/Source && npm test`
Expected: 466+ passing. **A single failure means stop** — Resu has live customers.

- [ ] **Step 3: Add the checks to Resu's handler behind an alert-only mode first**

Wire `Worker — Check Source` into `Resu — PayFast Handler v0.1` so a failure **alerts but does not block**, for two weeks. Real Payfast traffic proves the check before it can refuse a real customer's payment.

- [ ] **Step 4: Only then make it blocking**

After two weeks with no false positive, move it ahead of activation. Re-export, re-run the suite, commit in the Resu repo.

---

## Self-review

**Spec coverage:** §6 W3 (Tasks 1–3), §3's Payfast rules 1–5 (Task 1 `classify`, Task 2 Worker), §8 failure handling (Task 4 Step 3), §9 tests and live acceptance (Tasks 3–5), §13 optional backport (Task 7). Not covered, by design: `/start` and W5 (Plan 4), W4 and W6 reconciliation (Plan 5).

**Interface consistency:** `classify({ itn, valid, confirmed, sourceOk, expectedAmount })` → `{ ok, reason }` is spelled identically in `src/core/itn.js`, `test/itn.test.js`, the inlined `Verdict` node, and `test/n8n-deposit-nodes.test.js`. `ownsPayment` comes from Plan 2's `deposit.js` and the import line is stripped when inlining, which is why `deposit.js` is concatenated first. The Worker's `{ valid, confirmed, fields }` and `{ sourceOk }` shapes match what `Verdict` reads.

**Gaps I am naming rather than papering over:**
- `PAYFAST_VALIDATE_URL` and the host list must be checked against Payfast's live documentation on the day (Task 2 Step 1 says so). I am not asserting those from memory.
- Task 4 Step 3 tests the failure path by breaking a node by hand. That is genuinely awkward and the least rigorous step here; it is included because "no receipt for a record that does not exist" is too important to leave unexercised.
- Task 5 charges R5 of real money. There is no alternative — the spec records why.
- The `/start` link must be held out of the receipt template until Plan 4 (Task 6 Step 4). This is the one ordering hazard in the whole build.
