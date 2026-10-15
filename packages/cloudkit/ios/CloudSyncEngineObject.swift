import CloudKit
import ExpoModulesCore

/// The sync engine as JS sees it. One instance per container + zone.
final class CloudSyncEngineObject: SharedObject, SyncCoreDelegate {
  let core: SyncCore

  init(options: EngineOptionsRecord) throws {
    guard !options.containerId.isEmpty else {
      throw CloudKitSyncError.invalidSchema("containerId is empty.")
    }
    let configured = Bundle.main.object(forInfoDictionaryKey: "ExpoKitCloudKitContainers") as? [String] ?? []
    guard configured.contains(options.containerId) else {
      throw CloudKitSyncError.invalidSchema(
        "iCloud container \"\(options.containerId)\" isn't set up in this build. Add it to the @expo-kit/cloudkit plugin in app.json and rebuild."
      )
    }
    guard let policy = ConflictPolicy(rawValue: options.conflict) else {
      throw CloudKitSyncError.invalidSchema("Unknown conflict rule \"\(options.conflict)\". Use newest, server or device.")
    }
    let schema = try options.schema.toModel()
    let fileManager = FileManager.default
    let folder = "\(options.containerId)/\(options.zoneName)"
    let support = try fileManager.url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
    let documents = try fileManager.url(for: .documentDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
    let store = try LocalStore(url: support.appendingPathComponent("expo-kit-cloudkit/\(folder)/sync.sqlite"))

    core = SyncCore(
      container: CKContainer(identifier: options.containerId),
      zoneName: options.zoneName,
      schema: schema,
      policy: policy,
      store: store,
      assetsDirectory: documents.appendingPathComponent("expo-kit-cloudkit/\(folder)")
    )
    super.init()
    core.delegate = self
  }

  override func sharedObjectWillRelease() {
    let core = self.core
    Task { await core.stop() }
  }

  // MARK: SyncCoreDelegate

  func syncCore(_ core: SyncCore, didChangeStatus status: [String: Any]) {
    emit(event: "status", payload: status)
  }

  func syncCoreHasNewChanges(_ core: SyncCore) {
    emit(event: "changes", payload: [String: Any]())
  }

  func syncCore(_ core: SyncCore, didChangeAccount change: [String: Any]) {
    emit(event: "account", payload: change)
  }

  func syncCore(_ core: SyncCore, didFail error: Error, context: String) {
    emit(event: "error", payload: ["message": error.localizedDescription, "context": context] as [String: Any])
  }
}
