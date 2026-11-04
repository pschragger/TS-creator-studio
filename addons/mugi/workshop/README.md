# Workshop – in-engine workshop, generic wrappers, local feature gating

## Server ([nakama/modules/index.js](../../../nakama/modules/index.js))
| RPC | Caller | Purpose |
|---|---|---|
| `mugi.workshop_submit` | user, **signed** (`secure_call`) | Create/update an item `{universe, id, kind, title, version, payload}`. Lands as `pending`; version must increase; only the original author may update. Requires feature `workshop_submit`. |
| `mugi.workshop_list` | user | Approved items for a universe (`mine:true` also shows your own pending ones). Paged via `cursor`. |
| `mugi.workshop_get` | user | One item (approved, or your own). |
| `mugi.workshop_review` | **server only** (`?http_key=`) | Set `approved`/`rejected`; must quote the scanned digest and version (see [gateway](../../../gateway/README.md)). |
| `mugi.features_get` | user | Feature flags for a universe (defaults: `workshop` on, `workshop_submit` off). |
| `mugi.features_set` | **server only** | Merge flags for a universe. |

Items are data-only JSON (kinds: mod, map, asset, tool, ruleset; max 32 KB). Updating an item resets it to `pending`, so the approved version is hidden until re-reviewed. Items live in per-universe collections `mugi_workshop_<universe>`.

Server-only RPCs: call with the runtime HTTP key (`runtime.http_key`, default `defaulthttpkey` – **change for production**), e.g. `POST /v2/rpc/mugi.features_set?http_key=...` with the payload as a JSON string.

## Client (Godot)
- `MugiClient` – generic wrapper for any game/tool client: `authenticate_device`, `call_rpc`, `handshake`, `call_signed`. All traffic goes through `MugiFirewall`.
- `MugiFeatures` – flags cached encrypted in `user://`, usable offline for 7 days. Gating is UX only; the server re-checks flags guarding writes.
- `MugiWorkshop` – `browse`, `submit`, `install` (via `mugi.market_get`, signature-verified), `uninstall`; installed items persist via `MugiSave`.

```gdscript
var client := MugiClient.new("http://127.0.0.1:7350"); add_child(client)
await client.authenticate_device("my-device-id-0001")
var keys := MugiSave.derive_keys(client.token, "u1")  # or a stable per-install secret
var features := MugiFeatures.new("u1", keys); await features.refresh(client)
var ws := MugiWorkshop.new(client, features, "u1", keys)
var page = await ws.browse()
```
For a self-signed server (local edge stack), set `client.tls_options = TLSOptions.client(cert)` first. Run the harness in [test_harness/](../../../test_harness) to exercise everything.

Note: keys derived from the session token change each login; use a stable per-install secret if saves must survive re-login.

## Version check

`MugiClient.authenticate_device()` calls `mugi.ping` and compares the backend's `mugi` protocol with `MugiClient.PROTOCOL`. On a mismatch it clears the token and returns `{ok: false, error: "mugi_version_mismatch", message: ...}`; the message says whether to update the addon or the backend. Set `verify_version = false` to skip it, or call `check_version()` yourself. Bump `RPC_VERSION` in `nakama/modules/index.js` and `PROTOCOL` together on breaking changes.
