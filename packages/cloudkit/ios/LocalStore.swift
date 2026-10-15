import Foundation
import SQLite3

/// The module's own SQLite file. Survives app kills, so no change is lost between
/// the app, the sync engine and iCloud. Safe to use from any thread.
final class LocalStore {
  enum Operation: String {
    case save, delete
  }

  /// A change waiting to be uploaded. Only the latest change per record is kept.
  struct OutboxEntry: Equatable {
    let recordName: String
    let type: String
    let id: String
    let operation: Operation
    /// JSON-safe fields (empty for deletes).
    let fields: [String: AnyHashable]
    let modifiedAt: Date
    /// Grows with every change, so an upload can tell if the record changed meanwhile.
    let sequence: Int64
  }

  /// A change from iCloud waiting for the app to apply it.
  struct InboxEntry: Equatable {
    let sequence: Int64
    let type: String
    let id: String
    let operation: Operation
    let fields: [String: AnyHashable]
  }

  private var db: OpaquePointer?
  private let lock = NSRecursiveLock()
  private static let transient = unsafeBitCast(-1, to: sqlite3_destructor_type.self)

  init(url: URL) throws {
    try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
    guard sqlite3_open_v2(url.path, &db, SQLITE_OPEN_READWRITE | SQLITE_OPEN_CREATE | SQLITE_OPEN_FULLMUTEX, nil) == SQLITE_OK else {
      let message = db.map { String(cString: sqlite3_errmsg($0)) } ?? "unknown error"
      sqlite3_close(db)
      throw CloudKitSyncError.storage("Couldn't open the sync database: \(message)")
    }
    try execute("PRAGMA journal_mode = WAL")
    try migrate()
  }

  deinit {
    sqlite3_close(db)
  }

  private func migrate() throws {
    let version = try queryInt("PRAGMA user_version") ?? 0
    if version < 1 {
      try transaction {
        try execute("""
          CREATE TABLE meta (key TEXT PRIMARY KEY, value BLOB);
          CREATE TABLE outbox (
            record_name TEXT PRIMARY KEY, type TEXT NOT NULL, id TEXT NOT NULL, operation TEXT NOT NULL,
            fields TEXT NOT NULL, modified_at REAL NOT NULL, sequence INTEGER NOT NULL
          );
          CREATE TABLE system_fields (record_name TEXT PRIMARY KEY, data BLOB NOT NULL);
          CREATE TABLE inbox (
            sequence INTEGER PRIMARY KEY AUTOINCREMENT, record_name TEXT NOT NULL, type TEXT NOT NULL,
            id TEXT NOT NULL, operation TEXT NOT NULL, fields TEXT NOT NULL
          );
          CREATE INDEX inbox_record_name ON inbox (record_name);
          PRAGMA user_version = 1;
          """)
      }
    }
  }

  // MARK: Meta

  func meta(_ key: String) throws -> Data? {
    try locked {
      let statement = try prepare("SELECT value FROM meta WHERE key = ?")
      defer { sqlite3_finalize(statement) }
      bind(statement, 1, key)
      return sqlite3_step(statement) == SQLITE_ROW ? blob(statement, 0) : nil
    }
  }

  func setMeta(_ key: String, _ value: Data?) throws {
    try locked {
      if let value {
        try run("INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value") {
          bind($0, 1, key); bind($0, 2, value)
        }
      } else {
        try run("DELETE FROM meta WHERE key = ?") { bind($0, 1, key) }
      }
    }
  }

  func flag(_ key: String) throws -> Bool {
    try meta(key) == Data([1])
  }

  func setFlag(_ key: String, _ value: Bool) throws {
    try setMeta(key, value ? Data([1]) : nil)
  }

  // MARK: Outbox

  /// Records a change to upload. Replaces any earlier change to the same record.
  @discardableResult
  func enqueue(type: String, id: String, operation: Operation, fields: [String: Any], modifiedAt: Date) throws -> Int64 {
    let json = try encode(fields)
    return try transaction {
      let next = try nextSequence()
      try run("""
        INSERT INTO outbox (record_name, type, id, operation, fields, modified_at, sequence) VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(record_name) DO UPDATE SET type = excluded.type, id = excluded.id, operation = excluded.operation,
          fields = excluded.fields, modified_at = excluded.modified_at, sequence = excluded.sequence
        """) {
        bind($0, 1, RecordName.make(type: type, id: id)); bind($0, 2, type); bind($0, 3, id)
        bind($0, 4, operation.rawValue); bind($0, 5, json); bind($0, 6, modifiedAt.timeIntervalSince1970); bind($0, 7, next)
      }
      return next
    }
  }

  func outboxEntry(_ recordName: String) throws -> OutboxEntry? {
    try locked {
      let statement = try prepare("SELECT record_name, type, id, operation, fields, modified_at, sequence FROM outbox WHERE record_name = ?")
      defer { sqlite3_finalize(statement) }
      bind(statement, 1, recordName)
      return sqlite3_step(statement) == SQLITE_ROW ? try readOutbox(statement) : nil
    }
  }

  func outboxEntries() throws -> [OutboxEntry] {
    try locked {
      let statement = try prepare("SELECT record_name, type, id, operation, fields, modified_at, sequence FROM outbox ORDER BY sequence")
      defer { sqlite3_finalize(statement) }
      var entries: [OutboxEntry] = []
      while sqlite3_step(statement) == SQLITE_ROW { entries.append(try readOutbox(statement)) }
      return entries
    }
  }

  /// Removes an uploaded change, but only if it wasn't changed again while uploading.
  /// Returns false when a newer change is still waiting.
  @discardableResult
  func removeOutbox(_ recordName: String, sequence: Int64) throws -> Bool {
    try locked {
      try run("DELETE FROM outbox WHERE record_name = ? AND sequence = ?") { bind($0, 1, recordName); bind($0, 2, sequence) }
      return sqlite3_changes(db) > 0
    }
  }

  /// Drops a waiting change no matter what, e.g. when the server's version won a conflict.
  func discardOutbox(_ recordName: String) throws {
    try locked { try run("DELETE FROM outbox WHERE record_name = ?") { bind($0, 1, recordName) } }
  }

  // MARK: System fields

  func systemFields(_ recordName: String) throws -> Data? {
    try locked {
      let statement = try prepare("SELECT data FROM system_fields WHERE record_name = ?")
      defer { sqlite3_finalize(statement) }
      bind(statement, 1, recordName)
      return sqlite3_step(statement) == SQLITE_ROW ? blob(statement, 0) : nil
    }
  }

  func setSystemFields(_ recordName: String, _ data: Data?) throws {
    try locked {
      if let data {
        try run("INSERT INTO system_fields (record_name, data) VALUES (?, ?) ON CONFLICT(record_name) DO UPDATE SET data = excluded.data") {
          bind($0, 1, recordName); bind($0, 2, data)
        }
      } else {
        try run("DELETE FROM system_fields WHERE record_name = ?") { bind($0, 1, recordName) }
      }
    }
  }

  // MARK: Inbox

  /// Adds a change from iCloud. An older undelivered change to the same record is replaced.
  func addInbox(type: String, id: String, operation: Operation, fields: [String: Any]) throws {
    let json = try encode(fields)
    try locked {
      let recordName = RecordName.make(type: type, id: id)
      try run("DELETE FROM inbox WHERE record_name = ?") { bind($0, 1, recordName) }
      try run("INSERT INTO inbox (record_name, type, id, operation, fields) VALUES (?, ?, ?, ?, ?)") {
        bind($0, 1, recordName); bind($0, 2, type); bind($0, 3, id); bind($0, 4, operation.rawValue); bind($0, 5, json)
      }
    }
  }

  func inbox(limit: Int = 500) throws -> [InboxEntry] {
    try locked {
      let statement = try prepare("SELECT sequence, type, id, operation, fields FROM inbox ORDER BY sequence LIMIT ?")
      defer { sqlite3_finalize(statement) }
      bind(statement, 1, Int64(limit))
      var entries: [InboxEntry] = []
      while sqlite3_step(statement) == SQLITE_ROW {
        entries.append(InboxEntry(
          sequence: sqlite3_column_int64(statement, 0),
          type: text(statement, 1),
          id: text(statement, 2),
          operation: Operation(rawValue: text(statement, 3)) ?? .save,
          fields: try decode(text(statement, 4))
        ))
      }
      return entries
    }
  }

  /// The app applied these changes, so they can go.
  func ackInbox(_ sequences: [Int64]) throws {
    guard !sequences.isEmpty else { return }
    try transaction {
      for sequence in sequences {
        try run("DELETE FROM inbox WHERE sequence = ?") { bind($0, 1, sequence) }
      }
    }
  }

  // MARK: Counts and reset

  func counts() throws -> (outbox: Int, inbox: Int) {
    try locked {
      (Int(try queryInt("SELECT COUNT(*) FROM outbox") ?? 0), Int(try queryInt("SELECT COUNT(*) FROM inbox") ?? 0))
    }
  }

  /// Forgets everything about iCloud (sync position, system fields, undelivered changes).
  /// With `keepOutbox`, local changes stay queued and upload to the next account.
  func reset(keepOutbox: Bool) throws {
    try transaction {
      try execute("DELETE FROM meta; DELETE FROM system_fields; DELETE FROM inbox;")
      if !keepOutbox { try execute("DELETE FROM outbox") }
    }
  }

  // MARK: SQLite helpers

  private func nextSequence() throws -> Int64 {
    let key = "outboxSequence"
    let statement = try prepare("SELECT value FROM meta WHERE key = ?")
    defer { sqlite3_finalize(statement) }
    bind(statement, 1, key)
    let stored = sqlite3_step(statement) == SQLITE_ROW ? sqlite3_column_int64(statement, 0) : 0
    // After a reset the counter is gone, but queued changes keep their numbers: never reuse one.
    let next = max(stored, try queryInt("SELECT COALESCE(MAX(sequence), 0) FROM outbox") ?? 0) + 1
    try run("INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value") {
      bind($0, 1, key); bind($0, 2, next)
    }
    return next
  }

  func transaction<T>(_ body: () throws -> T) throws -> T {
    try locked {
      try execute("BEGIN IMMEDIATE")
      do {
        let result = try body()
        try execute("COMMIT")
        return result
      } catch {
        try? execute("ROLLBACK")
        throw error
      }
    }
  }

  private func locked<T>(_ body: () throws -> T) throws -> T {
    lock.lock()
    defer { lock.unlock() }
    return try body()
  }

  private func execute(_ sql: String) throws {
    guard sqlite3_exec(db, sql, nil, nil, nil) == SQLITE_OK else { throw lastError() }
  }

  private func prepare(_ sql: String) throws -> OpaquePointer? {
    var statement: OpaquePointer?
    guard sqlite3_prepare_v2(db, sql, -1, &statement, nil) == SQLITE_OK else { throw lastError() }
    return statement
  }

  private func run(_ sql: String, bindings: (OpaquePointer?) -> Void) throws {
    let statement = try prepare(sql)
    defer { sqlite3_finalize(statement) }
    bindings(statement)
    guard sqlite3_step(statement) == SQLITE_DONE else { throw lastError() }
  }

  private func queryInt(_ sql: String) throws -> Int64? {
    let statement = try prepare(sql)
    defer { sqlite3_finalize(statement) }
    return sqlite3_step(statement) == SQLITE_ROW ? sqlite3_column_int64(statement, 0) : nil
  }

  private func lastError() -> CloudKitSyncError {
    .storage("Sync database error: \(String(cString: sqlite3_errmsg(db)))")
  }

  private func bind(_ statement: OpaquePointer?, _ index: Int32, _ value: String) {
    sqlite3_bind_text(statement, index, value, -1, Self.transient)
  }

  private func bind(_ statement: OpaquePointer?, _ index: Int32, _ value: Int64) {
    sqlite3_bind_int64(statement, index, value)
  }

  private func bind(_ statement: OpaquePointer?, _ index: Int32, _ value: Double) {
    sqlite3_bind_double(statement, index, value)
  }

  private func bind(_ statement: OpaquePointer?, _ index: Int32, _ value: Data) {
    _ = value.withUnsafeBytes { sqlite3_bind_blob(statement, index, $0.baseAddress, Int32(value.count), Self.transient) }
  }

  private func text(_ statement: OpaquePointer?, _ column: Int32) -> String {
    sqlite3_column_text(statement, column).map { String(cString: $0) } ?? ""
  }

  private func blob(_ statement: OpaquePointer?, _ column: Int32) -> Data? {
    guard let bytes = sqlite3_column_blob(statement, column) else { return Data() }
    return Data(bytes: bytes, count: Int(sqlite3_column_bytes(statement, column)))
  }

  private func readOutbox(_ statement: OpaquePointer?) throws -> OutboxEntry {
    OutboxEntry(
      recordName: text(statement, 0),
      type: text(statement, 1),
      id: text(statement, 2),
      operation: Operation(rawValue: text(statement, 3)) ?? .save,
      fields: try decode(text(statement, 4)),
      modifiedAt: Date(timeIntervalSince1970: sqlite3_column_double(statement, 5)),
      sequence: sqlite3_column_int64(statement, 6)
    )
  }

  private func encode(_ fields: [String: Any]) throws -> String {
    guard JSONSerialization.isValidJSONObject(fields) else { throw CloudKitSyncError.storage("Fields aren't JSON-safe.") }
    return String(decoding: try JSONSerialization.data(withJSONObject: fields, options: [.sortedKeys]), as: UTF8.self)
  }

  private func decode(_ json: String) throws -> [String: AnyHashable] {
    let object = try JSONSerialization.jsonObject(with: Data(json.utf8))
    return (object as? [String: AnyHashable]) ?? [:]
  }
}
