import Foundation
import SwiftData

struct ItemValue: Sendable, Equatable {
  let key: String
  let json: String
  let updatedAt: Date
  let deviceId: String
}

struct ItemInput: Sendable {
  let key: String
  let json: String
  /// The time of the edit. `nil` means now. Imports pass the old row's edit time.
  let updatedAt: Date?
}

/// Which of two copies of the same key counts: the later `updatedAt`, then the larger `deviceId`,
/// so every device picks the same one.
func isNewer(_ a: StoredItem, than b: StoredItem) -> Bool {
  a.updatedAt != b.updatedAt ? a.updatedAt > b.updatedAt : a.deviceId > b.deviceId
}

/// All reads and writes, off the main thread. Writes change a key's row in place (Apple decides conflicts:
/// the change that reaches iCloud last wins). Duplicates of a key are read as their newest copy and removed
/// on the next write of that key or by `removeDuplicates()`.
@ModelActor
actor ItemStore {
  func set(collection: String, items: [ItemInput], deviceId: String) throws {
    guard !items.isEmpty else { return }
    var rowsByKey: [String: [StoredItem]] = [:]
    let existing = items.count == 1
      ? try fetch(collection: collection, key: items[0].key)
      : try fetch(collection: collection)
    for row in existing { rowsByKey[row.key, default: []].append(row) }

    let now = Date()
    for input in items {
      let payload = Data(input.json.utf8)
      let updatedAt = input.updatedAt ?? now
      let rows = rowsByKey[input.key] ?? []
      if let newest = newest(of: rows) {
        for row in rows where row !== newest { modelContext.delete(row) }
        newest.payload = payload
        newest.updatedAt = updatedAt
        newest.deviceId = deviceId
        rowsByKey[input.key] = [newest]
      } else {
        let row = StoredItem(collection: collection, key: input.key, payload: payload, updatedAt: updatedAt, deviceId: deviceId)
        modelContext.insert(row)
        rowsByKey[input.key] = [row]
      }
    }
    try modelContext.save()
  }

  func get(collection: String, key: String) throws -> ItemValue? {
    newest(of: try fetch(collection: collection, key: key)).map(value)
  }

  /// The newest copy of every key, most recently changed first.
  func getAll(collection: String) throws -> [ItemValue] {
    var newestByKey: [String: StoredItem] = [:]
    for row in try fetch(collection: collection) {
      if let current = newestByKey[row.key], !isNewer(row, than: current) { continue }
      newestByKey[row.key] = row
    }
    return newestByKey.values.sorted { isNewer($0, than: $1) }.map(value)
  }

  /// Deletes every copy of the key.
  func remove(collection: String, key: String) throws {
    for row in try fetch(collection: collection, key: key) { modelContext.delete(row) }
    try modelContext.save()
  }

  /// Deletes every item of the collection, one by one so each delete is mirrored to iCloud.
  func clear(collection: String) throws {
    for row in try fetch(collection: collection) { modelContext.delete(row) }
    try modelContext.save()
  }

  /// Keeps the newest copy of every (collection, key) and deletes the rest. Returns how many were deleted.
  @discardableResult
  func removeDuplicates() throws -> Int {
    var newestById: [String: StoredItem] = [:]
    var removed = 0
    for row in try modelContext.fetch(FetchDescriptor<StoredItem>()) {
      let id = "\(row.collection)\u{1F}\(row.key)"
      guard let current = newestById[id] else {
        newestById[id] = row
        continue
      }
      if isNewer(row, than: current) {
        modelContext.delete(current)
        newestById[id] = row
      } else {
        modelContext.delete(row)
      }
      removed += 1
    }
    if removed > 0 { try modelContext.save() }
    return removed
  }

  /// All rows, including duplicates. For tests.
  func rowCount(collection: String) throws -> Int {
    try fetch(collection: collection).count
  }

  private func newest(of rows: [StoredItem]) -> StoredItem? {
    rows.max { isNewer($1, than: $0) }
  }

  private func fetch(collection: String, key: String) throws -> [StoredItem] {
    try modelContext.fetch(FetchDescriptor<StoredItem>(
      predicate: #Predicate { $0.collection == collection && $0.key == key }
    ))
  }

  private func fetch(collection: String) throws -> [StoredItem] {
    try modelContext.fetch(FetchDescriptor<StoredItem>(predicate: #Predicate { $0.collection == collection }))
  }

  private func value(_ row: StoredItem) -> ItemValue {
    ItemValue(key: row.key, json: String(decoding: row.payload, as: UTF8.self), updatedAt: row.updatedAt, deviceId: row.deviceId)
  }
}
