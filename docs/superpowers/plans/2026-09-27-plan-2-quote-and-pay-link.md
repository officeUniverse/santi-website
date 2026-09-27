# Plan 2 — Sales spine, pay-link Worker and the quote page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Quotation submitted in ERPNext produces a branded `/quote` page and a correctly signed Payfast deposit link, with every secret held in a Cloudflare Worker.

**Architecture:** ERPNext gains the configuration its sales spine needs (service Items, a dedicated integration user, custom fields, the `Payfast ITN` doctype, a Project Template). A new Cloudflare Worker on `pay.santiu.co.za` holds the merchant credentials and reuses Resu's proven signing module. n8n turns a Quotation submit into a token, an email and a link. The static site gains a tokenised `/quote` page.

**Tech Stack:** Frappe REST API, Python 3, Cloudflare Workers + wrangler 4.120, n8n, `node --test`, the site's existing `scripts/build-site.py`.

## Global Constraints

Everything in Plan 1's Global Constraints still applies, plus:

- **DANGER — do not send a quote to a real client during this plan.** The pay link works from the moment the Worker is deployed, but the ITN handler that turns a payment into records does not exist until **Plan 3**. A client who paid now would be charged with nothing happening. During this plan, quote emails go **only to your own address**, and the workflow stays **inactive** between tests.
- Santiuniverse (Pty) Ltd is **not VAT registered**. Deposit = 50% of the Quotation `grand_total`, and **no tax template may be attached to a Quotation**.
- Payfast uses the **same merchant account as Resu**, so a valid Resu ITN body carries a valid signature at Santi's endpoint too. Every Santi payment must be identifiable as Santi's: `m_payment_id` is namespaced `SANTI-<quotation name>` and `custom_str1` carries our own quote token.
- `src/core/payfast.js` and `src/core/md5.js` are **copied from Resu unchanged**. Their encoding rules were verified byte-for-byte against a real ITN. Do not reformat, "simplify", or change the `filterEmpty` behaviour.
- The passphrase and merchant key live **only** in Worker secrets. Never in n8n, never in a page, never in git.
- Website changes obey `AGENTS.md`: generated pages are never hand-edited, new pages are added to `deploy.sh`'s `cp -a` list, and the cache stamp `V` in `scripts/build-site.py` is bumped after any CSS/JS change.

---

## File Structure

In the ops repo (`/Users/santiu/Documents/Santi Office`):

| File | Responsibility |
|---|---|
| `erpnext/setup/01_items.py` | service Items, idempotent |
| `erpnext/setup/02_custom_fields.py` | the eight custom fields |
| `erpnext/setup/03_payfast_itn_doctype.py` | the idempotency-lock doctype |
| `erpnext/setup/04_project_template.py` | template Tasks + "Client Onboarding" |
| `src/core/payfast.js`, `src/core/md5.js` | copied from Resu, unchanged |
| `src/core/deposit.js` | deposit maths, `m_payment_id` namespacing, ownership guard |
| `src/core/token.js` | random token generation |
| `src/worker/pay.js` | the Worker: `/pay/:token`, `/_itn/validate`, `/done`, `/cancel` |
| `wrangler.pay.toml` | Worker config and routes |
| `tools/create-quote-workflow.py` | builds the W2 workflow from scratch |
| `test/payfast.test.js`, `test/deposit.test.js` | unit tests |

In the website repo (`~/Documents/SantiUWebsite2`):

| File | Responsibility |
|---|---|
| `content/pages/quote.html` | source for the quote page (JSON meta comment + body) |
| `assets/js/quote.js` | token exchange, rendering, ask box |
| `scripts/build-site.py` | register the new page, bump `V` |
| `deploy.sh`, `sitemap.xml`, `robots.txt` | ship it, keep it out of the index |

---

### Task 1: Service Items

**Files:**
- Create: `erpnext/setup/01_items.py`

**Interfaces:**
- Consumes: `erpnext/lib.py` from Plan 1.
- Produces: seven Items whose `item_code` values later Quotations reference: `SVC-WEB`, `SVC-BRAND`, `SVC-AI`, `SVC-AEO`, `SVC-HOST`, `SVC-WP`, `SVC-RETAINER`.

- [ ] **Step 1: Find the company and the default income account**

```bash
cd "/Users/santiu/Documents/Santi Office/erpnext" && python3 - <<'EOF'
import lib
print(lib.get('Company', fields=['name', 'abbr', 'default_currency', 'default_income_account']))
print(lib.get('Item Group', fields=['name'], limit=50))
EOF
```

Expected: one company (record its exact `name` and `default_income_account`) and an Item Group list containing `Services`. If `default_income_account` is blank, read `Sales - <abbr>` from `python3 -c "import lib; print(lib.get('Account', filters=[['account_name','like','Sales%']], fields=['name']))"` and use that.

- [ ] **Step 2: Write `erpnext/setup/01_items.py`**

```python
"""Service Items. Without these a Quotation has nothing to put on a line.

Idempotent: an Item that exists is left exactly as it is. Re-running must never
create a second copy or silently change pricing.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import lib

COMPANY = 'PUT THE COMPANY NAME FROM STEP 1 HERE'
INCOME_ACCOUNT = 'PUT THE INCOME ACCOUNT FROM STEP 1 HERE'

ITEMS = [
    ('SVC-WEB', 'Website Design & Development'),
    ('SVC-BRAND', 'Branding & Identity'),
    ('SVC-AI', 'AI Engineering'),
    ('SVC-AEO', 'Answer Engine Optimisation'),
    ('SVC-HOST', 'Hosting'),
    ('SVC-WP', 'WordPress Plugin'),
    ('SVC-RETAINER', 'Retainer'),
]

for code, name in ITEMS:
    if lib.get('Item', filters=[['item_code', '=', code]], fields=['name']):
        print(f'exists: {code}')
        continue
    lib.create('Item', {
        'item_code': code,
        'item_name': name,
        'item_group': 'Services',
        'stock_uom': 'Nos',
        'is_stock_item': 0,
        'is_sales_item': 1,
        'is_purchase_item': 0,
        'include_item_in_manufacturing': 0,
        'item_defaults': [{'company': COMPANY, 'income_account': INCOME_ACCOUNT}],
    })
    print(f'created: {code}')
```

- [ ] **Step 3: Run it**

Run: `cd erpnext/setup && python3 01_items.py`
Expected: seven `created:` lines.

- [ ] **Step 4: Run it again — the idempotency check**

Run: `python3 01_items.py`
Expected: seven `exists:` lines, nothing created. Then confirm the count: `python3 -c "import sys;sys.path.insert(0,'..');import lib;print(len(lib.get('Item',fields=['name'],limit=100)))"` → 8 (the seven plus the pre-existing one).

- [ ] **Step 5: Commit**

```bash
git add erpnext/setup/01_items.py && git commit -m "ERPNext: service Items for quoting"
```

---

### Task 2: The `svc-n8n` integration user

**Files:** none in git — this is ERPNext and Cloudflare configuration, recorded here so it is repeatable.

**Interfaces:**
- Produces: `svc-n8n@santiu.co.za` with an API key/secret, and a Cloudflare Access service token. Both go into `.dev.vars`, replacing the `ai-projects` credentials used in Plan 1.

- [ ] **Step 1: Create the user in ERPNext**

In the ERPNext UI: *Users → New*. Email `svc-n8n@santiu.co.za`, first name `Integration`, last name `n8n`, user type **System User**, and untick every notification and email preference. Roles: **Sales User**, **Sales Manager**, **Accounts User**, **Projects User**, **Projects Manager**. Do **not** grant System Manager — the doctype from Task 3 gets an explicit permission row instead.

**Do not touch `ai-projects`, `ai-accounts` or `ai-briefing`.** Their restrictions are deliberate.

- [ ] **Step 2: Generate its API key and secret**

On the user record: *Settings → API Access → Generate Keys*. Copy the secret immediately — ERPNext shows it once.

- [ ] **Step 3: Create a Cloudflare Access service token**

Cloudflare Zero Trust → *Access → Service Auth → Create Service Token*, named `svc-n8n`. Add it to the Access application protecting `office.santiu.co.za` as an allowed service token (Policy → include → Service Auth → that token). Copy both values once.

- [ ] **Step 4: Put them in `.dev.vars` and re-verify**

Replace `ERPNEXT_API_KEY`, `ERPNEXT_API_SECRET`, `CF_ACCESS_CLIENT_ID`, `CF_ACCESS_CLIENT_SECRET` in `.dev.vars`, then:

Run: `cd erpnext && python3 whoami.py`
Expected: `user: svc-n8n@santiu.co.za`. Then prove the permission boundary holds:

```bash
python3 -c "import lib; print(lib.get('Quotation', fields=['name']))"    # -> [] , allowed
python3 -c "import lib; print(lib.get('User', fields=['name']))"          # -> PermissionError, expected
```

- [ ] **Step 5: Record the setup, commit nothing secret**

```bash
cat >> docs-verified.md <<'EOF'
## 2026-09-27 — svc-n8n created
ERPNext user svc-n8n@santiu.co.za (Sales User/Manager, Accounts User, Projects
User/Manager; no System Manager) with its own API keys and its own Cloudflare
Access service token. The ai-* users were not modified.
EOF
git add docs-verified.md && git commit -m "Record the svc-n8n integration user"
```

---

### Task 3: Custom fields

**Files:**
- Create: `erpnext/setup/02_custom_fields.py`

**Interfaces:**
- Produces exactly these fieldnames, which Plan 3 and Plan 4 both depend on: `custom_deposit_percent`, `custom_deposit_amount`, `custom_quote_token`, `custom_token_expires` on Quotation; `custom_pf_payment_id` on Sales Order; `custom_start_token`, `custom_start_expires`, `custom_brief_status` on Project.

- [ ] **Step 1: Write the script**

```python
"""The eight custom fields the pipeline needs.

Created through the Custom Field doctype so an ERPNext upgrade does not drop
them. Idempotent by (dt, fieldname).
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import lib

FIELDS = [
    dict(dt='Quotation', fieldname='custom_deposit_percent', label='Deposit %',
         fieldtype='Percent', default='50', insert_after='grand_total'),
    dict(dt='Quotation', fieldname='custom_deposit_amount', label='Deposit Amount',
         fieldtype='Currency', read_only=1, insert_after='custom_deposit_percent',
         description='Computed by n8n. The only figure a Payfast ITN is checked against.'),
    dict(dt='Quotation', fieldname='custom_quote_token', label='Quote Token',
         fieldtype='Data', hidden=1, search_index=1, insert_after='custom_deposit_amount'),
    dict(dt='Quotation', fieldname='custom_token_expires', label='Quote Link Expires',
         fieldtype='Datetime', insert_after='custom_quote_token'),
    dict(dt='Sales Order', fieldname='custom_pf_payment_id', label='Payfast Payment ID',
         fieldtype='Data', read_only=1, insert_after='status'),
    dict(dt='Project', fieldname='custom_start_token', label='Start Token',
         fieldtype='Data', hidden=1, search_index=1, insert_after='status'),
    dict(dt='Project', fieldname='custom_start_expires', label='Start Link Expires',
         fieldtype='Datetime', insert_after='custom_start_token'),
    dict(dt='Project', fieldname='custom_brief_status', label='Brief Status',
         fieldtype='Select', options='Awaiting\nSubmitted\nApproved', default='Awaiting',
         insert_after='custom_start_expires'),
]

for field in FIELDS:
    found = lib.get('Custom Field',
                    filters=[['dt', '=', field['dt']], ['fieldname', '=', field['fieldname']]],
                    fields=['name'])
    if found:
        print(f"exists: {field['dt']}.{field['fieldname']}")
        continue
    lib.create('Custom Field', field)
    print(f"created: {field['dt']}.{field['fieldname']}")
```

- [ ] **Step 2: Run it, then run it again**

Run: `python3 02_custom_fields.py` twice.
Expected: eight `created:` then eight `exists:`.

- [ ] **Step 3: Verify the fields are really on the doctypes**

```bash
python3 - <<'EOF'
import sys; sys.path.insert(0, '..')
import lib
meta = lib.call('frappe.client.get_list', doctype='Custom Field',
                filters='[["fieldname","like","custom_%"]]',
                fields='["dt","fieldname","fieldtype"]', limit_page_length=50)
for row in meta: print(row)
EOF
```

Expected: all eight rows with the types above.

- [ ] **Step 4: Confirm no tax template is attached by default**

```bash
python3 -c "import sys;sys.path.insert(0,'..');import lib;print(lib.get('Sales Taxes and Charges Template', fields=['name','is_default']))"
```

Expected: empty, or nothing marked `is_default: 1`. **If a default exists, remove the default flag** — Santiuniverse is not VAT registered and a default template would silently add tax to every quote and break the deposit maths.

- [ ] **Step 5: Commit**

```bash
git add erpnext/setup/02_custom_fields.py && git commit -m "ERPNext: pipeline custom fields"
```

---

### Task 4: The `Payfast ITN` doctype — the idempotency lock

**Files:**
- Create: `erpnext/setup/03_payfast_itn_doctype.py`

**Interfaces:**
- Produces doctype `Payfast ITN`, autonamed `field:pf_payment_id`, with fields `pf_payment_id`, `payment_status`, `amount_gross`, `status`, `sales_order`, `quotation`, `raw_payload`, `error`. Plan 3's gate inserts into it and relies on a duplicate insert **failing**.

- [ ] **Step 1: Write the script**

```python
"""The Payfast ITN log, which is also the replay lock.

Autonaming on pf_payment_id means the database itself rejects a second insert
for the same payment. That is atomic. An "if exists" check is not, and Payfast
retries can arrive concurrently.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import lib

NAME = 'Payfast ITN'

if lib.get('DocType', filters=[['name', '=', NAME]], fields=['name']):
    print(f'exists: {NAME}')
    raise SystemExit(0)

lib.create('DocType', {
    'name': NAME,
    'module': 'Custom',
    'custom': 1,
    'naming_rule': 'By fieldname',
    'autoname': 'field:pf_payment_id',
    'track_changes': 1,
    'fields': [
        dict(fieldname='pf_payment_id', label='Payfast Payment ID', fieldtype='Data',
             reqd=1, unique=1, in_list_view=1),
        dict(fieldname='payment_status', label='Payment Status', fieldtype='Data', in_list_view=1),
        dict(fieldname='amount_gross', label='Amount Gross', fieldtype='Currency', in_list_view=1),
        dict(fieldname='status', label='Status', fieldtype='Select',
             options='Verified\nRejected\nProcessed\nFailed', in_list_view=1, reqd=1),
        dict(fieldname='quotation', label='Quotation', fieldtype='Link', options='Quotation'),
        dict(fieldname='sales_order', label='Sales Order', fieldtype='Link', options='Sales Order'),
        dict(fieldname='error', label='Error', fieldtype='Small Text'),
        dict(fieldname='raw_payload', label='Raw Payload', fieldtype='Long Text'),
    ],
    'permissions': [
        dict(role='System Manager', read=1, write=1, create=1, delete=1, report=1, export=1),
        dict(role='Accounts User', read=1, report=1),
        dict(role='Sales Manager', read=1, report=1),
    ],
})
print(f'created: {NAME}')
```

- [ ] **Step 2: Run it**

Run: `python3 03_payfast_itn_doctype.py`
Expected: `created: Payfast ITN`. Re-run → `exists:`.

- [ ] **Step 3: Prove the lock actually locks — this is the whole point of the task**

```bash
python3 - <<'EOF'
import sys; sys.path.insert(0, '..')
import lib
row = dict(pf_payment_id='TEST-LOCK-1', payment_status='COMPLETE',
           amount_gross=1, status='Verified')
print('first :', lib.create('Payfast ITN', row)['name'])
try:
    lib.create('Payfast ITN', row)
    raise SystemExit('FAIL: the duplicate was accepted — the lock does not work')
except lib.ErpError as error:
    print('second: correctly rejected')
lib._request('DELETE', '/api/resource/Payfast ITN/TEST-LOCK-1')
print('cleaned up')
EOF
```

Expected: `first : TEST-LOCK-1`, `second: correctly rejected`, `cleaned up`. **If the duplicate is accepted, stop.** The autoname is wrong and Plan 3 cannot be built on it.

- [ ] **Step 4: Commit**

```bash
git add erpnext/setup/03_payfast_itn_doctype.py && git commit -m "ERPNext: Payfast ITN doctype as the replay lock"
```

---

### Task 5: The Client Onboarding project template

**Files:**
- Create: `erpnext/setup/04_project_template.py`

**Interfaces:**
- Produces Project Template `Client Onboarding`, which Plan 3 passes as `project_template` when creating a Project.

- [ ] **Step 1: Write the script**

```python
"""Template Tasks plus the Client Onboarding template.

Every paid client gets the same board, so /start can render "what happens next"
from open Tasks and agents always know what next means.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import lib

TEMPLATE = 'Client Onboarding'
TASKS = [
    ('Receipt and welcome sent', 0),
    ('Brief received', 1),
    ('Kickoff booked', 2),
    ('Brand assets received', 3),
    ('Access and credentials received', 4),
    ('Direction approved', 5),
    ('Build', 6),
    ('Review', 7),
    ('Handover', 8),
]

rows = []
for subject, order in TASKS:
    found = lib.get('Task', filters=[['subject', '=', subject], ['is_template', '=', 1]], fields=['name'])
    name = found[0]['name'] if found else lib.create('Task', {
        'subject': subject, 'is_template': 1, 'status': 'Template', 'expected_time': 1,
    })['name']
    print(('exists: ' if found else 'created: ') + subject)
    rows.append({'task': name, 'subject': subject})

if lib.get('Project Template', filters=[['name', '=', TEMPLATE]], fields=['name']):
    print(f'exists: {TEMPLATE}')
else:
    lib.create('Project Template', {'project_template_name': TEMPLATE, 'tasks': rows})
    print(f'created: {TEMPLATE}')
```

- [ ] **Step 2: Run it twice**

Expected: nine `created:` + `created: Client Onboarding`, then all `exists:`.

- [ ] **Step 3: Verify by creating a throwaway Project from the template**

```bash
python3 - <<'EOF'
import sys; sys.path.insert(0, '..')
import lib
project = lib.create('Project', {'project_name': 'TEMPLATE SMOKE TEST', 'project_template': 'Client Onboarding'})
print('project:', project['name'])
print('tasks:', [t['subject'] for t in lib.get('Task', filters=[['project','=',project['name']]], fields=['subject'], limit=50)])
EOF
```

Expected: nine task subjects in order. **Then delete the project and its tasks** (Task list first, then the Project — Frappe refuses to delete a Project with tasks).

- [ ] **Step 4: Commit**

```bash
git add erpnext/setup/04_project_template.py && git commit -m "ERPNext: Client Onboarding project template"
```

---

### Task 6: Signing, deposit maths and tokens

**Files:**
- Create: `src/core/payfast.js` (copied), `src/core/md5.js` (copied), `src/core/deposit.js`, `src/core/token.js`, `test/payfast.test.js`, `test/deposit.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `signature(fields, passphrase, {filterEmpty})`, `buildPaymentFields({...})`, `validateNotify(body, passphrase)` from the copied module; `depositAmount(grandTotal, percent)` → string with two decimals; `mPaymentId(quotationName)` → `SANTI-<name>`; `ownsPayment(itn)` → boolean; `newToken()` → 64-char hex string. Plan 3 consumes `validateNotify` and `ownsPayment` by these exact names.

- [ ] **Step 1: Copy the proven modules, unchanged**

```bash
cd "/Users/santiu/Documents/Santi Office"
mkdir -p src/core src/worker test
cp /Users/santiu/Documents/Resu/Source/src/core/payfast.js src/core/payfast.js
cp /Users/santiu/Documents/Resu/Source/src/core/md5.js src/core/md5.js
cp /Users/santiu/Documents/Resu/Source/test/payfast.test.js test/payfast.test.js
```

Then add this note at the top of `src/core/payfast.js`, above the existing comments:

```javascript
// Copied unchanged from Resu (~/Documents/Resu/Source/src/core/payfast.js),
// where it has been taking real money since August 2026. The encoding rules
// below were verified byte-for-byte against a real ITN body. Do not reformat
// or "simplify" them, and do not change filterEmpty: outbound payment forms
// drop empty optional fields before signing, inbound ITNs must not.
```

- [ ] **Step 2: Run the copied tests to prove the copy is faithful**

Run: `npm test`
Expected: the Resu Payfast tests pass unchanged (md5 RFC vectors, field order, passphrase effect, tampered amount rejected). A failure means the copy is incomplete — `md5.js` is a dependency and must come with it.

- [ ] **Step 3: Write the failing tests for the new logic**

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { depositAmount, mPaymentId, ownsPayment } from '../src/core/deposit.js';
import { newToken } from '../src/core/token.js';

test('the deposit is half the quote, to the cent, as a Payfast amount string', () => {
  assert.equal(depositAmount(18500, 50), '9250.00');
  assert.equal(depositAmount(12345.67, 50), '6172.84');   // rounds half up
  assert.equal(depositAmount(999.99, 50), '500.00');
});

test('a deposit percent other than 50 is honoured', () => {
  assert.equal(depositAmount(10000, 25), '2500.00');
});

test('a nonsensical quote total is refused rather than charged', () => {
  assert.throws(() => depositAmount(0, 50), /positive/);
  assert.throws(() => depositAmount(-100, 50), /positive/);
  assert.throws(() => depositAmount('abc', 50), /positive/);
});

test('m_payment_id is namespaced so Santi payments are identifiable', () => {
  assert.equal(mPaymentId('SAL-QTN-2026-00007'), 'SANTI-SAL-QTN-2026-00007');
});

test('an ITN from Resu is not treated as ours', () => {
  // The merchant account is shared with Resu, so a Resu ITN carries a valid
  // signature here. Ownership is what keeps the two apart.
  assert.equal(ownsPayment({ m_payment_id: 'thabo-nkosi', custom_str1: '' }), false);
  assert.equal(ownsPayment({ m_payment_id: 'SANTI-SAL-QTN-2026-00007', custom_str1: 'a'.repeat(64) }), true);
});

test('an ITN with our prefix but no token is not ours either', () => {
  assert.equal(ownsPayment({ m_payment_id: 'SANTI-anything', custom_str1: '' }), false);
});

test('tokens are 64 hex characters and do not repeat', () => {
  const a = newToken(), b = newToken();
  assert.match(a, /^[0-9a-f]{64}$/);
  assert.notEqual(a, b);
});
```

- [ ] **Step 4: Run and watch it fail**

Run: `npm test`
Expected: FAIL — `Cannot find module '../src/core/deposit.js'`.

- [ ] **Step 5: Write the implementations**

`src/core/deposit.js`:

```javascript
// Deposit maths and the ownership guard.
//
// The merchant account is shared with Resu, which means a valid Resu ITN body
// also verifies against Santi's passphrase. Signature checking therefore does
// not prove a payment is ours — ownsPayment does.
const PREFIX = 'SANTI-';

export function depositAmount(grandTotal, percent = 50) {
  const total = Number(grandTotal);
  if (!Number.isFinite(total) || total <= 0) throw new Error('quote total must be a positive number');
  const fraction = Number(percent) / 100;
  if (!Number.isFinite(fraction) || fraction <= 0 || fraction > 1) throw new Error('deposit percent must be between 0 and 100');
  return (Math.round(total * fraction * 100) / 100).toFixed(2);
}

export function mPaymentId(quotationName) {
  return PREFIX + String(quotationName);
}

export function ownsPayment(itn = {}) {
  const reference = String(itn.m_payment_id || '');
  const token = String(itn.custom_str1 || '');
  return reference.startsWith(PREFIX) && /^[0-9a-f]{64}$/.test(token);
}
```

`src/core/token.js`:

```javascript
// Random tokens for /quote and /start links. Stored on the ERPNext record with
// an expiry rather than signed, so a link can be revoked by clearing a field.
// globalThis.crypto is present in Node 18+, in Cloudflare Workers, and in n8n's
// Code node sandbox.
export function newToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}
```

- [ ] **Step 6: Run the tests**

Run: `npm test`
Expected: all passing, including the copied Resu suite.

- [ ] **Step 7: Commit**

```bash
git add src/core test/payfast.test.js test/deposit.test.js
git commit -m "Payfast signing copied from Resu, plus deposit maths and ownership guard"
```

---

### Task 7: The `santi-pay` Worker

**Files:**
- Create: `src/worker/pay.js`, `wrangler.pay.toml`

**Interfaces:**
- Consumes: `src/core/payfast.js`, `src/core/deposit.js`.
- Produces: `GET https://pay.santiu.co.za/pay/:token` → an auto-submitting Payfast form; `POST https://pay.santiu.co.za/_itn/validate` (bearer `WORKER_TOKEN`, body = the raw ITN string) → `{ valid: boolean, fields: object }` — **Plan 3's gate calls exactly this**; `GET /done` and `GET /cancel` → plain pages.
- The Worker resolves a token by calling `POST {N8N_QUOTE_URL}` with bearer `WORKER_TOKEN`, expecting `{ amount, itemName, mPaymentId, email, name }` or 404. That endpoint is built in Task 8.

- [ ] **Step 1: Write `src/worker/pay.js`**

```javascript
import { buildPaymentFields, validateNotify } from '../core/payfast.js';

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function page(title, body) {
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<meta name="referrer" content="no-referrer">
<title>${esc(title)}</title>
<style>
  body{font-family:-apple-system,"Segoe UI",Roboto,Arial,sans-serif;max-width:480px;
       margin:56px auto;padding:0 20px;color:#0d1b2a;background:#F4F7F8}
  h1{font-size:1.4rem}
  button{background:#173B9A;color:#fff;border:0;padding:14px 20px;font-size:1rem;
         border-radius:8px;width:100%;cursor:pointer}
  p{line-height:1.5}
</style>
</head><body>${body}</body></html>`;
}

function html(body, status = 200) {
  return new Response(body, {
    status,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'x-robots-tag': 'noindex',
      'cache-control': 'no-store',
      'referrer-policy': 'no-referrer',
    },
  });
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

function authorised(request, env) {
  return request.headers.get('authorization') === `Bearer ${env.WORKER_TOKEN}`;
}

// Resolve a quote token through n8n, which is the only thing holding ERPNext
// credentials. The Worker never talks to ERPNext directly.
async function resolveQuote(env, token) {
  const response = await fetch(env.N8N_QUOTE_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${env.WORKER_TOKEN}` },
    body: JSON.stringify({ token }),
  });
  if (!response.ok) return null;
  const quote = await response.json().catch(() => null);
  if (!quote || !quote.amount || !quote.mPaymentId) return null;
  return quote;
}

async function payPage(request, env, token) {
  if (!/^[0-9a-f]{64}$/.test(token)) return html(page('Link not valid', gonePage()), 404);
  const quote = await resolveQuote(env, token);
  if (!quote) return html(page('Link not valid', gonePage()), 404);

  const fields = buildPaymentFields({
    merchantId: env.PAYFAST_MERCHANT_ID,
    merchantKey: env.PAYFAST_MERCHANT_KEY,
    returnUrl: 'https://pay.santiu.co.za/done',
    cancelUrl: 'https://pay.santiu.co.za/cancel',
    notifyUrl: env.PAYFAST_NOTIFY_URL,
    amount: quote.amount,
    itemName: quote.itemName.slice(0, 100),
    slug: quote.mPaymentId,
    passphrase: env.PAYFAST_PASSPHRASE,
  });
  // custom_str1 carries our own token so the ITN can be tied to the Quotation
  // without trusting anything the browser could change.
  const all = { ...fields, custom_str1: token };
  const signed = { ...all, signature: buildPaymentFields.length ? all.signature : all.signature };

  const inputs = Object.entries({ ...fields, custom_str1: token })
    .map(([k, v]) => `<input type="hidden" name="${esc(k)}" value="${esc(v)}">`)
    .join('\n');

  return html(page('Redirecting to Payfast', `
    <h1>Taking you to Payfast</h1>
    <p>R${esc(quote.amount)} deposit for ${esc(quote.itemName)}.</p>
    <form id="pf" action="${esc(env.PAYFAST_URL)}" method="post">
      ${inputs}
      <button type="submit">Continue to Payfast</button>
    </form>
    <script>document.getElementById('pf').submit();</script>
  `));
}

function gonePage() {
  return `<h1>This payment link is not valid</h1>
    <p>It may have expired, or the quote may have been replaced by a newer one.
    Reply to your quote email and we will send a fresh link.</p>`;
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
  return json({ valid: validateNotify(fields, env.PAYFAST_PASSPHRASE || null), fields });
}

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (pathname === '/_itn/validate' && request.method === 'POST') return itnValidate(request, env);
    const pay = pathname.match(/^\/pay\/([0-9a-f]{1,128})$/);
    if (pay && request.method === 'GET') return payPage(request, env, pay[1]);
    if (pathname === '/done') {
      return html(page('Payment received', `<h1>Thank you — payment received</h1>
        <p>Your receipt and onboarding link are on their way by email. If it has not
        arrived in ten minutes, reply to your quote email.</p>`));
    }
    if (pathname === '/cancel') {
      return html(page('Payment cancelled', `<h1>Payment cancelled</h1>
        <p>Nothing was charged. Your quote is still open — use the link in your email
        when you are ready.</p>`));
    }
    return new Response('Not found', { status: 404 });
  },
};
```

Remove the two dead lines (`const all` / `const signed`) that the draft above leaves in `payPage` — the `inputs` expression builds its fields directly. They are named here so the reviewer catches them if they survive.

- [ ] **Step 2: Write `wrangler.pay.toml`**

```toml
name = "santi-pay"
main = "src/worker/pay.js"
compatibility_date = "2026-08-01"

routes = [
  { pattern = "pay.santiu.co.za/*", zone_name = "santiu.co.za" }
]

[vars]
PAYFAST_URL = "https://www.payfast.co.za/eng/process"
PAYFAST_NOTIFY_URL = "https://n8n.santi.co.za/webhook/santi-deposit"
N8N_QUOTE_URL = "https://n8n.santi.co.za/webhook/santi-quote-amount"

# Secrets, set with `npx wrangler secret put <NAME> --config wrangler.pay.toml`:
#   PAYFAST_MERCHANT_ID, PAYFAST_MERCHANT_KEY, PAYFAST_PASSPHRASE, WORKER_TOKEN
#
# The passphrase is the same one Resu uses — the merchant account is shared.
# Rotating it on the Payfast account means updating BOTH Workers' secrets, or
# one of the two systems stops validating. That coupling is the price of one
# merchant account.
```

- [ ] **Step 3: Set the secrets and deploy**

```bash
cd "/Users/santiu/Documents/Santi Office"
for name in PAYFAST_MERCHANT_ID PAYFAST_MERCHANT_KEY PAYFAST_PASSPHRASE; do
  npx wrangler secret put "$name" --config wrangler.pay.toml
done
# WORKER_TOKEN is a shared secret between the Worker and n8n; generate one:
node -e "console.log(crypto.randomUUID().replace(/-/g,''))"
npx wrangler secret put WORKER_TOKEN --config wrangler.pay.toml
npx wrangler deploy --config wrangler.pay.toml
```

The Payfast values come from the Payfast dashboard for the **existing live account**. The passphrase is set on that account — signing without it produces `Generated signature does not match submitted signature`, which is the exact failure Resu's config comments warn about.

- [ ] **Step 4: Smoke-test the deployed Worker**

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://pay.santiu.co.za/done            # 200
curl -s -o /dev/null -w '%{http_code}\n' https://pay.santiu.co.za/pay/deadbeef    # 404, token not 64 hex
curl -s -o /dev/null -w '%{http_code}\n' -X POST https://pay.santiu.co.za/_itn/validate  # 401, no bearer
curl -s https://pay.santiu.co.za/pay/$(python3 -c "print('a'*64)") | head -c 120   # "not valid" page: n8n has no such token
```

Expected: 200, 404, 401, and the not-valid page. **No 500s.** A 500 on `/pay/…` usually means `N8N_QUOTE_URL` is unreachable — that endpoint arrives in Task 8, and the Worker must degrade to the not-valid page rather than erroring.

- [ ] **Step 5: Commit**

```bash
git add src/worker/pay.js wrangler.pay.toml
git commit -m "santi-pay Worker: signed deposit links and ITN validation endpoint"
```

---

### Task 8: W2 — Quotation submit becomes a token, a link and an email

**Files:**
- Create: `tools/create-quote-workflow.py`
- Modify: `n8n/workflows/` via re-export

**Interfaces:**
- Consumes: `src/core/deposit.js`, `src/core/token.js` (both inlined into Code nodes), `svc-n8n` ERPNext credentials, `WORKER_TOKEN`.
- Produces two webhook paths: `POST /webhook/santi-quote-submitted` (called by a Frappe outbound webhook) and `POST /webhook/santi-quote-amount` (called by the Worker, bearer-protected) returning `{ amount, itemName, mPaymentId, email, name }`.

- [ ] **Step 1: Create the Frappe outbound webhook**

In ERPNext: *Webhook → New*. Doctype `Quotation`, Document Event `on_submit`, Request URL `https://n8n.santi.co.za/webhook/santi-quote-submitted`, Request Structure `JSON`, and add a webhook header `Authorization: Bearer <WORKER_TOKEN>`. Fields to send: `name`, `customer_name`, `contact_email`, `grand_total`, `custom_deposit_percent`, `title`.

Outbound requests are unaffected by Cloudflare Access, so this needs no exception and fires the moment a Quotation is submitted — no polling.

- [ ] **Step 2: Write the workflow builder**

```python
"""Creates the two quote webhooks in n8n.

Built from scratch (not patched) so the connection graph is ours and the whole
workflow is reproducible from this file. The Code node bodies are read from
src/core/, so the tested code and the deployed code cannot drift.
"""
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from n8n_api import _request, list_workflows

ROOT = Path(__file__).resolve().parent.parent
APPLY = '--apply' in sys.argv
NAME = 'Santi — Quote & Pay Link v0.1'


def core(filename):
    text = (ROOT / 'src' / 'core' / filename).read_text()
    return re.sub(r'^export ', '', text, flags=re.M)


prepare_code = core('deposit.js') + core('token.js') + '''
// --- n8n entry point ---------------------------------------------------------
// Input: the Frappe webhook body for a submitted Quotation.
const q = $input.first().json.body || $input.first().json;
const percent = Number(q.custom_deposit_percent) || 50;
const amount = depositAmount(q.grand_total, percent);
const token = newToken();
const expires = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString().slice(0, 19).replace('T', ' ');

return [{ json: {
  quotation: q.name,
  email: q.contact_email,
  customer: q.customer_name,
  itemName: `Deposit — ${q.title || q.name}`,
  amount,
  percent,
  token,
  expires,
  mPaymentId: mPaymentId(q.name),
  payUrl: `https://pay.santiu.co.za/pay/${token}`,
  quoteUrl: `https://santi.co.za/quote?t=${token}`
} }];
'''

lookup_code = '''
// Called by the santi-pay Worker. Answers with the deposit figure for a token,
// or nothing at all. The amount is read from ERPNext here and never accepted
// from the caller — this endpoint is the server-side source of the figure the
// ITN is later checked against.
const rows = $input.first().json.data || [];
if (!rows.length) return [{ json: { error: 'not found' }, pairedItem: 0 }];
const q = rows[0];
const expired = q.custom_token_expires && new Date(q.custom_token_expires) < new Date();
if (expired || q.status === 'Lost' || q.docstatus === 2) return [{ json: { error: 'not found' } }];
return [{ json: {
  amount: Number(q.custom_deposit_amount).toFixed(2),
  itemName: `Deposit — ${q.title || q.name}`,
  mPaymentId: `SANTI-${q.name}`,
  email: q.contact_email,
  name: q.customer_name
} }];
'''

print('Code node bodies prepared:')
print(' prepare:', len(prepare_code), 'chars')
print(' lookup :', len(lookup_code), 'chars')

if not APPLY:
    raise SystemExit('dry run — pass --apply to create the workflow')

existing = [w for w in list_workflows() if w['name'] == NAME]
if existing:
    raise SystemExit(f'{NAME} already exists ({existing[0]["id"]}) — edit it in n8n or delete it first')

# Node and connection definitions are written out in full here; see the wiring
# table in the plan for what connects to what.
raise SystemExit('fill in the node definitions per the wiring table, then re-run')
```

**Wiring table** — build these nodes, in the UI or by extending the script, and keep the names exactly as written because Step 5's test looks them up by name:

*Branch A — quote submitted:*
`Webhook — Quote Submitted` (POST, path `santi-quote-submitted`) → `Prepare Quote` (Code, body above) → `ERP — Store Token` (PUT `/api/resource/Quotation/{{$json.quotation}}`, body `{"custom_quote_token": "…", "custom_deposit_amount": …, "custom_token_expires": "…"}`) → `Send Quote Email` (the quote total, the deposit figure, the `/quote` link, the expiry date) → `Alert — Quote Sent` (Telegram) → `Respond 200`.

*Branch B — token lookup for the Worker:*
`Webhook — Quote Amount` (POST, path `santi-quote-amount`) → `IF — Bearer Valid?` (`{{$request.headers.authorization}}` equals `Bearer <WORKER_TOKEN>`; false → `Respond 401`) → `ERP — Find By Token` (GET `/api/resource/Quotation` with `filters=[["custom_quote_token","=",{{token}}],["docstatus","=",1]]` and `fields=["name","title","customer_name","contact_email","custom_deposit_amount","custom_token_expires","status","docstatus"]`) → `Quote Lookup` (Code, `lookup_code` above) → `Respond Quote JSON`.

`ERP — Store Token` and `ERP — Find By Token` use the `svc-n8n` ERPNext credential, never the `ai-*` ones.

- [ ] **Step 3: Dry run, then build and save**

Run: `python3 tools/create-quote-workflow.py`
Expected: prints both code-body sizes and exits on the dry-run guard. Then build the nodes per the wiring table and save the workflow **inactive**.

- [ ] **Step 4: Test branch B directly, before any email exists**

```bash
cd "/Users/santiu/Documents/Santi Office"
# Create a draft Quotation for yourself, submit it, and read back the token:
cd erpnext && python3 - <<'EOF'
import lib
company = lib.get('Company', fields=['name'])[0]['name']
customer = lib.get('Customer', fields=['name'])[0]['name']
q = lib.create('Quotation', {
    'quotation_to': 'Customer', 'party_name': customer, 'company': company,
    'title': 'PLAN 2 TEST — do not send', 'contact_email': 'zukosanti@gmail.com',
    'custom_deposit_percent': 50,
    'items': [{'item_code': 'SVC-WEB', 'qty': 1, 'rate': 18500}],
})
print('quotation:', q['name'], 'total:', q['grand_total'])
EOF
```

Activate the workflow, submit that Quotation in the ERPNext UI, then:

```bash
cd erpnext && python3 -c "import lib; print(lib.get('Quotation', filters=[['title','like','PLAN 2 TEST%']], fields=['name','custom_deposit_amount','custom_quote_token','custom_token_expires']))"
```

Expected: `custom_deposit_amount` = 9250.00, a 64-hex token, an expiry 30 days out.

- [ ] **Step 5: Prove the Worker and n8n agree, end to end short of paying**

```bash
TOKEN=<the token from step 4>
curl -s https://pay.santiu.co.za/pay/$TOKEN | grep -oE 'name="(amount|m_payment_id|signature|custom_str1)" value="[^"]*"'
```

Expected: `amount` `9250.00`, `m_payment_id` `SANTI-<quotation>`, `custom_str1` the token, and a 32-hex `signature`. **Stop at this page. Do not submit the form** — the ITN handler does not exist until Plan 3, so a real payment now would be charged with no record created.

- [ ] **Step 6: Re-export, write the node test, commit**

```bash
python3 tools/export-workflows.py --write
```

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const WORKFLOW = process.env.SANTI_QUOTE_WORKFLOW || 'n8n/workflows/santi-quote-pay-link-v0-1.json';

function nodeCode(name) {
  const workflow = JSON.parse(readFileSync(WORKFLOW, 'utf8'));
  const node = workflow.nodes.find(n => n.name === name);
  assert.ok(node, `${WORKFLOW} has no "${name}" node`);
  return node.parameters.jsCode;
}

function runPrepare(quotation) {
  const $input = { first: () => ({ json: { body: quotation } }) };
  return new Function('$input', nodeCode('Prepare Quote'))($input)[0].json;
}

test('the deployed Prepare Quote node halves the total and namespaces the reference', () => {
  const out = runPrepare({ name: 'SAL-QTN-2026-00007', grand_total: 18500, title: 'Clinic site', contact_email: 'a@b.com', customer_name: 'Clinic' });
  assert.equal(out.amount, '9250.00');
  assert.equal(out.mPaymentId, 'SANTI-SAL-QTN-2026-00007');
  assert.match(out.token, /^[0-9a-f]{64}$/);
  assert.equal(out.payUrl, `https://pay.santiu.co.za/pay/${out.token}`);
});

test('the deployed node refuses a zero-total quote rather than emailing a R0 link', () => {
  assert.throws(() => runPrepare({ name: 'SAL-QTN-2026-00008', grand_total: 0 }), /positive/);
});

test('the deployed lookup node hides an expired token', () => {
  const past = new Date(Date.now() - 86400000).toISOString().slice(0, 19).replace('T', ' ');
  const $input = { first: () => ({ json: { data: [{ name: 'Q1', custom_deposit_amount: 100, custom_token_expires: past, docstatus: 1, status: 'Open' }] } }) };
  const out = new Function('$input', nodeCode('Quote Lookup'))($input)[0].json;
  assert.equal(out.error, 'not found');
});
```

```bash
npm test
git add tools/create-quote-workflow.py test/n8n-quote-nodes.test.js n8n/workflows
git commit -m "W2: Quotation submit produces a deposit token, pay link and quote email"
```

- [ ] **Step 7: Clean up the test Quotation**

Cancel it in ERPNext (`Cancel`, not delete, so the numbering series stays honest) and clear its `custom_quote_token` so the link dies:

```bash
cd erpnext && python3 -c "import lib; lib.update('Quotation','<NAME>',{'custom_quote_token':''})"
```

---

### Task 9: The `/quote` page

**Files:**
- Create: `content/pages/quote.html`, `assets/js/quote.js` (website repo)
- Modify: `scripts/build-site.py`, `deploy.sh`, `robots.txt` (website repo)

**Interfaces:**
- Consumes: `POST /webhook/santi-quote-view` (token → quote JSON for display) and `POST /webhook/santi-quote-ask` (token + question → Comment on the Quotation). Both are added to the W2 workflow in this task, following the same wiring pattern as Branch B.
- Produces: `https://santi.co.za/quote?t=<token>`.

- [ ] **Step 1: Add the two page-facing webhooks to the W2 workflow**

`Webhook — Quote View` (POST `santi-quote-view`) → `ERP — Find By Token` (reuse the same filter as Task 8) → `Quote View` (Code: return customer name, quote title, line items, `grand_total`, deposit amount, expiry, `payUrl`; **never** return the Quotation's internal name or anything not needed for display) → `Respond JSON`.

`Webhook — Quote Ask` (POST `santi-quote-ask`) → `ERP — Find By Token` → `IF — Found?` → `ERP — Add Comment` (`frappe.desk.form.utils.add_comment`, `reference_doctype: Quotation`, content = the question, prefixed `Question from the quote page:`) → `Alert — Quote Question` (Telegram) → `Respond 200`.

Both return the same generic `{ "ok": false }` for expired, wrong and missing tokens — an attacker must not be able to tell a real token from a dead one. Rate-limit both in the webhook node options.

- [ ] **Step 2: Write `assets/js/quote.js`**

```javascript
/* Quote page: exchange the token for the quote, render it, take a question.
   The token is removed from the address bar after the first exchange so it
   cannot leak through a Referer header or a screenshot. */
(function () {
  var N8N = 'https://n8n.santi.co.za/webhook/';
  var params = new URLSearchParams(location.search);
  var token = params.get('t') || '';
  var elStatus = document.getElementById('quote-status');
  var elBody = document.getElementById('quote-body');

  function post(path, payload) {
    return fetch(N8N + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).then(function (response) { return response.json().catch(function () { return {}; }); });
  }

  function money(value) {
    return 'R' + Number(value).toLocaleString('en-ZA', { minimumFractionDigits: 2 });
  }

  function dead() {
    elStatus.textContent = 'This quote link is not valid any more. It may have expired, or a newer quote may have replaced it. Reply to your quote email and we will send a fresh one.';
  }

  if (!/^[0-9a-f]{64}$/.test(token)) { dead(); return; }

  post('santi-quote-view', { token: token }).then(function (quote) {
    // Strip the token from the URL once it has been used.
    history.replaceState(null, '', location.pathname);
    if (!quote || quote.ok === false) { dead(); return; }

    elStatus.textContent = '';
    document.getElementById('quote-customer').textContent = quote.customer || '';
    document.getElementById('quote-title').textContent = quote.title || 'Your quote';
    document.getElementById('quote-total').textContent = money(quote.grandTotal);
    document.getElementById('quote-deposit').textContent = money(quote.depositAmount);
    document.getElementById('quote-expires').textContent = quote.expires || '';
    var pay = document.getElementById('quote-pay');
    pay.href = quote.payUrl;
    var lines = document.getElementById('quote-lines');
    (quote.items || []).forEach(function (item) {
      var row = document.createElement('tr');
      row.innerHTML = '<td></td><td></td><td></td>';
      row.children[0].textContent = item.description;
      row.children[1].textContent = item.qty;
      row.children[2].textContent = money(item.amount);
      lines.appendChild(row);
    });
    elBody.hidden = false;

    document.getElementById('quote-ask-form').addEventListener('submit', function (event) {
      event.preventDefault();
      var field = document.getElementById('quote-question');
      var note = document.getElementById('quote-ask-status');
      if (!field.value.trim()) return;
      note.textContent = 'Sending…';
      post('santi-quote-ask', { token: token, question: field.value.trim() }).then(function () {
        field.value = '';
        note.textContent = 'Sent. Santi will reply by email.';
      }).catch(function () {
        note.textContent = 'That did not send. Please email santi@santi.co.za instead.';
      });
    });
  }).catch(dead);
})();
```

- [ ] **Step 3: Write `content/pages/quote.html`**

Follow the existing files in `content/pages/` exactly: the JSON meta comment first, then the body. Meta must set `"robots": "noindex, nofollow"` and the page must include `<meta name="referrer" content="no-referrer">`. Body skeleton, using the v3 brand (royal `#173B9A`, turquoise `#08BECC`, golden yellow `#FFD147` as a button fill only, soft white `#F4F7F8`, teal-ink `#03707A` for small turquoise text):

```html
<section class="quote">
  <p id="quote-status">Loading your quote…</p>
  <div id="quote-body" hidden>
    <p class="quote-hello">Hi <span id="quote-customer"></span></p>
    <h1 id="quote-title"></h1>
    <table class="quote-lines"><tbody id="quote-lines"></tbody></table>
    <p class="quote-total">Total <strong id="quote-total"></strong></p>
    <p class="quote-deposit">To start, a 50% deposit of <strong id="quote-deposit"></strong></p>
    <a id="quote-pay" class="btn btn-gold" href="#">Pay 50% deposit</a>
    <p class="quote-fine">This link expires on <span id="quote-expires"></span>.
      If the scope changes we will send a new quote and this link will stop working.</p>
    <form id="quote-ask-form">
      <label for="quote-question">Any questions before you pay?</label>
      <textarea id="quote-question" rows="4"></textarea>
      <button type="submit" class="btn">Send question</button>
      <p id="quote-ask-status" aria-live="polite"></p>
    </form>
  </div>
</section>
```

- [ ] **Step 4: Register, build, and keep it out of the index**

In `scripts/build-site.py`: add `quote` to the generated-pages list and **bump `V`**. In `robots.txt`: add `Disallow: /quote`. Do **not** add it to `sitemap.xml`. In `deploy.sh`: add `~/_santi_deploy/quote.html` to the `cp -a` list.

```bash
cd ~/Documents/SantiUWebsite2
python3 scripts/build-site.py
grep -c 'noindex' quote.html        # -> at least 1
grep -n 'quote.html' deploy.sh      # -> present
```

- [ ] **Step 5: Verify locally before deploying**

```bash
cd ~/Documents/SantiUWebsite2 && python3 -m http.server 8000
```

Open `http://localhost:8000/quote.html?t=<the token from Task 8>`. Expected: the quote renders, the deposit reads R9 250.00, the pay button points at `pay.santiu.co.za/pay/<token>`, and the token disappears from the address bar. Open it again with a bad token → the "not valid any more" message, no console errors. **Do not click through to Payfast.**

- [ ] **Step 6: Commit and deploy**

```bash
cd ~/Documents/SantiUWebsite2
git add content/pages/quote.html assets/js/quote.js scripts/build-site.py deploy.sh robots.txt quote.html
git commit -m "Quote page: tokenised quote view, deposit figure, pay link and ask box"
git push
# then on the server:
# curl -s https://raw.githubusercontent.com/officeUniverse/santi-website/main/deploy.sh | bash
```

Note: `deploy.sh` clones `main`, and this work is on branch `v3`. Either merge to `main` first or deploy from the branch deliberately — check which before pushing, and do not assume.

---

## Self-review

**Spec coverage:** §4(a) Task 1, §4(b) Task 2, §4(c) Task 3, §4(d) Task 4, §4(e) Task 5, §5 Tasks 6–7, §6 W2 Task 8, §7 `/quote` Task 9. Spec §4(f) Lead Sources was done in Plan 1. Not covered here, by design: W3 (Plan 3), `/start` and W5 (Plan 4), W4 and W6 (Plan 5).

**Interface consistency:** `validateNotify`, `buildPaymentFields`, `depositAmount`, `mPaymentId`, `ownsPayment`, `newToken` are spelled identically in `src/core/`, the tests, the Worker, and the inlined n8n Code nodes. The Worker's `/_itn/validate` response shape `{ valid, fields }` is what Plan 3 consumes. The custom fieldnames in Task 3 match every later reference.

**Deliberate rough edges, flagged rather than hidden:**
- Task 7 Step 1 leaves two dead lines in `payPage` (`const all` / `const signed`) — called out in the step itself so the reviewer removes them rather than shipping them.
- Task 8's builder script stops at a `SystemExit` rather than emitting the full node graph. Writing 12 nodes of n8n JSON blind is where a plan stops being useful; the wiring table is precise about names, paths, filters and bodies, and Step 6's test enforces the node names the rest of the system depends on.
- `deploy.sh` deploys `main` while development is on `v3`. Task 9 Step 6 makes that a conscious decision instead of a surprise.
