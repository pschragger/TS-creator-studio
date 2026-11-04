class_name MugiFirewall
extends RefCounted
## Offline firewall: every outbound request must pass `allow()`.
## - offline mode blocks all network traffic
## - only allowlisted hosts are reachable (default: none besides what you add)
## - blocked/offline signed calls are queued as *unsigned* intents in an encrypted outbox
##   (user:// via MugiSave) and signed fresh at flush time, so timestamps/nonces stay valid.

const OUTBOX_SLOT := "outbox"
const MAX_QUEUE := 500

var offline := false
var allowed_hosts: PackedStringArray = []
var _queue: Array = []


func _init(hosts: PackedStringArray = []) -> void:
	allowed_hosts = hosts


static func host_of(url: String) -> String:
	var s := url.get_slice("://", 1) if "://" in url else url
	var authority := s.get_slice("/", 0).get_slice("?", 0)
	authority = authority.substr(authority.rfind("@") + 1) # drop any userinfo
	return authority.get_slice(":", 0).to_lower()


func allow(url: String) -> bool:
	if offline:
		return false
	return host_of(url) in allowed_hosts


## Queue an intent for later; returns false when the outbox is full.
func enqueue(rpc: String, body: Dictionary) -> bool:
	if _queue.size() >= MAX_QUEUE:
		return false
	_queue.append({"rpc": rpc, "body": body})
	return true


func queue_size() -> int:
	return _queue.size()


func persist(universe: String, keys: Dictionary) -> Error:
	return MugiSave.save(universe, OUTBOX_SLOT, {"q": _queue}, keys)


func restore(universe: String, keys: Dictionary) -> void:
	var r := MugiSave.load_slot(universe, OUTBOX_SLOT, keys)
	if r.ok and r.data.get("q") is Array:
		_queue = r.data.q


## Drains the queue via `sender(rpc, body) -> bool`; stops at the first failure and keeps the rest.
func flush(sender: Callable) -> int:
	if offline:
		return 0
	var sent := 0
	while not _queue.is_empty():
		var item: Dictionary = _queue[0]
		if not sender.call(item.rpc, item.body):
			break
		_queue.pop_front()
		sent += 1
	return sent
