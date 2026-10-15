import Foundation

// Plain Swift model of the app's schema. No Expo types here, so it can be tested on its own.

enum FieldKind: String, CaseIterable {
  case string, int, double, bool, date, stringList, intList, doubleList, reference, asset
}

struct FieldModel: Equatable {
  let name: String
  let kind: FieldKind
  let optional: Bool
  /// For references: the record type it links to.
  let target: String?
}

struct TypeModel: Equatable {
  let name: String
  let fields: [String: FieldModel]
}

struct SchemaModel: Equatable {
  let types: [String: TypeModel]

  func type(_ name: String) throws -> TypeModel {
    guard let type = types[name] else { throw CloudKitSyncError.unknownType(name) }
    return type
  }
}

enum CloudKitSyncError: Error, LocalizedError, Equatable {
  case unknownType(String)
  case invalidSchema(String)
  case invalidID(String)
  case invalidValue(String)
  case notStarted
  case storage(String)

  var errorDescription: String? {
    switch self {
    case .unknownType(let name): return "\"\(name)\" isn't a record type in the schema."
    case .invalidSchema(let message), .invalidID(let message), .invalidValue(let message), .storage(let message):
      return message
    case .notStarted: return "The sync engine isn't started. Call start() first."
    }
  }
}

/// The ID of a record in iCloud is "<Type>.<id>": CloudKit IDs must be unique across all types in a zone.
enum RecordName {
  static func make(type: String, id: String) -> String { "\(type).\(id)" }

  /// Splits "<Type>.<id>". Type names can't contain dots, so the first dot is the separator.
  static func parse(_ recordName: String) -> (type: String, id: String)? {
    guard let dot = recordName.firstIndex(of: ".") else { return nil }
    let type = String(recordName[..<dot])
    let id = String(recordName[recordName.index(after: dot)...])
    return type.isEmpty || id.isEmpty ? nil : (type, id)
  }

  static func validate(type: String, id: String) throws {
    if id.isEmpty { throw CloudKitSyncError.invalidID("\(type): the id is empty.") }
    if !id.allSatisfy(\.isASCII) { throw CloudKitSyncError.invalidID("\(type).\(id): ids can only use ASCII characters.") }
    if make(type: type, id: id).utf8.count > 255 {
      throw CloudKitSyncError.invalidID("\(type).\(id): the id is too long (type + id must be at most 254 characters).")
    }
  }
}
