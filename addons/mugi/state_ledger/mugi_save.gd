class_name MugiSave
extends RefCounted
## Local encrypted saves under user://. Files are AES-256-CBC (PKCS7, random IV)
## with an HMAC-SHA256 tag over IV+ciphertext (encrypt-then-MAC).
## Layout: "MUGI1" | IV(16) | HMAC(32) | ciphertext
## Keys come from the caller (e.g. derived from the Nakama session); never hardcode them.

const MAGIC := "MUGI1"
const SAVE_DIR := "user://mugi_saves"


static func derive_keys(secret: String, universe: String) -> Dictionary:
	var ctx := HashingContext.new()
	ctx.start(HashingContext.HASH_SHA256)
	ctx.update(("enc|" + universe + "|" + secret).to_utf8_buffer())
	var enc := ctx.finish()
	ctx.start(HashingContext.HASH_SHA256)
	ctx.update(("mac|" + universe + "|" + secret).to_utf8_buffer())
	return {"enc": enc, "mac": ctx.finish()}


static func _path(universe: String, slot: String) -> String:
	var rx := RegEx.create_from_string("^[A-Za-z0-9_-]{1,64}$")
	assert(rx.search(universe) != null and rx.search(slot) != null, "invalid universe/slot")
	return "%s/%s_%s.sav" % [SAVE_DIR, universe, slot]


static func save(universe: String, slot: String, data: Dictionary, keys: Dictionary) -> Error:
	DirAccess.make_dir_recursive_absolute(SAVE_DIR)
	var iv := Crypto.new().generate_random_bytes(16)
	var plain := JSON.stringify(data).to_utf8_buffer()
	var pad := 16 - (plain.size() % 16)
	for i in pad:
		plain.append(pad)
	var aes := AESContext.new()
	aes.start(AESContext.MODE_CBC_ENCRYPT, keys.enc, iv)
	var cipher := aes.update(plain)
	aes.finish()
	var tag := Crypto.new().hmac_digest(HashingContext.HASH_SHA256, keys.mac, iv + cipher)
	var f := FileAccess.open(_path(universe, slot), FileAccess.WRITE)
	if f == null:
		return FileAccess.get_open_error()
	f.store_buffer(MAGIC.to_utf8_buffer() + iv + tag + cipher)
	f.close()
	return OK


## Returns {"ok": bool, "data": Dictionary, "error": String}.
static func load_slot(universe: String, slot: String, keys: Dictionary) -> Dictionary:
	var f := FileAccess.open(_path(universe, slot), FileAccess.READ)
	if f == null:
		return {"ok": false, "error": "not_found"}
	var blob := f.get_buffer(f.get_length())
	f.close()
	var head := MAGIC.length()
	if blob.size() < head + 48 + 16 or blob.slice(0, head).get_string_from_utf8() != MAGIC:
		return {"ok": false, "error": "bad_format"}
	var iv := blob.slice(head, head + 16)
	var tag := blob.slice(head + 16, head + 48)
	var cipher := blob.slice(head + 48)
	if cipher.size() % 16 != 0:
		return {"ok": false, "error": "bad_format"}
	var expect := Crypto.new().hmac_digest(HashingContext.HASH_SHA256, keys.mac, iv + cipher)
	if not Crypto.new().constant_time_compare(tag, expect):
		return {"ok": false, "error": "tampered"}
	var aes := AESContext.new()
	aes.start(AESContext.MODE_CBC_DECRYPT, keys.enc, iv)
	var plain := aes.update(cipher)
	aes.finish()
	var pad: int = plain[plain.size() - 1]
	if pad < 1 or pad > 16:
		return {"ok": false, "error": "bad_padding"}
	var parsed = JSON.parse_string(plain.slice(0, plain.size() - pad).get_string_from_utf8())
	if typeof(parsed) != TYPE_DICTIONARY:
		return {"ok": false, "error": "bad_payload"}
	return {"ok": true, "data": parsed}
