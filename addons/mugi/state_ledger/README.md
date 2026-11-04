# State ledger – state bus, Akashic ledger, local saves

Server side lives in [nakama/modules/index.js](../../../nakama/modules/index.js) (Nakama's JS runtime loads a single entrypoint).

| RPC | Payload | Result |
|---|---|---|
| `mugi.state_publish` (signed, via `mugi.secure_call` – see Security) | `{universe, type, data}` | `{ok, seq, hash}` – appends to the ledger and fans out on bus stream mode 100 |
| `mugi.state_read` | `{universe, since?, limit?}` | `{head, events[]}` – poll events after `since` (max 100) |
| `mugi.ledger_verify` | `{universe}` | `{ok, seq, hash}` or `{ok:false, brokenAt}` |

Ledger: per-universe append-only hash chain (`hash = sha256(prev|seq|universe|type|actor|ts|data)`) in the `mugi_ledger` collection; head in `mugi_ledger_head`. Entry and head are written in one transaction with version checks, so concurrent appends cannot fork the chain. Auth required; write calls must additionally be signed (see [security](../security/README.md)).

Local saves: [mugi_save.gd](mugi_save.gd) – AES-256-CBC + HMAC-SHA256 (encrypt-then-MAC) files in `user://mugi_saves/`. Keys are supplied by the caller via `MugiSave.derive_keys(secret, universe)`.

Reads are plain RPCs, e.g.:
```
curl -X POST "http://127.0.0.1:7350/v2/rpc/mugi.state_read" -H "Authorization: Bearer $TOKEN" \
  -d '"{\"universe\":\"u1\",\"since\":0}"'
```
Publishing requires a signed envelope (see [security](../security/README.md)).
