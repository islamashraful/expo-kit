import ExpoModulesCore

// Typed shapes that cross between JS and Swift. Expo checks them when converting.

struct FieldSpecRecord: Record {
  @Field var name: String = ""
  @Field var kind: String = ""
  @Field var optional: Bool = false
  @Field var target: String?
}

struct TypeSpecRecord: Record {
  @Field var name: String = ""
  @Field var fields: [FieldSpecRecord] = []
}

struct SchemaSpecRecord: Record {
  @Field var types: [TypeSpecRecord] = []

  func toModel() throws -> SchemaModel {
    var types: [String: TypeModel] = [:]
    for type in self.types {
      var fields: [String: FieldModel] = [:]
      for field in type.fields {
        guard let kind = FieldKind(rawValue: field.kind) else {
          throw CloudKitSyncError.invalidSchema("\(type.name).\(field.name): unknown field kind \"\(field.kind)\".")
        }
        fields[field.name] = FieldModel(name: field.name, kind: kind, optional: field.optional, target: field.target)
      }
      types[type.name] = TypeModel(name: type.name, fields: fields)
    }
    for type in types.values {
      for field in type.fields.values where field.kind == .reference {
        guard let target = field.target, types[target] != nil else {
          throw CloudKitSyncError.invalidSchema("\(type.name).\(field.name) links to an unknown type.")
        }
      }
    }
    return SchemaModel(types: types)
  }
}

struct EngineOptionsRecord: Record {
  @Field var containerId: String = ""
  @Field var zoneName: String = "AppData"
  /// "newest", "server" or "device".
  @Field var conflict: String = "newest"
  @Field var schema: SchemaSpecRecord = SchemaSpecRecord()
}

struct SaveInputRecord: Record {
  @Field var type: String = ""
  @Field var id: String = ""
  @Field var fields: [String: Any] = [:]
}

struct DeleteInputRecord: Record {
  @Field var type: String = ""
  @Field var id: String = ""
}
