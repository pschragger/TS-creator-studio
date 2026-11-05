# Phase 0: Product and Backend Contract (Draft 3)

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
| Feature flags: per-universe booleans (`mugi_features`), defaults `workshop: true`, `workshop_submit: false`; names `[a-z0-9_]{1,48}`. | No per-user levels exist. Player, admin, and VIP levels, roles, and agreements are new data (sections 2-3). |
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
| D4 | Payments | Deferred. Recognition only for now (credit records, no payouts). When added later, use a hosted provider with token references. | Decided: defer |
| D5 | Lifecycle states | `draft`, `scanning`, `in_review`, `changes_requested`, `approved`, `rejected`, `withdrawn` (section 4). | OPEN |
| D6 | Is human review required in addition to the gateway scan? | Yes (the README expects "next step comments", costs, and resubmission). | OPEN |
| D7 | Reviewer eligibility | Nominated by a MUGI manager, must complete the required training, then activated. Reviewers are scoped to assigned workshops only (section 3.3). | Decided (mechanism OPEN, see D22-D24) |
| D8 | Browser access to MUGI | Prefer the studio's same-origin nginx proxy, but only if MUGI's edge trusts the proxy's `X-Forwarded-For` (real client IP for rate limiting) or exempts it. Otherwise call MUGI directly and add CORS to the MUGI edge. | OPEN |
| D9 | Inline payload limit | 32 KB (MUGI's `MAX_ITEM_BYTES`); larger content needs a MUGI/object-storage change in Phase 5. | Proposed |
| D10 | Protocol compatibility | Additive RPCs do not bump `RPC_VERSION`. Add `capabilities` and `min_client` to `mugi.ping`. A previous-protocol window is a MUGI feature to design. | OPEN |
| D11 | Universe scope | One `universe` per studio environment unless the game defines several. | OPEN |
| D12 | Metric definitions | Section 8; needs product sign-off. | OPEN |
| D13 | Where roles and levels live | New `mugi_studio_roles` collection (section 3.2) for creator/admin levels; the manager role comes from the Nakama group (D22); reviewer state lives in `mugi_studio_reviewer` (section 3.3). | OPEN |
| D14 | Engagement types | `employee`, `contractor`, `community` as an agreement record, separate from disciplines (`artist`, `audio`, `programmer`, `author`). | OPEN |
| D15 | Employee identity | Company identity provider (OIDC) linked to the Nakama account, if one exists; otherwise MUGI operators assign the employee agreement. | OPEN |
| D16 | Legal terms | Employee work-for-hire, contractor IP assignment, community contributor license; versioned and accepted per user before submitting. Business/legal supplies text. | OPEN |
| D17 | Programmer content | Declarative effect data only; real code stays in employee git review. | OPEN |
| D18 | Object storage and upload service | Needs an owner (MUGI group or this project); not in MUGI today. | OPEN |
| D19 | Validation worker placement | Inside MUGI's network next to the gateway (server-only RPCs are blocked at the edge), or a narrower worker interface added by MUGI. | OPEN |
| D20 | Asset budgets | Per-use limits for polycount, textures, bones, scale, audio loudness/length, effect power, supplied by game design. | OPEN |
| D22 | MUGI manager role | An employee role. Obtained through the Nakama console administrator, not self-service. Proposed mechanism: membership of a Nakama group `mugi_managers` set in the console and checked server-side with `nk.userGroupsList`, plus an `employee` agreement. | Decided (mechanism proposed) |
| D23 | Reviewer assignment | One or more workshops per reviewer, assigned by a manager. Each workshop (feature type) needs at least 2 active reviewers; a coverage report lists reviewers per workshop and flags any workshop below 2. | Decided |
| D24 | Reviewer training | Required learning modules per workshop (and a common core) must be complete before a nominee becomes `active`. Module content and pass criteria supplied by MUGI managers. | Decided (content OPEN) |
| D21 | Web stack | React + TypeScript + Vite static SPA behind nginx; Tailwind CSS v4 + shadcn/ui; TanStack Query, React Hook Form + Zod, Vitest, Playwright; shared TypeScript MUGI client. See the design document, "Web technology choices". | Decided: Vite, React, TypeScript, Tailwind. Remaining libraries proposed |

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
| `mugi_studio_profile` | creator | `profile` | username, display_name, created_at, updated_at |
| `mugi_studio_roles` | system | `<user_id>` | admin_level, vip_level, player_level, updated_at (manager comes from the Nakama group; reviewer from `mugi_studio_reviewer`) |
| `mugi_studio_reviewer` | system | `<user_id>` | state (nominated/training/active/suspended/retired), nominated_by, nominated_at, workshops[] (assigned), training progress per module, activated_at |
| `mugi_studio_training` | system | `<module_id>` | title, workshop or `core`, version, content_ref, pass criteria |
| `mugi_studio_agreement` | system | `<user_id>` | engagement_type, disciplines, terms_version, accepted_at, effective_from/to, rate_card_ref (later) |
| `mugi_studio_credit` | system | `<project_id>:<version>:<user_id>` | role, share_pct, recorded_at (written on approval; recognition now, royalties later) |
| `mugi_studio_asset` | creator | `<project_id>:<asset_id>` | object_key, original_digest, normalized_digest, type, size, dimensions/duration, status |
| `mugi_studio_report` | system | `<project_id>:<version>` | stage results (static, provenance, fit), measured values vs. budgets, findings, worker version, ts |
| `mugi_studio_budget` | system | `<use_id>` | per-use limits (polycount, texture size, bones, scale, loudness, length, effect power); supplied by game design |
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

### 3.3 Managers, reviewers, and coverage

- **Manager:** an employee holding the `mugi_managers` Nakama group (D22).
  Managers nominate and assign reviewers and see coverage. A manager cannot
  grant themselves manager access; only the console administrator can.
- **Reviewer lifecycle:** `nominated` (by a manager) → `training` (required
  modules in progress) → `active` (all required modules passed for at least
  one workshop) → `suspended` / `retired`. Nominees cannot self-nominate and
  cannot review until `active`.
- **Scope:** an active reviewer sees the queue and may decide only for
  workshops assigned to them, and only when the training for that workshop is
  complete. Assigning another workshop re-enters `training` for that workshop.
  A reviewer cannot decide on their own submissions or on submissions where
  they are a listed contributor.
- **Coverage:** every workshop needs at least 2 active reviewers other than the
  author. The coverage report lists reviewers per workshop. A workshop with
  fewer than 2 raises a manager alert and is marked `uncovered`; recommended
  behavior is that new submissions to that workshop still queue but the
  workshop can be switched off for submissions by a manager.
- Every nomination, assignment, training completion, suspension and decision
  writes an audit event.

### 3.4 Revision rules

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
| `draft` | `scanning` | creator | Schema valid, `workshop_submit` flag on, agreement accepted and discipline allowed, quota not exceeded, revision frozen, assets uploaded and referenced, queue record created. |
| `scanning` | `in_review` | worker | All automated stages passed: static scan, provenance, and headless Godot fit check (server-only call from MUGI's network; see D19). |
| `scanning` | `rejected` | worker | A stage failed; the validation report is stored and shown to the creator. |
| `scanning`/`in_review` | `withdrawn` | creator | Before a decision. |
| `in_review` | `approved` / `rejected` / `changes_requested` | reviewer | Active reviewer assigned to this workshop, not a contributor to it; quoted digest and version must match; reason required for the latter two. |
| `rejected`, `changes_requested`, `withdrawn`, `approved` | `draft` (new version) | creator | Editing creates version N+1. |

On `approved`, the server writes the approved item to
`mugi_workshop_<universe>` with `status: "approved"`, the digest, and the scan
report, and records `published_version`. Pending and in-review versions never
touch that collection, so the currently approved version stays live while a
newer one is reviewed. This avoids the hide-until-re-approved behavior of
`workshop_submit` without changing it.

On `approved`, the server also writes a `mugi_studio_credit` record for each
contributor and share (recognition only; payouts are deferred).

Review tier comes from the agreement record: employees may be fast-tracked
(for example skipping the human stage for low-risk content types, if policy
allows), contractors take the standard path, community submissions take the
strictest path with quotas. The automated stages are never skipped.

Required MUGI changes: add studio kinds (or a `feature` kind) to `ITEM_KINDS`,
extend the gateway to poll and scan the studio queue, and keep the existing
workshop RPCs backward compatible.

### 4.1 Assets and the validation gate

- MUGI items are JSON capped at 32,768 characters and its scanners reject
  opaque base64, so binaries cannot travel in items. Assets go to object
  storage through a signed-upload flow (D18); the item payload carries only the
  asset reference (`object_key`, `size`, `normalized_digest`).
- Workers produce a normalized, re-encoded copy; only that copy is published.
  The `digest` quoted at review covers the item JSON, which includes the
  normalized asset digest, so approval binds to the exact content.
- Validation worker stages: static scan, provenance (perceptual, audio, and
  text fingerprints, similarity, originality attestation, AI-use disclosure),
  and a headless Godot fit check against `mugi_studio_budget`. Provenance
  checks are heuristic and are recorded as findings, not guarantees.
- Programmer submissions are declarative effect data (D17): triggers,
  conditions, and effects from a whitelisted operation set with bounded
  parameters and power budgets, validated by schema and run in a deterministic
  headless simulation. No scripts or code strings are accepted.
- After publication a kill switch can set an approved item to a withdrawn
  state in `mugi_workshop_<universe>`; clients must honor it on next refresh.

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
| `mugi.studio_review_queue` | `{universe, status?, cursor?}` | `{ok, items, cursor}` (active reviewer; only assigned workshops) |
| `mugi.studio_training_list` | `{}` | `{ok, modules, progress}` for the caller (nominee or reviewer) |
| `mugi.studio_reviewer_list` | `{workshop?, state?, cursor?}` | `{ok, items, cursor}` (manager) |
| `mugi.studio_reviewer_coverage` | `{universe}` | `{ok, workshops: [{id, active_reviewers, nominees, covered}]}` (manager) |

### 5.2 Writes (signed via `mugi.secure_call`)

| RPC | Request | Key checks |
|---|---|---|
| `mugi.studio_profile_create` | `{universe, display_name}` | One profile per user; atomic name claim. |
| `mugi.studio_profile_update` | `{display_name?, expected_updated_at}` | Rename rate limit; atomic re-claim and release. |
| `mugi.studio_agreement_accept` | `{terms_version, engagement_type, disciplines}` | Engagement type must be one the user is allowed (employee/contractor assigned by operators; community is self-service); terms version must be current; age check for community. |
| `mugi.studio_asset_upload_begin` | `{project_id, type, size, sha256}` | Owner; discipline allowed; type on allowlist; size and quota limits; returns a short-lived signed upload target. |
| `mugi.studio_asset_upload_complete` | `{project_id, asset_id}` | Owner; verifies size and digest; queues sanitizing. |
| `mugi.studio_project_create` | `{universe, workshop, title}` | Workshop available to the creator; id and title limits. |
| `mugi.studio_project_rename` | `{project_id, title, expected_updated_at}` | Owner only. |
| `mugi.studio_project_clone` | `{project_id, version, title}` | Source visible to caller; workshop available. |
| `mugi.studio_revision_save` | `{project_id, payload, expected_version}` | Owner; draft only; schema valid; 32 KB limit. |
| `mugi.studio_project_submit` | `{project_id, version}` | Transition table; `workshop_submit` flag; writes queue record and audit event. |
| `mugi.studio_project_withdraw` | `{project_id, version}` | Only before a decision. |
| `mugi.studio_comment_add` | `{project_id, revision?, body, parent_id?}` | Owner, or reviewer assigned to the workshop; length limit. |
| `mugi.studio_review_decide` | `{project_id, version, decision, reason, digest}` | Active reviewer assigned to the workshop and not a contributor; quoted digest and version must match; publishes on approval and writes credit records; audit event. |
| `mugi.studio_item_withdraw_published` | `{project_id, reason}` | Assigned reviewer or manager; kill switch for a published item; audit event. |
| `mugi.studio_reviewer_nominate` | `{user_id}` | Manager only; target must hold an agreement and be eligible; state `nominated`. |
| `mugi.studio_reviewer_assign` | `{user_id, workshops[]}` | Manager only; adds workshops and the required training modules; can remove workshops. |
| `mugi.studio_reviewer_set_state` | `{user_id, state, reason}` | Manager only; suspend, reinstate or retire. |
| `mugi.studio_training_complete` | `{module_id, result?}` | Self; records completion only when the module's pass criteria are met (quiz or manager sign-off); activates the reviewer when all required modules are done. |
| `mugi.studio_workshop_submissions_set` | `{universe, workshop, enabled}` | Manager only; stop or resume submissions for an uncovered workshop. |

### 5.3 Server-only (MUGI network, `http_key`)

| RPC | Caller | Purpose |
|---|---|---|
| `mugi.studio_gateway_pending` | validation worker | Studio submissions in `scanning`, with digest and asset references. |
| `mugi.studio_gateway_result` | validation worker | Record each stage result and the validation report; move to `in_review` or `rejected`. |
| `mugi.studio_asset_normalized` | validation worker | Record the normalized asset copy (key, digest, metadata). |
| `mugi.studio_roles_set` | MUGI operators/tooling | Set levels for a user. Manager access is the Nakama group (D22), set in the console. |
| `mugi.studio_agreement_set` | MUGI operators/tooling | Assign employee or contractor agreements. |
| `mugi.studio_metric_ingest` | game servers | Write metric buckets. |

These are never called by the browser or by the studio's own services over the
public edge.

### 5.4 Errors and versioning

- Thrown `Error` messages use `<code>: <text>`, for example
  `name_taken: display name is already in use`. Codes: `unauthenticated`,
  `forbidden`, `not_found`, `conflict`, `invalid_transition`, `schema_invalid`,
  `payload_too_large`, `name_taken`, `name_invalid`, `rate_limited`,
  `feature_disabled`, `not_eligible`, `terms_required`, `asset_rejected`,
  `quota_exceeded`. (Signature and replay failures keep
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
| Cost | Fee charged for a submission or resubmission | Deferred with payments |
| Income | Creator share of revenue attributed to the content | Deferred with payments (attribution window and share **OPEN**) |

Only trusted server callers write metrics; owners and reviewers read them.
There is no billing or revenue source in MUGI today. Recognition (credit
records) is the only contributor-facing outcome in the first releases.

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
- Uploads: signed, short-lived targets only; per-user quotas and size limits;
  type allowlist; parse and re-encode only in sandboxed workers with no
  network access and resource limits; never serve an original upload.
- Agreement and terms acceptance are checked server-side on every submission;
  community contributors pass an age check before submitting or receiving
  credit.
- Credit records and agreements are written only by the server; contributors
  can read their own.

## 10. Questions for the MUGI group

1. Single `index.js` or a bundled multi-file module? Who owns releases and tags?
2. Will MUGI add studio kinds, the studio collections and RPCs, and gateway
   support for the studio queue?
3. Can the edge trust `X-Forwarded-For` from the studio proxy, and can it add
   CORS for the studio origin?
4. How and where are `admin_level`, `vip_level`, and `player_level` sourced,
   and who assigns employee and contractor agreements?
5. Is `mugi.ping` capabilities plus `min_client` acceptable, and is a
   previous-protocol window planned?
6. Backup, retention, and migration guarantees for studio collections and the
   ledger (Postgres now, CockroachDB later).
7. The 32 KB item limit cannot hold art or audio: who owns object storage, the
   signed-upload service, and the sanitizing workers (D18)?
8. Can validation workers (including a headless Godot instance) run inside
   MUGI's network next to the gateway, or will MUGI expose a narrower worker
   interface (D19)?
9. Who supplies the per-use asset and effect budgets (D20), and how are they
   versioned?
10. Can the manager role be a Nakama group (`mugi_managers`) managed by the
    console administrator and checked with `nk.userGroupsList` (D22)? Who
    supplies and maintains the reviewer training modules (D24)?

## 11. Exit criteria for Phase 0

- D1-D24 resolved or explicitly deferred (D4 is decided: defer payments).
- MUGI group has confirmed or amended sections 1, 3-5, and 10.
- First workshop schema drafted and checked against the MUGI scanners.
- Agreement terms (D16) and the effect-data model (D17) have owners.
- Cross-client canonical-JSON and signing test vectors agreed.
- Phase 1 backlog created from this contract.
