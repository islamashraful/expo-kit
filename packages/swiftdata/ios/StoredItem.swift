import Foundation
import SwiftData

/// One model for every app, so the CloudKit schema never has to change (record type `CD_StoredItem`).
///
/// CloudKit sync rules: no unique constraints and every property has a default value. So two devices that
/// create the same (collection, key) while offline end up with two rows; `ItemStore` reads the newest and
/// removes the others. After the first App Store release, only add properties, never rename or remove one.
@Model
final class StoredItem {
  var collection: String = ""
  var key: String = ""
  var updatedAt: Date = Date.distantPast
  /// Which device wrote this version. Breaks ties between duplicates with the same `updatedAt`.
  var deviceId: String = ""
  /// JSON. External storage turns large payloads into a CKAsset instead of hitting the 1 MB record limit.
  @Attribute(.externalStorage) var payload: Data = Data()

  init(collection: String, key: String, payload: Data, updatedAt: Date, deviceId: String) {
    self.collection = collection
    self.key = key
    self.payload = payload
    self.updatedAt = updatedAt
    self.deviceId = deviceId
  }
}
