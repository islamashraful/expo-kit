import Foundation

func localStoreTests() throws {
  let url = FileManager.default.temporaryDirectory
    .appendingPathComponent("ek-store-\(UUID().uuidString)")
    .appendingPathComponent("sync.sqlite")
  var store: LocalStore? = try LocalStore(url: url)
  let now = Date(timeIntervalSince1970: 1_700_000_000)

  // Meta and flags
  try store!.setMeta("state", Data([9, 8, 7]))
  check(try store!.meta("state") == Data([9, 8, 7]), "meta round trip")
  try store!.setMeta("state", nil)
  check(try store!.meta("state") == nil, "meta delete")
  check(try store!.flag("initialFetchDone") == false, "flag defaults to false")
  try store!.setFlag("initialFetchDone", true)
  check(try store!.flag("initialFetchDone"), "flag set")

  // Outbox: the latest change per record wins, sequences grow.
  let s1 = try store!.enqueue(type: "Shift", id: "a", operation: .save, fields: ["tips": 1.5], modifiedAt: now)
  let s2 = try store!.enqueue(type: "Shift", id: "a", operation: .save, fields: ["tips": 2.5], modifiedAt: now)
  let s3 = try store!.enqueue(type: "Venue", id: "a", operation: .save, fields: ["name": "Bar"], modifiedAt: now)
  check(s2 > s1 && s3 > s2, "sequences grow")
  check(try store!.outboxEntries().count == 2, "one entry per record, same id in two types is two records")
  check(try store!.outboxEntry("Shift.a")?.fields["tips"] == AnyHashable(2.5), "latest save wins")

  // Removing after upload only works if nothing changed meanwhile.
  check(try store!.removeOutbox("Shift.a", sequence: s1) == false, "stale upload doesn't remove a newer change")
  check(try store!.outboxEntry("Shift.a") != nil, "newer change still queued")
  check(try store!.removeOutbox("Shift.a", sequence: s2), "matching upload removes the change")
  check(try store!.outboxEntry("Shift.a") == nil, "removed")

  // A delete replaces a waiting save.
  try store!.enqueue(type: "Venue", id: "a", operation: .delete, fields: [:], modifiedAt: now)
  check(try store!.outboxEntry("Venue.a")?.operation == .delete, "delete replaces save")
  try store!.discardOutbox("Venue.a")
  check(try store!.outboxEntries().isEmpty, "discard")

  // System fields
  try store!.setSystemFields("Shift.a", Data([1, 2]))
  check(try store!.systemFields("Shift.a") == Data([1, 2]), "system fields round trip")
  try store!.setSystemFields("Shift.a", nil)
  check(try store!.systemFields("Shift.a") == nil, "system fields delete")

  // Inbox: ordered, a newer change to the same record replaces the undelivered older one.
  try store!.addInbox(type: "Shift", id: "x", operation: .save, fields: ["tips": 1.0])
  try store!.addInbox(type: "Shift", id: "y", operation: .save, fields: ["tips": 2.0])
  try store!.addInbox(type: "Shift", id: "x", operation: .delete, fields: [:])
  let inbox = try store!.inbox()
  check(inbox.map(\.id) == ["y", "x"], "inbox order, older x replaced")
  check(inbox.last?.operation == .delete, "latest change for x is the delete")
  try store!.ackInbox([inbox[0].sequence])
  check(try store!.inbox().map(\.id) == ["x"], "ack removes only acked entries")
  check(try store!.inbox(limit: 0).isEmpty, "limit works")

  // Everything survives closing and reopening (like an app kill).
  try store!.enqueue(type: "Shift", id: "b", operation: .save, fields: ["note": NSNull()], modifiedAt: now)
  store = nil
  store = try LocalStore(url: url)
  check(try store!.flag("initialFetchDone"), "flag survives reopen")
  check(try store!.outboxEntry("Shift.b") != nil, "outbox survives reopen")
  check(try store!.outboxEntry("Shift.b")?.fields["note"] == AnyHashable(NSNull()), "null survives as NSNull")
  check(try store!.inbox().count == 1, "inbox survives reopen")
  check(try store!.outboxEntry("Shift.b")?.modifiedAt == now, "modifiedAt survives")

  // Reset keeps queued local changes when asked, and never reuses a sequence number.
  let before = try store!.outboxEntry("Shift.b")!.sequence
  try store!.reset(keepOutbox: true)
  check(try !store!.flag("initialFetchDone") && store!.inbox().isEmpty, "reset clears sync state and inbox")
  check(try store!.outboxEntry("Shift.b") != nil, "reset keeps outbox when asked")
  let after = try store!.enqueue(type: "Shift", id: "c", operation: .save, fields: [:], modifiedAt: now)
  check(after > before, "sequence numbers aren't reused after a reset")
  try store!.reset(keepOutbox: false)
  check(try store!.outboxEntries().isEmpty, "full reset clears outbox")

  // Many threads at once.
  let group = DispatchGroup()
  let shared = store!
  for i in 0..<200 {
    DispatchQueue.global().async(group: group) {
      _ = try? shared.enqueue(type: "Shift", id: "t\(i % 50)", operation: .save, fields: ["n": i], modifiedAt: now)
      _ = try? shared.addInbox(type: "Venue", id: "v\(i)", operation: .save, fields: [:])
    }
  }
  group.wait()
  check(try store!.outboxEntries().count == 50, "parallel enqueues keep one entry per record")
  check(try store!.inbox(limit: 1000).count == 200, "parallel inbox writes all land")
  let sequences = try store!.outboxEntries().map(\.sequence)
  check(Set(sequences).count == sequences.count, "sequences are unique under load")
  let counts = try store!.counts()
  check(counts.outbox == 50 && counts.inbox == 200, "counts")
}
