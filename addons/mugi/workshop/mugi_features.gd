class_name MugiFeatures
extends RefCounted
## Local feature gating. Flags come from `mugi.features_get`, are cached encrypted in user://,
## and keep working offline until the cache goes stale. This is UX/consistency gating only:
## the server re-checks every flag that guards a write (e.g. workshop_submit).

const SLOT := "features"
const MAX_AGE_MS := 7 * 24 * 3600 * 1000

var universe: String
var keys: Dictionary
var flags: Dictionary = {"workshop": true, "workshop_submit": false}
var fetched_ms := 0


func _init(p_universe: String, p_keys: Dictionary) -> void:
	universe = p_universe
	keys = p_keys
	var r := MugiSave.load_slot(universe, SLOT, keys)
	if r.ok and r.data.get("flags") is Dictionary:
		var age := int(Time.get_unix_time_from_system() * 1000.0) - int(r.data.get("fetched", 0))
		if age >= 0 and age <= MAX_AGE_MS:
			flags = r.data.flags
			fetched_ms = int(r.data.fetched)


func enabled(name: String) -> bool:
	return flags.get(name, false) == true


func refresh(client: MugiClient) -> bool:
	var r := await client.call_rpc("mugi.features_get", {"universe": universe})
	if not r.ok or not r.data.get("features") is Dictionary:
		return false
	flags = r.data.features
	fetched_ms = int(Time.get_unix_time_from_system() * 1000.0)
	MugiSave.save(universe, SLOT, {"flags": flags, "fetched": fetched_ms}, keys)
	return true
