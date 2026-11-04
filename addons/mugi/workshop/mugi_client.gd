class_name MugiClient
extends Node
## Generic backend wrapper shared by game and tool clients: auth, handshake, plain and signed RPCs.
## All traffic passes through MugiFirewall. Calls are coroutines: `var r = await client.call_rpc(...)`.
## Every call returns {"ok": bool, "data": Variant, "error": String}.

var base_url := "http://127.0.0.1:7350"
var server_key := "defaultkey"
var firewall: MugiFirewall
var token := ""
var signing_key := ""
var time_offset_ms := 0
## Optional extra trust anchor (PEM) for self-signed/private-CA servers; null uses the system CAs.
var tls_options: TLSOptions = null
## Backend protocol this addon speaks; must equal `mugi` returned by mugi.ping.
const PROTOCOL := "1"
## Set false to skip the automatic mugi.ping compatibility check after authenticating.
var verify_version := true
var server_protocol := ""


func _init(url: String = "http://127.0.0.1:7350", fw: MugiFirewall = null) -> void:
	base_url = url
	firewall = fw if fw != null else MugiFirewall.new([MugiFirewall.host_of(url)])


func _http(path: String, headers: PackedStringArray, body: String) -> Dictionary:
	var url := base_url + path
	if not firewall.allow(url):
		return {"ok": false, "error": "blocked_by_firewall"}
	var req := HTTPRequest.new()
	req.timeout = 15.0
	if tls_options != null:
		req.set_tls_options(tls_options)
	add_child(req)
	var err := req.request(url, headers, HTTPClient.METHOD_POST, body)
	if err != OK:
		req.queue_free()
		return {"ok": false, "error": "request_failed"}
	var res: Array = await req.request_completed
	req.queue_free()
	if res[0] != HTTPRequest.RESULT_SUCCESS:
		return {"ok": false, "error": _transport_error(res[0])}
	var parsed = JSON.parse_string(res[3].get_string_from_utf8())
	if res[1] != 200 or typeof(parsed) != TYPE_DICTIONARY:
		var msg := str(parsed.get("message", "http_%d" % res[1])) if typeof(parsed) == TYPE_DICTIONARY else "http_%d" % res[1]
		return {"ok": false, "error": msg}
	return {"ok": true, "data": parsed}


func _transport_error(result: int) -> String:
	match result:
		HTTPRequest.RESULT_TLS_HANDSHAKE_ERROR:
			return "tls_handshake_failed (server certificate not trusted; set tls_options with your CA)"
		HTTPRequest.RESULT_CANT_CONNECT, HTTPRequest.RESULT_CANT_RESOLVE, HTTPRequest.RESULT_CONNECTION_ERROR:
			return "cannot_connect (is the server running?)"
		HTTPRequest.RESULT_TIMEOUT:
			return "timeout"
	return "transport_error_%d" % result


func authenticate_device(device_id: String) -> Dictionary:
	var basic := "Basic " + Marshalls.utf8_to_base64(server_key + ":")
	var r := await _http("/v2/account/authenticate/device?create=true",
		["Content-Type: application/json", "Authorization: " + basic], JSON.stringify({"id": device_id}))
	if r.ok:
		token = r.data.get("token", "")
		if verify_version:
			var v := await check_version()
			if not v.ok:
				token = ""
				return v
	return r


## Calls mugi.ping and confirms the backend protocol matches this addon.
func check_version() -> Dictionary:
	var p := await call_rpc("mugi.ping")
	if not p.ok:
		return {"ok": false, "error": "mugi_ping_failed",
			"message": "MUGI backend did not answer mugi.ping (is it the MUGI Nakama module?): " + str(p.get("error", p))}
	server_protocol = str(p.data.get("mugi", ""))
	if server_protocol != PROTOCOL:
		return {"ok": false, "error": "mugi_version_mismatch", "server_protocol": server_protocol,
			"addon_protocol": PROTOCOL, "message": _mismatch_message()}
	return {"ok": true, "data": p.data}


func addon_version() -> String:
	var cfg := ConfigFile.new()
	var path: String = (get_script() as Script).resource_path.get_base_dir().get_base_dir().path_join("plugin.cfg")
	return str(cfg.get_value("plugin", "version", "unknown")) if cfg.load(path) == OK else "unknown"


func _mismatch_message() -> String:
	var server_newer := server_protocol.is_valid_int() and server_protocol.to_int() > PROTOCOL.to_int()
	var head := "MUGI version mismatch: addon %s speaks protocol %s, backend speaks protocol %s.\n" % [
		addon_version(), PROTOCOL, server_protocol if server_protocol != "" else "(unknown)"]
	if server_newer:
		return head + "To fix: update the addon. In the MUGI repo run `git pull && git checkout <tag>`, then refresh addons/mugi in this project (git submodule update --remote, or re-copy addons/mugi) and restart the editor."
	return head + "To fix: update the backend. In the MUGI repo run `git pull`, then `docker-compose -f docker-compose.yml -f docker-compose.edge.yml up -d --force-recreate nakama` so Nakama reloads nakama/modules/index.js. Or pin this project to an older MUGI tag that speaks protocol %s." % server_protocol


## Plain (unsigned) RPC; payload is wrapped as the JSON string Nakama expects.
func call_rpc(rpc: String, body: Dictionary = {}) -> Dictionary:
	var r := await _http("/v2/rpc/" + rpc, ["Content-Type: application/json", "Authorization: Bearer " + token],
		JSON.stringify(JSON.stringify(body)))
	if not r.ok:
		return r
	var inner = JSON.parse_string(r.data.get("payload", "null"))
	return {"ok": true, "data": inner}


func handshake() -> Dictionary:
	var r := await call_rpc("mugi.handshake")
	if r.ok:
		signing_key = r.data.key
		time_offset_ms = int(r.data.serverTime) - int(Time.get_unix_time_from_system() * 1000.0)
	return r


## Signed RPC via mugi.secure_call (required for write RPCs).
func call_signed(rpc: String, body: Dictionary) -> Dictionary:
	if signing_key == "":
		var h := await handshake()
		if not h.ok:
			return h
	return await call_rpc("mugi.secure_call", MugiSigner.envelope(signing_key, rpc, body, time_offset_ms))
