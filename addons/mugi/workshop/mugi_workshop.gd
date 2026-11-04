class_name MugiWorkshop
extends RefCounted
## In-engine workshop: browse approved items, submit your own (pending review), and keep
## installed items in the encrypted local store. Items are data-only JSON; never execute them.

const INSTALLED_SLOT := "workshop_installed"

var client: MugiClient
var features: MugiFeatures
var universe: String
var keys: Dictionary
var installed: Dictionary = {}  # id -> item


func _init(p_client: MugiClient, p_features: MugiFeatures, p_universe: String, p_keys: Dictionary) -> void:
	client = p_client
	features = p_features
	universe = p_universe
	keys = p_keys
	var r := MugiSave.load_slot(universe, INSTALLED_SLOT, keys)
	if r.ok and r.data.get("items") is Dictionary:
		installed = r.data.items


func browse(cursor: String = "", mine: bool = false) -> Dictionary:
	if not features.enabled("workshop"):
		return {"ok": false, "error": "feature_disabled"}
	return await client.call_rpc("mugi.workshop_list", {"universe": universe, "cursor": cursor, "mine": mine})


func submit(id: String, title: String, kind: String, version: int, payload: Dictionary) -> Dictionary:
	if not features.enabled("workshop_submit"):
		return {"ok": false, "error": "feature_disabled"}
	return await client.call_signed("mugi.workshop_submit", {
		"universe": universe, "id": id, "title": title, "kind": kind, "version": version, "payload": payload})


## Installs via the marketplace endpoint and verifies the server's signature over id|version|digest.
func install(id: String) -> Dictionary:
	if client.signing_key == "":
		var h := await client.handshake()
		if not h.ok:
			return h
	var r := await client.call_rpc("mugi.market_get", {"universe": universe, "id": id})
	if not r.ok:
		return r
	var item: Dictionary = r.data.item
	var expect := MugiSigner.hmac_hex(client.signing_key, "%s|%d|%s" % [item.id, int(item.version), item.digest])
	if item.status != "approved" or not Crypto.new().constant_time_compare(expect.to_utf8_buffer(), str(r.data.sig).to_utf8_buffer()):
		return {"ok": false, "error": "verification_failed"}
	installed[id] = item
	var err := MugiSave.save(universe, INSTALLED_SLOT, {"items": installed}, keys)
	return {"ok": err == OK, "data": item, "error": "" if err == OK else "save_failed"}


func uninstall(id: String) -> void:
	installed.erase(id)
	MugiSave.save(universe, INSTALLED_SLOT, {"items": installed}, keys)
