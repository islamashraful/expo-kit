import CloudKit
import ExpoModulesCore

public class ExpoKitCloudKitModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ExpoKitCloudKit")

    Function("isSupported") { () -> Bool in
      return true
    }

    Class("CloudSyncEngine", CloudSyncEngineObject.self) {
      Constructor { (options: EngineOptionsRecord) throws -> CloudSyncEngineObject in
        try CloudSyncEngineObject(options: options)
      }

      AsyncFunction("start") { (engine: CloudSyncEngineObject) in
        await engine.core.start()
      }

      AsyncFunction("syncNow") { (engine: CloudSyncEngineObject) in
        await engine.core.syncNow()
      }

      AsyncFunction("stop") { (engine: CloudSyncEngineObject) in
        await engine.core.stop()
      }

      Function("save") { (engine: CloudSyncEngineObject, input: SaveInputRecord) throws in
        try engine.core.save(type: input.type, id: input.id, fields: input.fields)
      }

      Function("delete") { (engine: CloudSyncEngineObject, input: DeleteInputRecord) throws in
        try engine.core.delete(type: input.type, id: input.id)
      }

      AsyncFunction("pendingChanges") { (engine: CloudSyncEngineObject, limit: Int) throws -> [[String: Any]] in
        try engine.core.pendingChanges(limit: limit)
      }

      AsyncFunction("ack") { (engine: CloudSyncEngineObject, sequences: [Int]) throws in
        try engine.core.ack(sequences.map(Int64.init))
      }

      Function("status") { (engine: CloudSyncEngineObject) -> [String: Any] in
        engine.core.status()
      }
    }
  }
}
