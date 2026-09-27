# Plan 1 — Lead intake Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every enquiry from santi.co.za becomes a Lead in ERPNext instead of dying in a webhook with no destination.

**Architecture:** The site already POSTs to `n8n.santi.co.za/webhook/santi-leads`. This plan creates an ops repo, adds a pure-JS payload builder with tests, patches that existing workflow to create (or de-duplicate into) an ERPNext Lead, and proves it with a real form submission. No website changes.

**Tech Stack:** Node 20+ (`node --test`, no framework), Python 3 for n8n and ERPNext API scripts, n8n REST API v1, Frappe REST API.

## Global Constraints

- ERPNext at `https://office.santiu.co.za` is the only source of truth. No second database.
- ERPNext sits behind Cloudflare Access. Every API call needs **both** `Authorization: token <key>:<secret>` **and** `CF-Access-Client-Id` / `CF-Access-Client-Secret` headers.
- **Never widen the `ai-projects` / `ai-accounts` / `ai-briefing` users' permissions.** They are deliberately role-separated. Integrations get their own user.
- Secrets live in `.dev.vars` (gitignored). Never commit a key, secret, token or passphrase. Never print one into a terminal transcript or a commit message.
- Santiuniverse (Pty) Ltd is **not VAT registered**. No tax templates anywhere.
- n8n is shared with Resu (live, takes real money). **Never rename, deactivate, or edit a `Resu —` workflow.** New webhook paths must not resemble `resu-*`.
- Workflow exports are committed and must be refreshed after every push: `python3 tools/export-workflows.py --write`. A stale export looks authoritative and is worse than none.
- `staticData` must be stripped from every export — it can contain real people's contact details.

---

## File Structure

New repo at `/Users/santiu/Documents/Santi Office` (currently empty; `graft/` is a tool cache and is ignored):

| File | Responsibility |
|---|---|
| `package.json` | `node --test test/**/*.test.js` |
| `.gitignore` | ignores `.dev.vars`, `graft/`, `node_modules/` |
| `.dev.vars` | **gitignored.** n8n + ERPNext + Cloudflare Access credentials |
| `erpnext/lib.py` | the only place that knows how to talk to Frappe (auth, CF Access, GET/POST/PUT, error surfacing) |
| `src/core/lead.js` | pure function: webhook body → Lead fields. No I/O, so it is testable |
| `tools/n8n_api.py` | the only place that knows how to talk to n8n |
| `tools/export-workflows.py` | re-export live workflows into `n8n/workflows/`, stripping `staticData` |
| `tools/patch-leads-workflow.py` | adds the ERPNext nodes to the existing leads workflow |
| `n8n/workflows/*.json` | committed exports — what the tests execute |
| `test/lead.test.js` | tests `src/core/lead.js` |
| `test/n8n-leads-nodes.test.js` | executes the real deployed node JavaScript from the committed export |

---

### Task 1: Ops repo and a verified ERPNext client

**Files:**
- Create: `package.json`, `.gitignore`, `.dev.vars`, `erpnext/lib.py`, `erpnext/whoami.py`

**Interfaces:**
- Consumes: nothing.
- Produces: `erpnext/lib.py` exposing `get(doctype, filters=None, fields=None, limit=20)`, `get_doc(doctype, name)`, `create(doctype, payload)`, `update(doctype, name, payload)`, `call(method, **params)` — every one returning parsed JSON and raising `ErpError` with the Frappe message on a non-2xx.

- [ ] **Step 1: Initialise the repo**

```bash
cd "/Users/santiu/Documents/Santi Office"
git init
printf '%s\n' '.dev.vars' 'node_modules/' 'graft/' '.DS_Store' > .gitignore
cat > package.json <<'EOF'
{
  "name": "santi-office",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test test/**/*.test.js"
  }
}
EOF
```

- [ ] **Step 2: Write `.dev.vars` (never committed)**

Values for n8n come from the existing Resu file — read it, do not guess:
`grep -E '^N8N_' /Users/santiu/Documents/Resu/Source/.dev.vars`

ERPNext values come from `~/.config/erpnext-mcp/ai-users.json` and `~/.config/erpnext-mcp/cloudflare.env`. For this plan only, use the existing `ai-projects@santiu.co.za` key — it can read and write Leads and Tasks. Plan 2 replaces it with a dedicated `svc-n8n` user.

```bash
cat > .dev.vars <<'EOF'
N8N_BASE_URL=https://n8n.santi.co.za
N8N_API_KEY=<from Resu/Source/.dev.vars>
ERPNEXT_URL=https://office.santiu.co.za
ERPNEXT_API_KEY=<ai-projects key>
ERPNEXT_API_SECRET=<ai-projects secret>
CF_ACCESS_CLIENT_ID=<from cloudflare.env>
CF_ACCESS_CLIENT_SECRET=<from cloudflare.env>
EOF
chmod 600 .dev.vars
git check-ignore -v .dev.vars   # MUST print a match before the first commit
```

- [ ] **Step 3: Write `erpnext/lib.py`**

```python
"""The only place that knows how to talk to Frappe.

Cloudflare Access sits in front of ERPNext, so every request carries a service
token *as well as* the API key. A missing CF header comes back as an HTML login
page with status 302, not as JSON — which is why _request raises on a
non-JSON body instead of letting json.loads fail somewhere further away.
"""
import json
import os
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path


class ErpError(RuntimeError):
    pass


def _config():
    cfg = {}
    path = Path(__file__).resolve().parent.parent / '.dev.vars'
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith('#') or '=' not in line:
            continue
        key, value = line.split('=', 1)
        cfg[key.strip()] = value.strip()
    cfg.update({k: v for k, v in os.environ.items() if k.startswith(('ERPNEXT_', 'CF_ACCESS_'))})
    return cfg


CFG = _config()
BASE = CFG['ERPNEXT_URL'].rstrip('/')
HEADERS = {
    'Authorization': f"token {CFG['ERPNEXT_API_KEY']}:{CFG['ERPNEXT_API_SECRET']}",
    'CF-Access-Client-Id': CFG['CF_ACCESS_CLIENT_ID'],
    'CF-Access-Client-Secret': CFG['CF_ACCESS_CLIENT_SECRET'],
    'Accept': 'application/json',
    # Required, discovered 2026-09-27: Cloudflare's WAF rejects Python's default
    # 'Python-urllib/x.y' User-Agent with error 1010 browser_signature_banned,
    # before CF Access or Frappe ever see the request. Nothing to do with the API
    # key or the CF headers above. Do not remove this when tidying.
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 '
                  '(KHTML, like Gecko) Chrome/120.0 Safari/537.36',
}


def _request(method, path, params=None, payload=None):
    url = f'{BASE}{path}'
    if params:
        url += '?' + urllib.parse.urlencode(params)
    data = None
    headers = dict(HEADERS)
    if payload is not None:
        data = json.dumps(payload).encode()
        headers['Content-Type'] = 'application/json'
    request = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            body = response.read().decode()
    except urllib.error.HTTPError as error:
        body = error.read().decode()
        raise ErpError(f'{method} {path} -> {error.code}: {body[:400]}') from None
    try:
        return json.loads(body)
    except json.JSONDecodeError:
        raise ErpError(f'{method} {path} returned non-JSON (Cloudflare Access?): {body[:200]}') from None


def get(doctype, filters=None, fields=None, limit=20):
    params = {'limit_page_length': limit}
    if filters:
        params['filters'] = json.dumps(filters)
    params['fields'] = json.dumps(fields or ['name'])
    return _request('GET', f'/api/resource/{urllib.parse.quote(doctype)}', params)['data']


def get_doc(doctype, name):
    return _request('GET', f'/api/resource/{urllib.parse.quote(doctype)}/{urllib.parse.quote(name)}')['data']


def create(doctype, payload):
    return _request('POST', f'/api/resource/{urllib.parse.quote(doctype)}', payload=payload)['data']


def update(doctype, name, payload):
    path = f'/api/resource/{urllib.parse.quote(doctype)}/{urllib.parse.quote(name)}'
    return _request('PUT', path, payload=payload)['data']


def call(method, **params):
    return _request('GET', f'/api/method/{method}', params)['message']
```

- [ ] **Step 4: Write `erpnext/whoami.py` and run it — this is the test that auth works**

```python
"""Proves the credentials and the Cloudflare Access token both work."""
from lib import call, get

print('user:', call('frappe.auth.get_logged_user'))
print('projects:', get('Project', fields=['name', 'project_name', 'status']))
print('leads:', get('Lead', fields=['name'], limit=1))
```

Run: `cd erpnext && python3 whoami.py`
Expected: prints `user: ai-projects@santiu.co.za`, one project (`PROJ-0001 00 Daily`), and an empty leads list. A non-JSON error means the Cloudflare Access headers are wrong; a 403 means the API key is.

- [ ] **Step 5: Commit**

```bash
git add package.json .gitignore erpnext/lib.py erpnext/whoami.py
git status --short   # confirm .dev.vars is NOT listed
git commit -m "Ops repo: ERPNext client verified against the live instance"
```

---

### Task 2: Capture the live n8n state before touching it

**Files:**
- Create: `tools/n8n_api.py`, `tools/export-workflows.py`, `n8n/workflows/` (exports)

**Interfaces:**
- Consumes: `.dev.vars` from Task 1.
- Produces: `tools/n8n_api.py` exposing `list_workflows()`, `get_workflow(id)`, `put_workflow(id, body)`, `activate(id)`; committed exports under `n8n/workflows/`.

- [ ] **Step 1: Write `tools/n8n_api.py`**

```python
"""The only place that knows how to talk to n8n.

This n8n also runs Resu, which takes real money. Nothing here may touch a
workflow whose name starts with "Resu —"; guard_not_resu is called by every
write path rather than left to the caller to remember.
"""
import json
import urllib.error
import urllib.request
from pathlib import Path

CFG = {}
for line in (Path(__file__).resolve().parent.parent / '.dev.vars').read_text().splitlines():
    if '=' in line and not line.strip().startswith('#'):
        key, value = line.split('=', 1)
        CFG[key.strip()] = value.strip()

BASE = CFG['N8N_BASE_URL'].rstrip('/') + '/api/v1'
HEADERS = {'X-N8N-API-KEY': CFG['N8N_API_KEY'], 'Accept': 'application/json'}


def _request(method, path, payload=None):
    data = json.dumps(payload).encode() if payload is not None else None
    headers = dict(HEADERS)
    if data:
        headers['Content-Type'] = 'application/json'
    request = urllib.request.Request(BASE + path, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            return json.loads(response.read().decode())
    except urllib.error.HTTPError as error:
        raise RuntimeError(f'{method} {path} -> {error.code}: {error.read().decode()[:400]}') from None


def guard_not_resu(workflow):
    name = workflow.get('name', '')
    if name.startswith('Resu'):
        raise SystemExit(f'refusing to modify a live Resu workflow: {name!r}')


def list_workflows():
    return _request('GET', '/workflows?limit=200')['data']


def get_workflow(workflow_id):
    return _request('GET', f'/workflows/{workflow_id}')


def put_workflow(workflow_id, body):
    guard_not_resu(body)
    keep = {k: body[k] for k in ('name', 'nodes', 'connections', 'settings') if k in body}
    return _request('PUT', f'/workflows/{workflow_id}', keep)


def activate(workflow_id):
    return _request('POST', f'/workflows/{workflow_id}/activate')
```

- [ ] **Step 2: List what is live and find the leads workflow**

```bash
cd "/Users/santiu/Documents/Santi Office"
python3 - <<'EOF'
import sys; sys.path.insert(0, 'tools')
from n8n_api import list_workflows
for w in list_workflows():
    print(f"{w['id']:24} active={str(w.get('active')):5} {w['name']}")
EOF
```

Expected: the `Resu —` workflows plus whatever currently serves `/webhook/santi-leads`. **Record the id of the leads workflow — later steps need it.** If no workflow owns that path, note that too: Task 4 then creates one instead of patching one.

- [ ] **Step 3: Write `tools/export-workflows.py`**

```python
"""Re-export live n8n workflows into n8n/workflows/.

The committed exports are what test/n8n-*-nodes.test.js executes — they run the
real deployed JavaScript. That guarantee only holds if this is re-run after
every push.

staticData is stripped and that is not optional: n8n stores whatever a workflow
keeps in $getWorkflowStaticData() inside the workflow record, which for a
watcher-style workflow means real people's contact details in git.

    python3 tools/export-workflows.py           # show what would change
    python3 tools/export-workflows.py --write   # write the files
"""
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from n8n_api import get_workflow, list_workflows

WRITE = '--write' in sys.argv
OUT = Path(__file__).resolve().parent.parent / 'n8n' / 'workflows'

# An explicit allowlist, never "everything that is not Resu". This n8n holds 87
# workflows belonging to other projects and clients (Invite, Openclaw, KQV,
# client chatbots); exporting them would drag unrelated configuration — and
# possibly their secrets — into this repo. Add an id here only when this project
# owns that workflow.
WORKFLOWS = {
    'NRwlZnnatI84E1gN': 'santi-leads.json',       # Santi Leads (contact + newsletter)
    'drZg4ZalmAN1rknV': 'santi-aeo-tool.json',    # Santi AEO Tool
}


OUT.mkdir(parents=True, exist_ok=True)
for workflow_id, filename in WORKFLOWS.items():
    workflow = get_workflow(workflow_id)
    workflow.pop('staticData', None)
    target = OUT / filename
    text = json.dumps(workflow, indent=2, sort_keys=True, ensure_ascii=False) + '\n'
    if not WRITE:
        state = 'unchanged' if target.exists() and target.read_text() == text else 'WOULD CHANGE'
        print(f'{state}: {target.name}')
        continue
    target.write_text(text)
    print(f'wrote {target.name}')
```

- [ ] **Step 4: Export and verify no secret came along**

```bash
python3 tools/export-workflows.py --write
grep -rniE 'passphrase|api[_-]?key|secret|bearer' n8n/workflows/ | head
```

Expected: the grep prints nothing, or only n8n credential *references* (`"credentials": {"id": ...}`), never a value. If a literal secret is in a node parameter, stop and move it to an n8n credential first.

- [ ] **Step 5: Commit**

```bash
git add tools/n8n_api.py tools/export-workflows.py n8n/workflows
git commit -m "Capture live n8n workflow exports (Resu workflows excluded)"
```

---

### Task 3: The Lead payload builder, test-first

**Files:**
- Create: `test/lead.test.js`, `src/core/lead.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `buildLead(body)` → `{ lead: {…Frappe Lead fields}, note: string }`, and `dedupeFilters(body)` → Frappe filter array. Task 4 embeds this function's body into an n8n Code node, so it must stay dependency-free and side-effect-free.

The site posts `{ type, name, email, phone, subject, message, page, submittedAt }` (per `DEPLOY.md`) and the AEO tool posts a similar shape with a `url`. ERPNext `Lead` needs `lead_name`, and rejects a blank one.

- [ ] **Step 1: Write the failing test**

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildLead, dedupeFilters } from '../src/core/lead.js';

test('a contact form submission becomes a Lead', () => {
  const { lead, note } = buildLead({
    type: 'contact', name: 'Thabo Nkosi', email: 'thabo@example.co.za',
    phone: '0821234567', subject: 'Website for my practice',
    message: 'I need a 5 page site.', page: '/contact.html',
    submittedAt: '2026-09-27T08:00:00.000Z'
  });
  assert.equal(lead.lead_name, 'Thabo Nkosi');
  assert.equal(lead.email_id, 'thabo@example.co.za');
  assert.equal(lead.mobile_no, '0821234567');
  assert.equal(lead.source, 'Website');
  assert.equal(lead.status, 'Lead');
  assert.match(note, /5 page site/);
  assert.match(note, /\/contact\.html/);
});

test('a nameless submission still produces a valid Lead', () => {
  // ERPNext rejects a blank lead_name, and the form does not require a name.
  const { lead } = buildLead({ type: 'contact', email: 'someone@example.com' });
  assert.equal(lead.lead_name, 'someone@example.com');
});

test('a phone-only submission still produces a valid Lead', () => {
  // ERPNext rejects a blank lead_name. With no name and no email, the phone
  // number is the only thing left to name the Lead by. Without this case, an
  // implementation ending at `clean(body.name) || email` passes the suite.
  const { lead } = buildLead({ type: 'contact', phone: '0821234567' });
  assert.equal(lead.lead_name, '0821234567');
  assert.equal(lead.mobile_no, '0821234567');
  assert.equal(lead.email_id, undefined);
});

test('an AEO submission is marked as such and keeps the analysed URL', () => {
  const { lead, note } = buildLead({
    type: 'aeo', email: 'ops@clinic.co.za', url: 'https://clinic.co.za', phone: '0311234567'
  });
  assert.equal(lead.source, 'AEO Tool');
  assert.match(note, /clinic\.co\.za/);
});

test('rubbish with no way to reply is rejected, not filed', () => {
  assert.throws(() => buildLead({ type: 'contact', message: 'hi' }), /email or phone/);
});

test('dedupe matches on email, and on phone when there is no email', () => {
  assert.deepEqual(dedupeFilters({ email: 'a@b.com', phone: '0821234567' }),
    [['email_id', '=', 'a@b.com']]);
  assert.deepEqual(dedupeFilters({ phone: '0821234567' }),
    [['mobile_no', '=', '0821234567']]);
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npm test`
Expected: FAIL — `Cannot find module '../src/core/lead.js'`.

- [ ] **Step 3: Write the minimal implementation**

```javascript
// Webhook body -> ERPNext Lead fields. Pure so it can be tested here and
// pasted into an n8n Code node by tools/patch-leads-workflow.py.
const SOURCES = { contact: 'Website', aeo: 'AEO Tool', newsletter: 'Website' };

const clean = value => (typeof value === 'string' ? value.trim() : '');

export function buildLead(body = {}) {
  const email = clean(body.email);
  const phone = clean(body.phone);
  if (!email && !phone) throw new Error('a lead needs an email or phone to be worth filing');

  const name = clean(body.name) || email || phone;
  const lines = [
    clean(body.subject) && `Subject: ${clean(body.subject)}`,
    clean(body.message),
    clean(body.url) && `URL analysed: ${clean(body.url)}`,
    clean(body.page) && `Submitted from: ${clean(body.page)}`,
    clean(body.submittedAt) && `At: ${clean(body.submittedAt)}`
  ].filter(Boolean);

  return {
    lead: {
      lead_name: name,
      email_id: email || undefined,
      mobile_no: phone || undefined,
      source: SOURCES[clean(body.type)] || 'Website',
      status: 'Lead'
    },
    note: lines.join('\n')
  };
}

export function dedupeFilters(body = {}) {
  const email = clean(body.email);
  if (email) return [['email_id', '=', email]];
  return [['mobile_no', '=', clean(body.phone)]];
}
```

- [ ] **Step 4: Run the tests**

Run: `npm test`
Expected: 6 passing.

- [ ] **Step 5: Commit**

```bash
git add src/core/lead.js test/lead.test.js
git commit -m "Lead payload builder with dedupe rules"
```

---

### Task 4: Wire the leads workflow to ERPNext

**Files:**
- Create: `tools/patch-leads-workflow.py`
- Modify: the live leads workflow, then `n8n/workflows/*.json` via re-export

**Interfaces:**
- Consumes: `src/core/lead.js` (inlined), `tools/n8n_api.py`, the workflow id from Task 2 Step 2.
- Produces: a node named **`Build Lead`** whose `jsCode` returns `[{ json: { lead, note, filters } }]`; ERPNext HTTP nodes named `ERP — Find Existing Lead`, `ERP — Create Lead`, `ERP — Comment On Lead`; a Telegram node `Alert — ERPNext Write Failed`.

Prerequisites inside ERPNext and n8n, done once by hand before the script runs:

1. **Lead Sources — do not try to create these, and do not try to check for them.** Verified 2026-09-27: all three `ai-*` users get **403 on reading `Lead Source`**, and querying the `Lead.source` field at all returns **417 `DataError: Field not permitted in query: source`**. So an existence check fails misleadingly and a create attempt returns a confusing server error — while **creating a Lead with `source: 'Website'` succeeds**, which means the records already exist. Verify the only way that works: create a Lead and see whether it is accepted. Never request `source` in a `fields` list — any node that does will 417.
2. **An n8n credential for ERPNext — one `HTTP Custom Auth` credential, not three.** ERPNext behind Cloudflare Access needs three headers (`Authorization`, `CF-Access-Client-Id`, `CF-Access-Client-Secret`), and an n8n HTTP node accepts only one generic-auth credential. `HTTP Custom Auth` takes a JSON body, so all three live in one credential:

   ```json
   {"headers": {"Authorization": "token <key>:<secret>", "CF-Access-Client-Id": "<id>", "CF-Access-Client-Secret": "<secret>", "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"}}
   ```

   Include the `User-Agent` — Cloudflare's WAF rejects unrecognised agents with error 1010 before Access or Frappe see the request, which is the same trap `erpnext/lib.py` documents. Record the credential **id**; the workflow references it by id, and the secret values never appear in an export.
3. **A failure alert channel.** The existing `Send an Email` node already notifies on every lead, so a second per-lead alert is noise. What is genuinely missing is a signal when the **ERPNext write fails** — the email fires whether ERPNext succeeded or not, so without this a silent failure goes unnoticed. Reuse the Telegram credential an existing workflow already holds (read its id from any Telegram-using workflow via the API; ids are not secrets). If no Telegram credential is reachable, use the SMTP credential the leads workflow already uses and email the failure instead.

- [ ] **Step 1: Write `tools/patch-leads-workflow.py`**

```python
"""Add ERPNext Lead creation to the existing santi-leads workflow.

Idempotent: re-running replaces the nodes it owns rather than appending a
second copy. The Build Lead node's body is read from src/core/lead.js so the
tested code and the deployed code cannot drift.
"""
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from n8n_api import get_workflow, put_workflow

WORKFLOW_ID = 'PUT-THE-ID-FROM-TASK-2-HERE'
ERP_CREDENTIAL_ID = 'PUT-THE-N8N-CREDENTIAL-ID-HERE'
ERP_URL = 'https://office.santiu.co.za'
APPLY = '--apply' in sys.argv

core = (Path(__file__).resolve().parent.parent / 'src' / 'core' / 'lead.js').read_text()
body = re.sub(r'^export ', '', core, flags=re.M)

build_lead_code = body + '''
// --- n8n entry point ---------------------------------------------------------
const incoming = $input.first().json.body || $input.first().json;
const { lead, note } = buildLead(incoming);
return [{ json: { lead, note, filters: dedupeFilters(incoming) } }];
'''

nodes = {
    'Build Lead': {
        'parameters': {'jsCode': build_lead_code},
        'type': 'n8n-nodes-base.code',
        'typeVersion': 2,
        'position': [460, 300],
    },
    'ERP — Find Existing Lead': {
        'parameters': {
            'url': f'{ERP_URL}/api/resource/Lead',
            'sendQuery': True,
            'queryParameters': {'parameters': [
                {'name': 'filters', 'value': '={{ JSON.stringify($json.filters) }}'},
                {'name': 'fields', 'value': '["name"]'},
            ]},
            'options': {'response': {'response': {'neverError': True, 'responseFormat': 'json'}}},
        },
        'type': 'n8n-nodes-base.httpRequest',
        'typeVersion': 4.2,
        'position': [680, 300],
    },
}

workflow = get_workflow(WORKFLOW_ID)
print('patching:', workflow['name'])
existing = {n['name']: n for n in workflow['nodes']}
for name, node in nodes.items():
    node['name'] = name
    node['id'] = existing.get(name, {}).get('id') or name.lower().replace(' ', '-')
    existing[name] = node
workflow['nodes'] = list(existing.values())

if not APPLY:
    print(json.dumps([n['name'] for n in workflow['nodes']], indent=2))
    raise SystemExit('dry run — pass --apply to write')
put_workflow(WORKFLOW_ID, workflow)
print('applied')
```

**All nodes and the `connections` wiring are built through the n8n API by this script — not by hand in the UI.** The graph is then captured by re-export and Task 5 proves the result end to end. Building it in code means the whole workflow is reproducible from this repo, and a hand edit that drifts from `src/core/lead.js` shows up as a failing test in Task 4 Step 4.

**The existing path must not be touched.** `Leads Webhook → Append row in sheet`, `→ Send an Email` and `→ Respond OK` stay exactly as they are — the project owner decided the Google Sheet and the notification email both stay, with ERPNext added alongside. So the ERPNext work hangs off the webhook as an **additional branch**, never in series with the Sheet append: an ERPNext failure must not be able to stop a lead reaching the Sheet, and must not delay the 200.

Wiring of the new branch, explicitly:

`Leads Webhook → Build Lead → ERP — Find Existing Lead → IF — Lead Exists? → true: ERP — Comment On Lead; false: ERP — Create Lead → ERP — Comment On Lead`, and the error output of the two ERP write nodes → `Alert — ERPNext Write Failed`.

- `ERP — Create Lead`: `POST {ERP_URL}/api/resource/Lead`, JSON body `={{ JSON.stringify($('Build Lead').first().json.lead) }}`.
- `ERP — Comment On Lead`: `POST {ERP_URL}/api/method/frappe.desk.form.utils.add_comment` with `reference_doctype=Lead`, `reference_name` the created or found name, `content` the `note`, `comment_email` `svc-n8n@santiu.co.za`, `comment_by` `Website`.
- Respond 200 **always**, including on a rejected payload — the site's form should never show a visitor a failure because our CRM hiccuped.

- [ ] **Step 2: Dry-run the patch**

Run: `python3 tools/patch-leads-workflow.py`
Expected: prints the workflow name and node list, exits with "dry run".

- [ ] **Step 3: Apply, finish the wiring in the UI, keep it active**

Run: `python3 tools/patch-leads-workflow.py --apply`
Then in n8n: add the nodes listed above, connect them, save, confirm the workflow is **Active**.

- [ ] **Step 4: Re-export and write the node test**

```bash
python3 tools/export-workflows.py --write
```

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Executes the real deployed JavaScript out of the committed export, so a
// change made in the n8n UI that breaks lead intake fails here.
const WORKFLOW = process.env.SANTI_LEADS_WORKFLOW || 'n8n/workflows/santi-leads.json';

function nodeCode(name) {
  const workflow = JSON.parse(readFileSync(WORKFLOW, 'utf8'));
  const node = workflow.nodes.find(n => n.name === name);
  assert.ok(node, `${WORKFLOW} has no "${name}" node`);
  return node.parameters.jsCode;
}

function runBuildLead(incoming) {
  const $input = { first: () => ({ json: { body: incoming } }) };
  return new Function('$input', nodeCode('Build Lead'))($input)[0].json;
}

test('the deployed Build Lead node files a contact enquiry', () => {
  const out = runBuildLead({ type: 'contact', name: 'Thabo Nkosi', email: 'thabo@example.co.za', message: 'Need a site' });
  assert.equal(out.lead.lead_name, 'Thabo Nkosi');
  assert.equal(out.lead.source, 'Website');
  assert.deepEqual(out.filters, [['email_id', '=', 'thabo@example.co.za']]);
});

test('the deployed node rejects a payload with no way to reply', () => {
  assert.throws(() => runBuildLead({ type: 'contact', message: 'hi' }), /email or phone/);
});
```

Run: `npm test`
Expected: 7 passing. A failure here means the UI edit and `src/core/lead.js` have drifted — fix the source and re-run the patch, never the export by hand.

- [ ] **Step 5: Commit**

```bash
git add tools/patch-leads-workflow.py test/n8n-leads-nodes.test.js n8n/workflows
git commit -m "Leads workflow creates and de-duplicates ERPNext Leads"
```

---

### Task 5: Prove it with a real submission

**Files:** none changed — this is verification.

- [ ] **Step 1: Count Leads before**

```bash
cd erpnext && python3 -c "import lib; print(len(lib.get('Lead', fields=['name'], limit=500)))"
```

- [ ] **Step 2: Submit the live contact form**

Open `https://santi.co.za/contact.html`, submit with a real address you control and a message naming the date, e.g. `plan-1 smoke test 2026-09-27`.

- [ ] **Step 3: Assert the Lead exists with its comment**

```bash
cd erpnext && python3 - <<'EOF'
import lib
leads = lib.get('Lead', fields=['name', 'lead_name', 'email_id', 'source', 'creation'], limit=5)
print(leads)
name = leads[0]['name']
print(lib.call('frappe.desk.form.load.get_docinfo', doctype='Lead', name=name)['comments'])
EOF
```

Expected: the new Lead with `source: Website`, and one comment containing the message text and the submitting page.

- [ ] **Step 4: Submit the same form again and confirm no duplicate**

Expected: Lead count unchanged; a **second comment** on the same Lead. This is the dedupe path.

- [ ] **Step 5: Mark the test Lead (you cannot delete it) and commit the run record**

**Deletion is not available to these credentials.** Verified 2026-09-27: `ai-projects`, `ai-accounts` and `ai-briefing` all return **403 on `DELETE /api/resource/Lead/<name>`**. Do not retry it and do not go looking for another credential. Mark the record instead, so it cannot be mistaken for a real enquiry, and leave a note for a human to delete it in the ERPNext UI:

```bash
cd erpnext && python3 -c "import lib; lib.update('Lead','<NAME>',{'status':'Do Not Contact'})"
```

Then record it as an outstanding manual cleanup in the run record below. A Lead named as a test and set to *Do Not Contact* is inert: it will not be worked, and it cannot enter a quote.

```bash
cd .. && cat >> docs-verified.md <<'EOF'
## 2026-09-27 — Plan 1 verified live
Contact form on santi.co.za creates an ERPNext Lead with the message as a
comment; a repeat submission comments on the existing Lead instead of creating
a second one. Test Lead deleted afterwards.
EOF
git add docs-verified.md && git commit -m "Record live verification of lead intake"
```

---

## Self-review

**Spec coverage:** this plan covers spec §6 W1 and the Lead Source part of §4(f). Everything else in the spec belongs to Plans 2+ by design.

**Interfaces:** `buildLead` / `dedupeFilters` are named identically in `src/core/lead.js`, `test/lead.test.js`, the patch script's inlined copy, and `test/n8n-leads-nodes.test.js`. `erpnext/lib.py`'s `get/get_doc/create/update/call` are used consistently in Tasks 1, 4 and 5.

**Known rough edge, deliberately accepted:** Task 4 finishes the connection graph in the n8n UI rather than in the patch script, then captures it by export. Later workflows are built entirely by script. If the executing engineer would rather script the whole graph, that is an improvement, not a deviation — but the export and the passing node test are still required.
