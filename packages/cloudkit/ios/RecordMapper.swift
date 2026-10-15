import CloudKit
import Foundation

/// Checks values from JS against the schema and converts them to and from CKRecords.
///
/// Values crossing to and from JS are JSON-safe: dates are milliseconds since 1970,
/// references are the linked record's id, assets are local file paths, empty optionals are NSNull.
struct RecordMapper {
  /// Set on every record, so the "newest" conflict rule can compare edits.
  static let modifiedAtKey = "ekModifiedAt"

  /// CloudKit keeps asset files without a name, so the extension is stored next to it.
  static func assetExtensionKey(_ field: String) -> String { "ek_\(field)_ext" }

  let schema: SchemaModel
  let zoneID: CKRecordZone.ID

  // MARK: JS → stored

  /// Checks a record from JS and returns its fields in a JSON-safe form for the outbox.
  func normalize(type typeName: String, id: String, fields: [String: Any]) throws -> [String: Any] {
    let type = try schema.type(typeName)
    try RecordName.validate(type: typeName, id: id)

    if let unknown = fields.keys.first(where: { type.fields[$0] == nil }) {
      throw CloudKitSyncError.invalidValue("\(typeName).\(unknown) isn't a field in the schema.")
    }

    var result: [String: Any] = [:]
    for field in type.fields.values {
      let path = "\(typeName).\(field.name)"
      let raw = fields[field.name]
      if raw == nil || raw is NSNull {
        if !field.optional { throw CloudKitSyncError.invalidValue("\(path) is required.") }
        result[field.name] = NSNull()
        continue
      }
      result[field.name] = try normalizeValue(raw!, kind: field.kind, path: path)
    }
    return result
  }

  private func normalizeValue(_ value: Any, kind: FieldKind, path: String) throws -> Any {
    switch kind {
    case .string, .reference, .asset:
      guard let string = value as? String else { throw typeError(path, "a string") }
      if kind == .reference { try RecordName.validate(type: "reference", id: string) }
      if kind == .asset && string.isEmpty { throw typeError(path, "a file path") }
      return string
    case .int:
      guard let number = plainNumber(value), number.doubleValue.rounded() == number.doubleValue else {
        throw typeError(path, "a whole number")
      }
      return number.int64Value
    case .double, .date:
      guard let number = plainNumber(value), number.doubleValue.isFinite else {
        throw typeError(path, kind == .date ? "a date" : "a number")
      }
      return number.doubleValue
    case .bool:
      guard let bool = boolValue(value) else { throw typeError(path, "true or false") }
      return bool
    case .stringList:
      guard let list = value as? [Any], list.allSatisfy({ $0 is String }) else { throw typeError(path, "a list of strings") }
      return list
    case .intList:
      guard let list = value as? [Any] else { throw typeError(path, "a list of whole numbers") }
      return try list.map { item -> Int64 in
        guard let number = plainNumber(item), number.doubleValue.rounded() == number.doubleValue else {
          throw typeError(path, "a list of whole numbers")
        }
        return number.int64Value
      }
    case .doubleList:
      guard let list = value as? [Any] else { throw typeError(path, "a list of numbers") }
      return try list.map { item -> Double in
        guard let number = plainNumber(item), number.doubleValue.isFinite else { throw typeError(path, "a list of numbers") }
        return number.doubleValue
      }
    }
  }

  // MARK: stored → CKRecord

  /// Writes normalized fields onto a record. Fields not in the schema are left untouched,
  /// so data written by a newer app version on another device is kept.
  func apply(fields: [String: Any], modifiedAt: Date, to record: CKRecord) throws {
    let type = try schema.type(record.recordType)
    for field in type.fields.values {
      let value = fields[field.name]
      if value == nil || value is NSNull {
        record[field.name] = nil
        if field.kind == .asset { record[Self.assetExtensionKey(field.name)] = nil }
        continue
      }
      let ckValue = try ckValue(value!, field: field, recordType: type.name)
      record[field.name] = ckValue
      if field.kind == .asset, let asset = ckValue as? CKAsset {
        let ext = asset.fileURL?.pathExtension ?? ""
        record[Self.assetExtensionKey(field.name)] = ext.isEmpty ? nil : ext as NSString
      }
    }
    record[Self.modifiedAtKey] = modifiedAt as NSDate
  }

  private func ckValue(_ value: Any, field: FieldModel, recordType: String) throws -> CKRecordValue {
    let path = "\(recordType).\(field.name)"
    switch field.kind {
    case .string:
      return try cast(value, path) as String as NSString
    case .int:
      return NSNumber(value: try int64(value, path))
    case .double:
      return NSNumber(value: try double(value, path))
    case .bool:
      guard let bool = boolValue(value) else { throw typeError(path, "true or false") }
      return NSNumber(value: bool)
    case .date:
      return Date(timeIntervalSince1970: try double(value, path) / 1000) as NSDate
    case .stringList:
      return try cast(value, path) as [String] as NSArray
    case .intList:
      let list: [Any] = try cast(value, path)
      return try list.map { NSNumber(value: try int64($0, path)) } as NSArray
    case .doubleList:
      let list: [Any] = try cast(value, path)
      return try list.map { NSNumber(value: try double($0, path)) } as NSArray
    case .reference:
      let id: String = try cast(value, path)
      let recordID = CKRecord.ID(recordName: RecordName.make(type: field.target ?? "", id: id), zoneID: zoneID)
      return CKRecord.Reference(recordID: recordID, action: .none)
    case .asset:
      let filePath: String = try cast(value, path)
      let url = filePath.hasPrefix("file://") ? URL(string: filePath) : URL(fileURLWithPath: filePath)
      guard let url, FileManager.default.fileExists(atPath: url.path) else {
        throw CloudKitSyncError.invalidValue("\(path): no file at \(filePath).")
      }
      return CKAsset(fileURL: url)
    }
  }

  // MARK: CKRecord → JS

  struct ReadRecord {
    let type: String
    let id: String
    let fields: [String: Any]
    let modifiedAt: Date?
  }

  /// Reads a record from iCloud into JSON-safe fields. Returns nil for records that
  /// aren't in this schema (e.g. a type added by a newer app version).
  /// `saveAsset` copies a downloaded file somewhere permanent and returns its path.
  func read(_ record: CKRecord, saveAsset: (AssetTarget) throws -> String?) throws -> ReadRecord? {
    guard let name = RecordName.parse(record.recordID.recordName), let type = schema.types[record.recordType] else {
      return nil
    }
    var fields: [String: Any] = [:]
    for field in type.fields.values {
      fields[field.name] = try jsValue(record, field: field, type: type.name, id: name.id, save: saveAsset) ?? NSNull()
    }
    return ReadRecord(type: type.name, id: name.id, fields: fields, modifiedAt: record[Self.modifiedAtKey] as? Date)
  }

  /// Where a downloaded file should go.
  struct AssetTarget {
    let asset: CKAsset
    let type: String
    let id: String
    let field: String
    /// Without the dot, empty when the original file had none.
    let fileExtension: String
  }

  private func jsValue(
    _ record: CKRecord,
    field: FieldModel,
    type: String,
    id: String,
    save: (AssetTarget) throws -> String?
  ) throws -> Any? {
    guard let value = record[field.name] else { return nil }
    switch field.kind {
    case .string: return value as? String
    case .int: return (value as? NSNumber)?.int64Value
    case .double: return (value as? NSNumber)?.doubleValue
    case .bool: return (value as? NSNumber)?.boolValue
    case .date: return (value as? Date).map { $0.timeIntervalSince1970 * 1000 }
    case .stringList: return value as? [String]
    case .intList: return (value as? [NSNumber])?.map(\.int64Value)
    case .doubleList: return (value as? [NSNumber])?.map(\.doubleValue)
    case .reference:
      guard let reference = value as? CKRecord.Reference else { return nil }
      return RecordName.parse(reference.recordID.recordName)?.id
    case .asset:
      guard let asset = value as? CKAsset else { return nil }
      let ext = record[Self.assetExtensionKey(field.name)] as? String ?? ""
      return try save(AssetTarget(asset: asset, type: type, id: id, field: field.name, fileExtension: ext))
    }
  }

  // MARK: Helpers

  private func typeError(_ path: String, _ expected: String) -> CloudKitSyncError {
    .invalidValue("\(path) must be \(expected).")
  }

  private func cast<T>(_ value: Any, _ path: String) throws -> T {
    guard let typed = value as? T else { throw CloudKitSyncError.invalidValue("\(path) has the wrong type.") }
    return typed
  }

  private func int64(_ value: Any, _ path: String) throws -> Int64 {
    guard let number = plainNumber(value) else { throw typeError(path, "a whole number") }
    return number.int64Value
  }

  private func double(_ value: Any, _ path: String) throws -> Double {
    guard let number = plainNumber(value) else { throw typeError(path, "a number") }
    return number.doubleValue
  }

  /// A number that isn't a boolean (NSNumber bridges both).
  private func plainNumber(_ value: Any) -> NSNumber? {
    guard let number = value as? NSNumber, !isBoolean(number) else { return nil }
    return number
  }

  private func boolValue(_ value: Any) -> Bool? {
    if let bool = value as? Bool, let number = value as? NSNumber, isBoolean(number) { return bool }
    return nil
  }

  private func isBoolean(_ number: NSNumber) -> Bool {
    CFGetTypeID(number) == CFBooleanGetTypeID()
  }
}
