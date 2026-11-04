# Phase 0: Product and Backend Contract (Draft 2)

Companion to [proposed-design-and-project-phases.md](./proposed-design-and-project-phases.md).

This draft is grounded in the MUGI source
([pschragger/MUGI](https://github.com/pschragger/MUGI) at commit `5f7df1f`:
`nakama/modules/index.js`, `gateway/`, `edge/`, and the addon READMEs;
`RPC_VERSION = "1"`). Items marked **OPEN** need a decision. Anything described
as "proposed" does not exist in MUGI today and must be built in the MUGI
repository.

## 1. What MUGI already does (and what that means for the studio)

| MUGI fact (source) | Consequence for the studio |
|---|---|
| All server RPCs live in a single `nakama/modules/index.js` entrypoint; signed writes are registered in the `SIGNED_RPCS` map. | New studio RPCs are MUGI changes. Agree on module layout (single file vs. a build step that bundles several files) with the MUGI group. |
| `mugi.ping` returns only `{ok, mugi, time}`; the client requires `mugi == PROTOCOL`. There is no previous-protocol window. | Capabilities and a compatibility window are proposed additions, not existing behavior. |
| Responses are flat (`{ok: true, items, cursor}`); failures are thrown `Error("message")`, which the client surfaces as `error`. | Follow this convention instead of the `{ok, data}` envelope drafted earlier. Prefix messages with a stable code (section 6). |
| Workshop items: one record per item in `mugi_workshop_<universe>`, owned by `SYSTEM_USER`. Fields: `id` (`[A-Za-z0-9_-]{1,64}`), `kind` (`mod, map, asset, tool, ruleset`), `title` (1-80), integer `version` (must increase), `payload` (object, 32,768 chars max). | Studio content types need new `kind` values (or one `feature` kind with `payload.workshop`). Limits become the hard limits for inline content. |
| `workshop_submit` overwrites the record, sets `pending`, and hides the previously approved version until re-approved. | Confirmed conflict. Resolved in section 4: studio drafts and submissions live in studio collections; the workshop collection only ever receives approved versions. |
| Digest = SHA-256 of key-sorted JSON of `{id, kind, title, version, payload}`. Review must quote digest and version. | The studio uses the same digest so approved items install unchanged through `MugiWorkshop.install` / `mugi.market_get`. The web client must reproduce the canonical JSON exactly (shared test vectors). |
| The gateway (Python, on MUGI's private network) polls `mugi.gateway_pending`, scans, and calls server-only `mugi.workshop_review` with `status` `approved`/`rejected`. | Existing flow is automated scanning, not human review. Studio human review is new; the scanners should be reused as a first stage. If studio submissions were simply `pending` workshop items, the gateway would approve them with no human step. |
| Server-only RPCs (`workshop_review`, `gateway_pending`, `features_set`) require the runtime `http_key` and no user. The edge nginx returns 403 for any query string or Basic auth on `/v2/rpc/`, so **they cannot be called from outside MUGI's network**. | The studio cannot call them over the public edge. Do not give the studio an `http_key`. Human review is a user-callable, signed, role-checked RPC instead (section 5.2). Anything that truly needs `http_key` must run inside MUGI's network (like the gateway). |
| Feature flags: per-universe booleans (`mugi_features`), defaults `workshop: true`, `workshop_submit: false`; names `[a-z0-9_]{1,48}`. | No per-user levels exist. Player, admin, and VIP levels and payment readiness are new data (section 2). |
| Signing key = HMAC(`MUGI_HMAC_SECRET`, `key|userId|tokenExpiry`); nonces stored per user and purged after 2x the 60 s window. | The key changes when the session token is refreshed; the web client must re-run `mugi.handshake` after every refresh. |
| `mugi.register_server` accepts types `game`, `tool`, `workshop`, `gateway`. | The studio should register as a `tool` server. |
| The ledger (`ledgerAppend`) is internal; `mugi.state_publish` lets any signed-in user append arbitrary event types. | Studio audit events must be appended server-side inside studio RPCs, not published by clients. |
| Edge nginx: rate limit 30 req/s per IP (burst 60), keyed on `$remote_addr`; exposes `/v2/*`, `/ws`, `/healthz`; no CORS configuration is described. | If the studio's nginx proxies to MUGI, all creators share the proxy's IP and one rate limit. See D8. Browsers calling MUGI directly need CORS added on the MUGI edge. |
| Storage is Nakama on Postgres (CockroachDB is documented as future work). `nk.storageList` is per owner and collection; the workshop list scans a page and filters, so there is no per-author index. | Store creator data under the creator's own user ID so owner listing is native. Use a system-owned index collection for the reviewer queue. |

## 2. Decision register

| # | Decision | Recommended default | Status |
|---|---|---|---|
| D1 | Login method | Nakama email + password with a chosen username (`/v2/account/authenticate/email`). Device auth remains for the Godot client. | OPEN |
| D2 | Name uniqueness | Nakama usernames are already unique per Nakama deployment (login name needs no extra work). Display names are not unique in Nakama, so reserve them (section 3.1). | OPEN |
| D3 | Separate login and display names | Yes: `username` (login) and `display_name` (changeable, rate-limited, unique). | OPEN |
| D4 | Payments | Studio shows payment setup status only; collection is via a hosted provider with a token reference. | OPEN |
| D5 | Lifecycle states | `draft`, `scanning`, `in_review`, `changes_requested`, `approved`, `rejected`, `withdrawn` (section 4). | OPEN |
| D6 | Is human review required in addition to the gateway scan? | Yes (the README expects "next step comments", costs, and resubmission). | OPEN |
| D7 | Reviewer eligibility | Stored role in `mugi_studio_roles`, assigned by MUGI operators. | OPEN |
| D8 | Browser access to MUGI | Prefer the studio's same-origin nginx proxy, but only if MUGI's edge trusts the proxy's `X-Forwarded-For` (real client IP for rate limiting) or exempts it. Otherwise call MUGI directly and add CORS to the MUGI edge. | OPEN |
| D9 | Inline payload limit | 32 KB (MUGI's `MAX_ITEM_BYTES`); larger content needs a MUGI/object-storage change in Phase 5. | Proposed |
| D10 | Protocol compatibility | Additive RPCs do not bump `RPC_VERSION`. Add `capabilities` and `min_client` to `mugi.ping`. A previous-protocol window is a MUGI feature to design. | OPEN |
| D11 | Universe scope | One `universe` per studio environment unless the game defines several. | OPEN |
| D12 | Metric definitions | Section 8; needs product sign-off. | OPEN |
| D13 | Where roles and levels live | New `mugi_studio_roles` collection (section 3.2), written by MUGI-side tooling or game servers. | OPEN |

## 3. Domain model

IDs are server-generated opaque strings matching `[A-Za-z0-9_-]{1,64}`.
Timestamps are UTC milliseconds.

### 3.1 Identity and names

- Login name: Nakama's own unique `username`. The studio adds no reservation
  for it, but its name rules must be validated by the registration flow.
- Display name: reserve in `mugi_studio_names` (system-owned), key
  `normalized`, written with `version: "*"` (the same conditional-write pattern
  MUGI uses for nonces) so the second concurrent claim fails.
- `normalize(name)`: Unicode NFKC, trim, collapse whitespace, case-fold. Reject
  confusables and reserved words (admin, staff, mugi, sovereign...). Length 3-32.
- `mugi.studio_name_check` is advisory; the claim inside `profile_create` or
  `profile_update` is authoritative. Rate limit it.

### 3.2 Collections (proposed)

Creator data is stored under the creator's user ID so `nk.storageList(userId,
collection)` lists their own records. Records use `permissionRead: 1` (owner
read) and `permissionWrite: 0` (server only), matching MUGI's pattern of
writing only from RPCs.

| Collection | Owner | Key | Value (summary) |
|---|---|---|---|
| `mugi_studio_profile` | creator | `profile` | username, display_name, payment_form, created_at, updated_at |
| `mugi_studio_roles` | system | `<user_id>` | role, admin_level, vip_level, player_level, payment_ready, updated_at |
| `mugi_studio_names` | system | `<normalized>` | user_id, created_at |
| `mugi_studio_project` | creator | `<project_id>` | universe, workshop, title, status, latest_version, published_version, cloned_from, created_at, updated_at |
| `mugi_studio_revision` | creator | `<project_id>:<version>` | schema_version, title, payload, digest, size, created_at (immutable once submitted) |
| `mugi_studio_queue` | system | `<universe>:<project_id>:<version>` | owner_id, status, submitted_at, scan report, reviewer decision |
| `mugi_studio_comment` | system | `<project_id>:<comment_id>` | revision, author_id, body, visibility, parent_id, created_at |
| `mugi_studio_metric` | system | `<project_id>:<bucket>` | views, cost, income, currency |
| `mugi_studio_workshop_def` | system | `<workshop_id>` | schema, schema_version, enabled, required flags, min levels |

Published, approved content goes to the existing
`mugi_workshop_<universe>` collection so the game's current browse and install
path works unchanged (section 4).

### 3.3 Revision rules

- Versions are integers increasing per project, assigned by the server; they
  map directly to MUGI's workshop `version`.
- `digest = sha256(canon({id, kind, title, version, payload}))`, identical to
  MUGI's `itemDigest`, where `id` is the project ID and `kind` is the studio
  kind.
- A draft revision may be saved repeatedly (guarded by `expected_version`);
  submission freezes it.
- Cloning copies the chosen revision's payload into a new project with
  `cloned_from`. Comments, metrics, and review history are not copied.

## 4. Lifecycle and publication

| From | To | Actor | Condition |
|---|---|---|---|
| (none) | `draft` | creator | Create or clone. |
| `draft` | `draft` | creator | Save. |
| `draft` | `scanning` | creator | Schema valid, `workshop_submit` flag on, creator eligible, revision frozen, queue record created. |
| `scanning` | `in_review` | gateway | Scan passed (server-only call from MUGI's network). |
| `scanning` | `rejected` | gateway | Scan findings stored with the record. |
| `scanning`/`in_review` | `withdrawn` | creator | Before a decision. |
| `in_review` | `approved` / `rejected` / `changes_requested` | reviewer | Role check; quoted digest and version must match; reason required for the latter two. |
| `rejected`, `changes_requested`, `withdrawn`, `approved` | `draft` (new version) | creator | Editing creates version N+1. |

On `approved`, the server writes the approved item to
`mugi_workshop_<universe>` with `status: "approved"`, the digest, and the scan
report, and records `published_version`. Pending and in-review versions never
touch that collection, so the currently approved version stays live while a
newer one is reviewed. This avoids the hide-until-re-approved behavior of
`workshop_submit` without changing it.

Required MUGI changes: add studio kinds (or a `feature` kind) to `ITEM_KINDS`,
extend the gateway to poll and scan the studio queue, and keep the existing
workshop RPCs backward compatible.

## 5. RPC contract (proposed additions to `index.js`)

Naming: `mugi.studio_<noun>_<verb>`. Plain RPCs for reads. Writes go through
`mugi.secure_call` and must be added to `SIGNED_RPCS`.

### 5.1 Reads (plain, authenticated)

| RPC | Request | Response |
|---|---|---|
| `mugi.studio_name_check` | `{kind: "display", name}` | `{ok, available, normalized}` |
| `mugi.studio_profile_get` | `{universe}` | `{ok, profile, roles}` |
| `mugi.studio_workshop_list` | `{universe}` | `{ok, workshops: [{id, available, reason, schema_version}]}` |
| `mugi.studio_workshop_schema_get` | `{universe, workshop}` | `{ok, schema, schema_version, constraints}` |
| `mugi.studio_project_list` | `{universe, status?, cursor?}` | `{ok, items, cursor}` (owner-scoped `storageList`) |
| `mugi.studio_project_get` | `{universe, project_id, version?}` | `{ok, project, revision}` |
| `mugi.studio_revision_list` | `{universe, project_id, cursor?}` | `{ok, items, cursor}` with review outcomes |
| `mugi.studio_comment_list` | `{universe, project_id, revision?, cursor?}` | `{ok, items, cursor}` |
| `mugi.studio_metric_get` | `{universe, project_id, from?, to?}` | `{ok, buckets}` |
| `mugi.studio_review_queue` | `{universe, status?, cursor?}` | `{ok, items, cursor}` (reviewer role) |

### 5.2 Writes (signed via `mugi.secure_call`)

| RPC | Request | Key checks |
|---|---|---|
| `mugi.studio_profile_create` | `{universe, display_name, payment_form?}` | One profile per user; atomic name claim. |
| `mugi.studio_profile_update` | `{display_name?, payment_form?, expected_updated_at}` | Rename rate limit; atomic re-claim and release. |
| `mugi.studio_project_create` | `{universe, workshop, title}` | Workshop available to the creator; id and title limits. |
| `mugi.studio_project_rename` | `{project_id, title, expected_updated_at}` | Owner only. |
| `mugi.studio_project_clone` | `{project_id, version, title}` | Source visible to caller; workshop available. |
| `mugi.studio_revision_save` | `{project_id, payload, expected_version}` | Owner; draft only; schema valid; 32 KB limit. |
| `mugi.studio_project_submit` | `{project_id, version}` | Transition table; `workshop_submit` flag; writes queue record and audit event. |
| `mugi.studio_project_withdraw` | `{project_id, version}` | Only before a decision. |
| `mugi.studio_comment_add` | `{project_id, revision?, body, parent_id?}` | Owner or reviewer; length limit. |
| `mugi.studio_review_decide` | `{project_id, version, decision, reason, digest}` | Reviewer role; quoted digest and version must match; publishes on approval; audit event. |

### 5.3 Server-only (MUGI network, `http_key`)

| RPC | Caller | Purpose |
|---|---|---|
| `mugi.studio_gateway_pending` | gateway | Studio submissions in `scanning`, with digest. |
| `mugi.studio_gateway_result` | gateway | Record scan outcome and move to `in_review` or `rejected`. |
| `mugi.studio_roles_set` | MUGI operators/tooling | Set role and levels for a user. |
| `mugi.studio_metric_ingest` | game servers | Write metric buckets. |

These are never called by the browser or by the studio's own services over the
public edge.

### 5.4 Errors and versioning

- Thrown `Error` messages use `<code>: <text>`, for example
  `name_taken: display name is already in use`. Codes: `unauthenticated`,
  `forbidden`, `not_found`, `conflict`, `invalid_transition`, `schema_invalid`,
  `payload_too_large`, `name_taken`, `name_invalid`, `rate_limited`,
  `feature_disabled`, `not_eligible`. (Signature and replay failures keep
  MUGI's existing messages: `bad signature`, `stale timestamp`,
  `replayed nonce`.)
- Additive RPCs do not change `RPC_VERSION`. Add `capabilities` (list of
  studio RPC names/versions) and `min_client` to the `mugi.ping` response so
  clients detect missing features without a protocol bump.

## 6. Authentication and session contract

- Browser: Nakama email authentication with `create=true` for registration.
  The Nakama server key is a client-side key, not a secret; keep it in
  configuration, not code.
- After authentication call `mugi.ping`, verify `mugi`, then `mugi.handshake`
  for the session signing key and clock offset. Re-run the handshake whenever
  the session token is refreshed.
- Keep the token and signing key in memory. **OPEN:** whether a studio-service
  session cookie is worth the extra service for reload persistence.
- Registration is two steps: Nakama account, then `profile_create`. An account
  without a profile can only call `profile_create` and `name_check`.

## 7. Workshop definitions and content schemas

- Stable `workshop_id` values: `dungeon`, `pocket_universe`, `mana`,
  `sovereign_avatar`, `skill`; README sub-kinds (rooms, traps, planets, ...)
  are fields inside the payload unless eligibility or review differs.
- Payloads are data only. MUGI's scanners reject code-like strings, `res://`,
  `user://`, `file://`, `javascript:`, path traversal, markup, external URLs
  (unless in `GATEWAY_ALLOWED_HOSTS`), forbidden keys, opaque base64, control
  characters, and excessive depth/size. Schemas should be written so valid
  content never trips these heuristics.
- Skills carry availability metadata (innate, creature, race, job, sovereign,
  combined, vip) with a `vip_level` restriction, per the README.
- Recommended first workshop (Phase 3): `skill` or `mana` (flat data).
  **OPEN.**
- One shared schema package for the web app, MUGI validation, and Godot.

## 8. Metrics (draft definitions, D12)

| Metric | Definition | Source |
|---|---|---|
| Views | Distinct non-owner viewers per day who loaded approved content | Game servers via `studio_metric_ingest` |
| Cost | Fee charged to the creator for a submission or resubmission | Studio billing (**OPEN**) |
| Income | Creator share of revenue attributed to the content | Payments backend (attribution window and share **OPEN**) |

Only trusted server callers write metrics; owners and reviewers read them.
There is no billing or revenue source in MUGI today.

## 9. Security and operational constraints

- Every write is authenticated, signed, ownership- or role-checked,
  schema-validated, and size-limited.
- Review quotes digest and version; mismatch rejects (same rule as
  `workshop_review`).
- Comment text is untrusted; render as plain text.
- Rate-limit name checks, comments, project creation, and registration; account
  for the MUGI edge limit (30 req/s per IP) when proxying.
- Studio audit events are appended with `ledgerAppend` inside the RPC
  (profile creation, name claims, submissions, decisions, publications).
- The studio holds no Nakama `http_key`, and `MUGI_HMAC_SECRET` stays on the
  MUGI side.

## 10. Questions for the MUGI group

1. Single `index.js` or a bundled multi-file module? Who owns releases and tags?
2. Will MUGI add studio kinds, the studio collections and RPCs, and gateway
   support for the studio queue?
3. Can the edge trust `X-Forwarded-For` from the studio proxy, and can it add
   CORS for the studio origin?
4. How and where are `admin_level`, `vip_level`, `player_level`, and
   `payment_ready` sourced?
5. Is `mugi.ping` capabilities plus `min_client` acceptable, and is a
   previous-protocol window planned?
6. Backup, retention, and migration guarantees for studio collections and the
   ledger (Postgres now, CockroachDB later).
7. Is the 32 KB item limit expected to change, or should large content use
   object storage?

## 11. Exit criteria for Phase 0

- D1-D13 resolved or explicitly deferred.
- MUGI group has confirmed or amended sections 1, 3-5, and 10.
- First workshop schema drafted and checked against the MUGI scanners.
- Cross-client canonical-JSON and signing test vectors agreed.
- Phase 1 backlog created from this contract.
