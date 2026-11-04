import ExpoModulesCore

struct ItemRecord: Record {
  @Field var key: String = ""
  @Field var json: String = ""
  /// Milliseconds since 1970. `nil` means now.
  @Field var updatedAt: Double? = nil
}

final class StoreUnavailableException: Exception, @unchecked Sendable {
  override var reason: String {
    "The iCloud store couldn't be opened: \(SharedStore.shared.status.error ?? "unknown error")"
  }
}

public class ExpoKitSwiftDataModule: Module {
  private var listenerId: UUID?

  public func definition() -> ModuleDefinition {
    Name("ExpoKitSwiftData")

    Events("status", "change")

    OnCreate {
      // The store outlives the module (JS reloads), so it must not keep the module alive.
      weak let module = self
      self.listenerId = SharedStore.shared.addListeners(
        status: { status in module?.sendEvent("status", status.dictionary) },
        change: { module?.sendEvent("change") }
      )
    }

    OnDestroy {
      if let id = self.listenerId { SharedStore.shared.removeListeners(id) }
    }

    Function("status") { () -> [String: Any] in
      SharedStore.shared.status.dictionary
    }

    AsyncFunction("set") { (collection: String, key: String, json: String, updatedAt: Double?) async throws in
      let input = ItemInput(key: key, json: json, updatedAt: updatedAt.map(Self.date))
      try await Self.store().set(collection: collection, items: [input], deviceId: SharedStore.shared.deviceId)
    }

    AsyncFunction("setMany") { (collection: String, items: [ItemRecord]) async throws in
      let inputs = items.map { ItemInput(key: $0.key, json: $0.json, updatedAt: $0.updatedAt.map(Self.date)) }
      try await Self.store().set(collection: collection, items: inputs, deviceId: SharedStore.shared.deviceId)
    }

    AsyncFunction("get") { (collection: String, key: String) async throws -> [String: Any]? in
      try await Self.store().get(collection: collection, key: key).map(Self.encode)
    }

    AsyncFunction("getAll") { (collection: String) async throws -> [[String: Any]] in
      try await Self.store().getAll(collection: collection).map(Self.encode)
    }

    AsyncFunction("remove") { (collection: String, key: String) async throws in
      try await Self.store().remove(collection: collection, key: key)
    }

    AsyncFunction("clear") { (collection: String) async throws in
      try await Self.store().clear(collection: collection)
    }

    Function("isImportDone") { (id: String) -> Bool in
      SharedStore.shared.isImportDone(id)
    }

    Function("markImportDone") { (id: String) in
      SharedStore.shared.markImportDone(id)
    }
  }

  private static func store() throws -> ItemStore {
    guard let store = SharedStore.shared.store else { throw StoreUnavailableException() }
    return store
  }

  private static func date(_ milliseconds: Double) -> Date {
    Date(timeIntervalSince1970: milliseconds / 1000)
  }

  private static func encode(_ value: ItemValue) -> [String: Any] {
    ["key": value.key, "json": value.json, "updatedAt": value.updatedAt.timeIntervalSince1970 * 1000]
  }
}
