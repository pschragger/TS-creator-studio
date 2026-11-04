# TS Creator Studio: Proposed Design and Project Phases

## 1. Purpose and scope

TS Creator Studio lets creators authenticate with the Twilight Sovereign
multiverse, confirm their eligibility, build structured game features, and
manage submissions through review. Creators can improve content without
uploading executable code to the game or the studio.

The README identifies these core needs:

- Nakama login and new-user registration.
- Unique creator login and display names within the multiverse.
- A creator profile showing payment setup and player, admin, and VIP
  eligibility.
- Workshop availability based on the creator's permissions.
- In-progress and submitted feature lists, including status, costs, income,
  views, and comments.
- Creating projects, renaming them, cloning existing features, and submitting
  improved versions.
- Viewing feature content and progressing work through comments.
- Structured creation for dungeons, pocket universes, mana and skill systems,
  sovereign/avatar and job trees, creatures, and related game content.

This is a proposal, not a claim that these features or backend data models
already exist.

## 2. Platform decision: web first, Godot later

Most studio work is forms, tables, workflow, and review: login, profiles,
submission lists, comments, versioning, metrics, and schema-driven content
editing. A web application suits this better than Godot: no install for
creators, stronger form/table/accessibility tooling, faster iteration, and one
interface shared by creators, reviewers, and admins.

Godot remains valuable where game rules and rendering matter: previewing and
playtesting submissions, and visual or spatial editors (room/trap layout,
planet and physics tuning, tree visualization). It is added after the web
management workflow is working.

| Concern | Delivered by |
|---|---|
| Login, registration, name checks, profile, eligibility | Web app |
| Projects, drafts, clone, rename, versions, comments, review queue | Web app |
| Metrics and income dashboards | Web app |
| Schema-driven forms for most workshop content | Web app |
| Preview/playtest of submitted content | Godot (later phase) |
| Visual/spatial editors | Godot, embedded or launched from the web app (later phase) |
| Shared content format | Versioned, data-only JSON schemas used by both clients |

## 3. Proposed architecture

### Components

1. **Web app (primary studio)** — a single-page application served over TLS
   behind a reverse proxy such as nginx (nginx only terminates TLS and routes;
   it does not hold application logic). Screens: authentication/onboarding,
   creator dashboard, workshop catalog, schema-driven feature editor, project
   and submission manager, comments/review, and metrics.
2. **Nakama + MUGI backend (external)** — assumed already deployed and
   operated separately (by the MUGI server group). It is the authenticated
   system of record for identity, storage, and the MUGI ledger. This project
   does not deploy Nakama or PostgreSQL; both clients reach it over TLS and
   nothing connects to the database directly.
3. **MUGI server modules (external)** — extended for creator workflows
   (section 4) through the MUGI project's own release process.
4. **Optional studio Go service** — only if a need appears that Nakama handles
   poorly: payment webhooks, asset upload, or metrics aggregation. It is
   **not** needed for review: MUGI's server-only RPCs (`workshop_review`,
   `features_set`) need the Nakama `http_key`, and MUGI's edge nginx rejects
   such calls from outside its network. Human review is instead a user-callable,
   signed, role-checked RPC added to MUGI (see the
   [Phase 0 contract](./phase-0-contract.md)). Do not give this project an
   `http_key`, and do not rebuild auth or storage here.
5. **Godot preview/editor client (later)** — uses the MUGI addon to browse and
   install approved items, play them in game rules, and provide visual editors.
6. **Shared schema package** — JSON Schemas for each workshop type, with
   generated TypeScript types/validators for the web app and equivalent
   validation in the Godot client and server. One schema set prevents the
   clients drifting.

### Trust boundaries

All operations that change server state are authorized and validated
server-side (identity, ownership, permissions, schema, size). Client-side
gating, in either client, is a usability aid only. Authored content is
validated data and is never executed.

### Deployment topology

This project ships its own docker-compose stack. One nginx instance is enough
to serve both the web app and the Godot web export; nginx only serves static
files and proxies. Nakama and PostgreSQL are not part of the stack.

```
studio.example.com
  /            -> web app (static SPA)
  /api/mugi/   -> proxy to the external Nakama/MUGI (optional, see below)
  /api/studio/ -> optional studio Go service (payments, uploads)
play.studio.example.com   (Phase 6)
  /            -> Godot web export (static)
```

Compose services:

- `nginx` — TLS termination, static files, proxying, rate limits.
- `studio-api` — optional Go service (payments, uploads); not needed for
  review.
- No Nakama or Postgres. Configuration comes from environment: MUGI base URL,
  expected MUGI protocol version, and the Nakama server key (a client-side key,
  not a secret). No `http_key` or `MUGI_HMAC_SECRET` belongs in this stack.

nginx notes:

- **One nginx, several server blocks.** Split into separate containers only if
  the deployment cadence of the Godot export differs from the web app.
- **Separate origin for playtest.** Anything that renders creator-submitted
  content should run on its own origin (for example `play.` subdomain) so it
  cannot reach the studio's session or in-memory signing key. This is the
  strongest reason to keep a second server block.
- **Godot web export headers.** Threaded exports need
  `Cross-Origin-Opener-Policy: same-origin` and
  `Cross-Origin-Embedder-Policy: require-corp`. Set them only for the Godot
  origin/location. Serve `.wasm` as `application/wasm`, enable gzip or brotli,
  and cache fingerprinted files for a long time. If embedding the export in an
  iframe from the studio page, verify cross-origin isolation works in Phase 6,
  or fall back to a single-threaded export. A desktop Godot client is a
  download and is not served by nginx.
- **CSP per location.** The SPA uses a strict CSP because the HMAC session key
  is held in memory. The Godot export needs `wasm-unsafe-eval` and workers, so
  do not apply one global policy.
- **Direct vs proxied MUGI access.** Direct browser-to-Nakama is simplest but
  requires CORS for the studio origin on the external host and the host in the
  client allowlist. A same-origin proxy through nginx avoids CORS, pins the
  upstream, and enables rate limits, at the cost of one hop (and WebSocket
  upgrade passthrough if sockets are used). Prefer the proxy for the web app.
  Request signing stays in the browser; nginx must never hold the signing key.
  Note: MUGI's edge rate-limits 30 req/s per client IP using `$remote_addr`, so
  behind a proxy every creator would share one limit. The MUGI edge must trust
  this proxy's `X-Forwarded-For` (or exempt it); otherwise call MUGI directly
  and have the MUGI edge add CORS for the studio origin (it documents none).

### MUGI version compatibility and updates

The external backend and this project's MUGI code (TypeScript client, Godot
addon) can fall out of step. The addon's existing `mugi.ping` check only
reports which side is behind; it does not update anything. Do not self-update
code at runtime: pulling code into a running container is a supply-chain risk,
a browser cannot update itself, and the Godot addon change requires a rebuild.

Proposed flow:

1. On startup the app calls `mugi.ping` and compares the backend protocol with
   the one it was built for.
2. On mismatch, signed writes are blocked and the UI shows an "update required"
   state that says which side is behind. Reads may continue where safe.
3. Updates happen in CI. A scheduled job, or a webhook from the MUGI repo,
   pulls the new tagged addon and TypeScript client, runs the signing test
   vectors and schema tests, then builds and redeploys the containers.
4. Pin by tag or commit and verify a signature or checksum; never follow a
   moving branch automatically.
5. MUGI does not support a previous-protocol window today (`mugi.ping` returns
   only `{mugi, time}` and the client requires equality). Propose adding
   `capabilities` and `min_client` to `mugi.ping`, and keep additive RPCs from
   bumping `RPC_VERSION`, so deployments need not change at the same moment.
6. Promote through a staging environment before production, with a manual
   approval gate for protocol-breaking versions.

## 4. MUGI addon integration and extensions

### What MUGI provides today

The addon is a Godot script library (enabling the editor plugin is optional):

- `MugiClient` — device authentication, plain RPCs, handshake, signed calls,
  and protocol compatibility check (`mugi.ping`).
- `MugiFirewall` — host allowlist, offline blocking, and a queue of unsigned
  intents signed fresh at flush time.
- `MugiSigner` — builds `mugi.secure_call` envelopes:
  `sig = hex(HMAC-SHA256(key, rpc|ts|nonce|body))`.
- `MugiFeatures` — feature flags cached encrypted and usable offline for up to
  seven days; the server re-checks every flag guarding a write.
- `MugiSave` — AES-256-CBC with HMAC encrypted local saves.
- `MugiWorkshop` — browse approved data-only items, submit for review, and
  install approved items after signature verification.

On the server it provides `mugi.handshake`, `mugi.secure_call` (allowlisted
RPC, nonce, ±60 s timestamp, constant-time signature check, single-use nonces),
the append-only per-universe ledger (`mugi_ledger`, `mugi_ledger_head`), and
workshop and feature-flag RPCs. Items are data-only JSON, limited to 32 KB,
and land as pending until reviewed.

### How the web app uses MUGI

The Godot addon cannot run in a browser, so the web app needs a **TypeScript
MUGI client** that speaks the same protocol:

- Authenticate to Nakama, call `mugi.ping`, and verify the protocol version.
- Perform `mugi.handshake` and build signed envelopes with Web Crypto
  (`crypto.subtle`, HMAC-SHA256), matching `MugiSigner` exactly.
- Handle clock offset from the handshake, single-use nonces, and session
  expiry (the signing key expires with the session).
- Provide plain RPC calls with the Nakama JSON-string payload wrapping.

Define the signing format and protocol version in a shared contract with
cross-client test vectors so the GDScript and TypeScript clients stay
compatible. Keep the signing key in memory only, not in persistent browser
storage. Server drafts replace the Godot offline outbox for the web app.
`MugiSave` and `MugiFirewall` are not needed in the web client.

### Extensions required on the server and addon

Use existing RPCs where their semantics fit and extend the module in a
versioned, backward-compatible way (bump `RPC_VERSION` and `PROTOCOL`
together on breaking changes):

| Capability | Proposed behavior |
|---|---|
| Account authentication | The current client supports device authentication only. Add the Nakama account login/registration flows required by the README to the web client and, later, to the addon. Do not use a device ID as the creator's identity. |
| Creator profile | Read/update permitted fields; return verified role, level, VIP, and payment-setup status without exposing payment secrets. |
| Name availability | Check normalized login/display names and reserve them atomically. |
| Creator projects | Create, list, rename, clone, read, and save private drafts. |
| Versioning | Create immutable revisions; submit a specific revision; retain prior revisions and review outcomes. |
| Submission review | Studio lifecycle `draft → scanning → in_review → approved/rejected/changes_requested`. The MUGI gateway scan is the first stage; a signed, role-checked `mugi.studio_review_decide` is the human stage. Approved versions publish to the existing `mugi_workshop_<universe>` collection so current install paths work. Details in the [Phase 0 contract](./phase-0-contract.md). |
| Comments | Add/list comments scoped to a project and optionally a revision; enforce visibility server-side. |
| Metrics | Return authorized views, cost, and income summaries with defined windows; never accept client-reported values. |
| Workshop schemas | Return enabled workshop types, schema versions, constraints, and templates for data-driven editors. |

Every new write RPC goes through `mugi.secure_call`, is added to the server's
signed-RPC allowlist, and enforces authentication, ownership, permission, size,
and schema checks. Review transitions, version changes, and permission changes
are auditable via the ledger. For content larger than the 32 KB item limit,
store binaries in controlled object storage and persist an authorized
reference, digest, and size.

`MugiWorkshop` covers generic items and basic review only. Extend it where it
gives the Godot client shared behavior; do not force all studio data into
marketplace items.

## 5. Database and persistence requirements

### Recommendation

Persistence is required. Use the database behind Nakama as the authoritative
store, accessed through Nakama storage APIs and server-side transactions.
The database is owned by the external MUGI/Nakama deployment; confirm with that
group its PostgreSQL version, backup, and migration policy before production,
and request the storage collections or RPCs this project needs. Neither the web app nor Godot
connects to the database directly. A separate analytics database is optional
and only justified by reporting load or retention needs.

Build on the Nakama storage model and preserve MUGI's transactional ledger for
events needing an audit trail. The logical entities below may be Nakama
collections or relational tables behind a service; enforce the constraints at
the server/database boundary either way.

### Required logical entities

| Entity | Important fields and constraints |
|---|---|
| Creator profile | Nakama user ID (primary identity), normalized login/display names, multiverse/universe ID, profile fields, eligibility/role references, timestamps. Unique normalized names enforced by atomic reservation. |
| Creator eligibility | User ID, player/admin/VIP levels, payment setup status and permitted channel metadata, verification status, updated time. No payment credentials in profile reads or logs; use a provider token reference if payments are added. |
| Workshop definition | Stable type ID, schema version, enabled flag, required eligibility/flags, validation constraints, template references. Server definitions are authoritative. |
| Project | Stable ID, owner user ID, universe, workshop type, title, current revision, lifecycle status, timestamps. Owner-scoped access; index owner/status/update time. |
| Feature revision | Project ID, monotonic version, immutable payload or object-storage reference, schema version, content digest, author, created time. Unique `(project_id, version)`; validate payload and size. |
| Submission/review | Project and revision IDs, status, submitted time, reviewer, decision, reason, quoted digest/version. Keep history across resubmissions. |
| Comment | Project/revision IDs, author, body, visibility, created time, optional thread ID. Size limits and visibility rules. |
| Metrics | Project/revision ID, metric type (views, cost, income), amount/count, currency, time bucket, source. Derived from trusted server events; define attribution and windows first. |
| Name reservation | Normalized name, scope, owner user ID, state, optional expiry. Atomic writes prevent concurrent claims. |
| Audit event | Actor, action, resource, version/digest, timestamp, non-secret metadata. Use the MUGI hash-chain ledger where appropriate. |

### Behavior and operations

- Require authenticated ownership checks for private drafts and revisions.
- Make name claims, revision increments, and review transitions atomic.
- Approved/published revisions are immutable; editing creates a new revision.
- Store searchable metadata separately from large payloads; index owner,
  universe, workshop, status, and timestamps. Use cursor pagination.
- Define retention, deletion, and export behavior before launch.
- Back up the database and referenced object storage together; test restore and
  ledger verification.
- Record schema and workshop-definition versions so older content can be
  migrated or shown read-only.
- Web sessions: use secure, short-lived tokens with refresh, strict CORS/CSP,
  and rate limiting on authentication and name-check endpoints.
- Godot local MUGI saves are a cache, not a backup; use a stable per-install
  secret if they must survive re-login.

## 6. Proposed project phases

Phases are ordered by dependency; each ends with a demonstrable increment.

### Phase 0 — Product, contract, and deployment decisions

- Confirm Nakama login methods, creator identity rules, and the scope of name
  uniqueness.
- Define roles/eligibility, payment boundaries, workshop catalog, schemas,
  status transitions, metric definitions, and payload limits.
- Confirm the external Nakama/MUGI endpoint, its release/tagging process,
  protocol-compatibility window, and CORS/allowlist arrangements; decide direct
  vs proxied access (including edge rate limiting behind a proxy).
- Agree with the MUGI group how reviewer and admin roles are stored and how the
  review decision RPC is exposed without an `http_key` (see the Phase 0
  contract).
- Choose the web stack and agree on RPC shapes, authorization, and error
  conventions.

**Exit:** reviewed domain model, API contract, security boundaries, and
deployment decision.

### Phase 1 — Web foundation, authentication, and TypeScript MUGI client

- Set up the web project, navigation, environments, CI, and the docker-compose
  stack (nginx with TLS, CSP, routing, and the MUGI proxy).
- Implement the startup `mugi.ping` protocol check, the "update required" UI
  state, and the pinned, test-gated CI update pipeline for MUGI code.
- Build the TypeScript MUGI client: auth, ping/version check, handshake,
  signed envelopes, and shared test vectors against the GDScript signer.
- Add account login/registration and token lifecycle in Nakama and the client.
- Implement creator profile setup and atomic name availability/claim.
- Agree with the MUGI group on storage collections/migrations and backup
  coverage for creator data (the database itself is external).

**Exit:** a creator can register, sign in, claim a unique name, and load a
profile; signed calls verify against the server.

### Phase 2 — Profiles, eligibility, and workshop access

- Profile editing and verified eligibility display.
- Server-authoritative feature flags and workshop catalog/schema retrieval.
- Gate the UI by flags while the backend enforces access again.
- Privacy-safe payment-setup state and role visibility.

**Exit:** creators see only permitted workshops and why others are unavailable;
tampered client state grants no server access.

### Phase 3 — Projects, drafts, and first workshop

- Project list, create, rename, autosave/manual save, and clone.
- Server persistence of projects and revisions with owner checks.
- Schema-driven editor for one workshop end to end (for example skills or mana
  types), validating the data-only contract before expanding.
- Concurrency/conflict handling so edits never overwrite newer revisions.

**Exit:** a creator can create, resume, and clone a valid draft safely.

### Phase 4 — Submission, versioning, review, and comments

- Immutable revisions, submission of a specific revision, review history.
- Reviewer queue and decisions; changes-requested state if confirmed in
  Phase 0.
- Reviewer queue and decisions through the role-checked, signed
  `mugi.studio_review_decide` RPC (a MUGI change); reuse the MUGI gateway
  scanners as a first stage before human review.
- Comments and dashboard notifications; audit events for every decision.

**Exit:** a revision can be submitted, reviewed, and discussed; a later edit
creates a new revision without changing the prior outcome.

### Phase 5 — Metrics and workshop expansion

- Trusted views/cost/income aggregation and dashboards.
- Expand schema-driven editors to the remaining README categories: dungeons,
  pocket universes, mana and skill trees, sovereign/avatar and job trees,
  creatures, and skills (including VIP-restricted variants).
- Add object-storage handling if content exceeds the item limit.
- Resubmission pricing rules based on edit size, once defined.

**Exit:** server-derived metrics are shown, and planned workshop families are
available with versioned schemas.

### Phase 6 — Godot preview, playtest, and visual editors

- Extend the MUGI addon with the account-auth, project, and revision RPCs
  needed by Godot.
- Build a Godot preview/playtest client that loads approved or draft revisions
  by ID and renders them under game rules.
- Add visual editors where they add real value (dungeon room/trap layout,
  planetary physics, tree visualization). Choose between a launched desktop
  client and a web export embedded in the studio; both read and write the same
  schemas through the server.
- Reuse the encrypted local cache and offline outbox for desktop play and
  testing.
- Deploy the Godot web export on its own origin with scoped isolation headers
  and CSP, and confirm iframe embedding or the single-threaded fallback.

**Exit:** a creator can open a project from the web app, preview or playtest it
in Godot, and return saved changes as a new validated revision.

### Phase 7 — Hardening and release

- Test permissions, ownership, name-claim races, malformed/oversized payloads,
  signature failures, replay rejection, clock drift, and protocol mismatches
  across both clients.
- Test accessibility, performance, and query/pagination behavior.
- Validate TLS and secret rotation, CSP/CORS, backup restore, ledger
  verification, privacy, retention, and monitoring.
- Publish creator and reviewer guidance; define support and migration
  processes.

**Exit:** release checklist, recovery drill, compatibility policy, and
operational ownership approved.

## 7. Key risks and decisions

- **Two clients:** the web app and Godot must share schemas and the MUGI
  signing contract. Generate types/validators from one schema set and keep
  cross-client test vectors.
- **Authentication gap:** MUGI today only does device authentication; the
  README requires named accounts. Resolve in Phase 1.
- **Name uniqueness scope:** decide global vs per-multiverse and enforce
  atomically.
- **Payments:** decide whether the studio only displays setup status or
  initiates payments. Prefer provider-hosted, tokenized flows.
- **Review lifecycle:** MUGI documents pending/approved/rejected; decide on a
  distinct changes-requested state and resubmission history.
- **Content size and safety:** items are data-only and capped at 32 KB today;
  keep code out and plan external assets before larger uploads.
- **Web signing key handling:** the HMAC session key must stay in memory and
  expire with the session; protect against XSS with a strict CSP.
- **Godot embedding:** a web export has size, threading, and input limits;
  decide in Phase 6 between embedded export and launched desktop client.
- **External MUGI dependency:** availability, protocol changes, and CORS are
  controlled by another team. Agree on a compatibility window and release
  notifications, and degrade gracefully when the backend is unreachable.
- **Update supply chain:** automatic updates must be pinned, verified, and
  test-gated in CI; never pull code into running containers.
- **Server-only secrets:** the Nakama `http_key` and `MUGI_HMAC_SECRET` must
  never be in this project. MUGI's edge already blocks `http_key` calls from
  outside; review therefore depends on a MUGI-side signed, role-checked RPC.
- **Metric definitions:** define views, costs, and income attribution before
  presenting totals as authoritative.
