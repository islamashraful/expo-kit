import Foundation
import SwiftData

/// A fresh in-memory store without CloudKit, plus direct access to insert raw rows (duplicates from sync).
func makeStore() throws -> (ItemStore, ModelContainer) {
  let schema = Schema([StoredItem.self])
  let configuration = ModelConfiguration(schema: schema, isStoredInMemoryOnly: true, cloudKitDatabase: .none)
  let container = try ModelContainer(for: schema, configurations: [configuration])
  return (ItemStore(modelContainer: container), container)
}

/// Inserts a row the way a sync from another device would, bypassing `ItemStore.set`.
@MainActor
func insertRaw(_ container: ModelContainer, _ collection: String, _ key: String, _ json: String, at seconds: Double, device: String) throws {
  let context = container.mainContext
  context.insert(StoredItem(collection: collection, key: key, payload: Data(json.utf8), updatedAt: Date(timeIntervalSince1970: seconds), deviceId: device))
  try context.save()
}

func itemStoreTests() async throws {
  // set, get, update in place
  do {
    let (store, _) = try makeStore()
    try await store.set(collection: "notes", items: [ItemInput(key: "a", json: #"{"v":1}"#, updatedAt: nil)], deviceId: "D1")
    try await store.set(collection: "notes", items: [ItemInput(key: "a", json: #"{"v":2}"#, updatedAt: nil)], deviceId: "D1")
    let value = try await store.get(collection: "notes", key: "a")
    let rows = try await store.rowCount(collection: "notes")
    check(value?.json == #"{"v":2}"#, "set updates the value")
    check(rows == 1, "set updates in place instead of adding a row")
    let missing = try await store.get(collection: "notes", key: "nope")
    check(missing == nil, "get of a missing key is nil")
    let other = try await store.get(collection: "settings", key: "a")
    check(other == nil, "collections are separate")
  }

  // setMany with a given edit time
  do {
    let (store, _) = try makeStore()
    let old = Date(timeIntervalSince1970: 1_000)
    try await store.set(
      collection: "notes",
      items: [ItemInput(key: "a", json: "1", updatedAt: old), ItemInput(key: "b", json: "2", updatedAt: nil), ItemInput(key: "a", json: "3", updatedAt: old)],
      deviceId: "D1"
    )
    let all = try await store.getAll(collection: "notes")
    let rows = try await store.rowCount(collection: "notes")
    check(all.count == 2, "setMany: one item per key")
    check(rows == 2, "setMany: a key repeated in one batch doesn't add a row")
    check(all.first { $0.key == "a" }?.json == "3", "setMany: the last value for a key in a batch wins")
    check(all.first { $0.key == "a" }?.updatedAt == old, "setMany keeps the given edit time")
    check(all.first?.key == "b", "getAll lists the most recently changed first")
  }

  // duplicates from two devices: newest wins on read, a write removes the others
  do {
    let (store, container) = try makeStore()
    try await insertRaw(container, "notes", "a", "old", at: 100, device: "D1")
    try await insertRaw(container, "notes", "a", "new", at: 200, device: "D2")
    let value = try await store.get(collection: "notes", key: "a")
    let all = try await store.getAll(collection: "notes")
    check(value?.json == "new", "get reads the newest copy")
    check(all.count == 1 && all[0].json == "new", "getAll returns one item per key, the newest")

    try await store.set(collection: "notes", items: [ItemInput(key: "a", json: "edited", updatedAt: nil)], deviceId: "D1")
    let rows = try await store.rowCount(collection: "notes")
    let edited = try await store.get(collection: "notes", key: "a")
    check(rows == 1, "writing a key removes its duplicates")
    check(edited?.json == "edited", "the write lands")
  }

  // same edit time: the device ID decides, the same way on every device
  do {
    let (store, container) = try makeStore()
    try await insertRaw(container, "notes", "a", "from B", at: 100, device: "B")
    try await insertRaw(container, "notes", "a", "from A", at: 100, device: "A")
    let value = try await store.get(collection: "notes", key: "a")
    check(value?.json == "from B", "a tie goes to the larger device ID")
  }

  // removeDuplicates
  do {
    let (store, container) = try makeStore()
    try await insertRaw(container, "notes", "a", "1", at: 100, device: "D1")
    try await insertRaw(container, "notes", "a", "2", at: 300, device: "D2")
    try await insertRaw(container, "notes", "a", "3", at: 200, device: "D3")
    try await insertRaw(container, "notes", "b", "only", at: 100, device: "D1")
    try await insertRaw(container, "settings", "a", "other collection", at: 100, device: "D1")
    let removed = try await store.removeDuplicates()
    let rows = try await store.rowCount(collection: "notes")
    let value = try await store.get(collection: "notes", key: "a")
    let setting = try await store.get(collection: "settings", key: "a")
    check(removed == 2, "removeDuplicates removes all but one copy")
    check(rows == 2, "one row per key is left")
    check(value?.json == "2", "the newest copy is kept")
    check(setting?.json == "other collection", "the same key in another collection isn't a duplicate")
    let again = try await store.removeDuplicates()
    check(again == 0, "nothing to remove the second time")
  }

  // remove and clear
  do {
    let (store, container) = try makeStore()
    try await insertRaw(container, "notes", "a", "1", at: 100, device: "D1")
    try await insertRaw(container, "notes", "a", "2", at: 200, device: "D2")
    try await store.set(collection: "notes", items: [ItemInput(key: "b", json: "b", updatedAt: nil)], deviceId: "D1")
    try await store.set(collection: "settings", items: [ItemInput(key: "x", json: "x", updatedAt: nil)], deviceId: "D1")
    try await store.remove(collection: "notes", key: "a")
    let removedValue = try await store.get(collection: "notes", key: "a")
    check(removedValue == nil, "remove deletes every copy of the key")
    try await store.clear(collection: "notes")
    let notes = try await store.getAll(collection: "notes")
    let settings = try await store.getAll(collection: "settings")
    check(notes.isEmpty, "clear empties the collection")
    check(settings.count == 1, "clear leaves other collections alone")
  }
}
