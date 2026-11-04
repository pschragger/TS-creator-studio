# Security – HMAC-SHA256, nonces, offline firewall

## Server ([nakama/modules/index.js](../../../nakama/modules/index.js))
| RPC | Purpose |
|---|---|
| `mugi.handshake` | Returns the per-session signing key (hex) + server time. Key = HMAC(`MUGI_HMAC_SECRET`, `userId|token expiry`), so it expires with the session. Use TLS in production. |
| `mugi.secure_call` | Envelope `{rpc, ts, nonce, body, sig}`; `sig = hex(HMAC-SHA256(key, rpc|ts|nonce|body))`. |

`secure_call` checks, in order: allowlisted rpc → nonce format → timestamp within ±60 s → signature (constant-time) → nonce never seen (single-use, stored per user and purged after 2× the window). Replays, tampering, stale timestamps and wrong keys are rejected.

Write RPCs are only reachable through `secure_call` (currently `mugi.state_publish`; direct registration was removed). Add new write RPCs to `SIGNED_RPCS`. Reads (`state_read`, `ledger_verify`) stay plain.

Set `MUGI_HMAC_SECRET` in the environment for anything beyond local dev (compose default is `dev-only-change-me`).

## Client (Godot)
- [mugi_signer.gd](mugi_signer.gd) – builds signed envelopes (fresh nonce + timestamp; pass the handshake clock offset).
- [mugi_firewall.gd](mugi_firewall.gd) – offline firewall: `allow(url)` permits only allowlisted hosts and nothing in offline mode; intents queue in an encrypted outbox (`MugiSave`) and are signed fresh at `flush()` time.

```gdscript
var fw := MugiFirewall.new(["127.0.0.1"])
if fw.allow(url):
    var env := MugiSigner.envelope(key, "mugi.state_publish", {"universe": "u1", "type": "quest.done", "data": {}})
    # POST env as the JSON string payload to /v2/rpc/mugi.secure_call
else:
    fw.enqueue("mugi.state_publish", body); fw.persist("u1", keys)
```
## for full install -- later
Run edge/setup-certs.sh --trust yourself if you want browsers to accept the certificate