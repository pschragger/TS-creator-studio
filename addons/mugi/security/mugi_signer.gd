class_name MugiSigner
extends RefCounted
## Builds signed `mugi.secure_call` envelopes.
## sig = hex(HMAC-SHA256(key, rpc|ts|nonce|body)); the key is the hex string from `mugi.handshake`.


static func new_nonce() -> String:
	return Crypto.new().generate_random_bytes(16).hex_encode()


static func hmac_hex(key: String, msg: String) -> String:
	return Crypto.new().hmac_digest(HashingContext.HASH_SHA256, key.to_utf8_buffer(), msg.to_utf8_buffer()).hex_encode()


## `server_time_offset_ms` = serverTime (from handshake) minus local Time, to tolerate clock drift.
static func envelope(key: String, rpc: String, body: Dictionary, server_time_offset_ms: int = 0) -> Dictionary:
	var ts := int(Time.get_unix_time_from_system() * 1000.0) + server_time_offset_ms
	var nonce := new_nonce()
	var body_str := JSON.stringify(body)
	return {
		"rpc": rpc, "ts": ts, "nonce": nonce, "body": body_str,
		"sig": hmac_hex(key, "%s|%d|%s|%s" % [rpc, ts, nonce, body_str]),
	}
