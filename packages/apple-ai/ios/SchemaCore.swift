import Foundation
#if canImport(FoundationModels)
import FoundationModels
#endif

// The data shape JS describes with `schema.*`, sent as JSON, turned into Apple's DynamicGenerationSchema.
// Plain Swift (no Expo types), so native-tests can run it on macOS.

/// One node of the shape. A class, because it contains itself (array items, object properties).
final class SchemaSpec: Decodable {
  /// string, number, integer, boolean, enum, array or object
  let kind: String
  let description: String?
  /// enum
  let choices: [String]?
  /// array
  let items: SchemaSpec?
  let minItems: Int?
  let maxItems: Int?
  /// object
  let properties: [PropertySpec]?
}

struct PropertySpec: Decodable {
  let name: String
  let schema: SchemaSpec
  let optional: Bool
}

func invalidSchema(_ message: String) -> ModelError {
  ModelError(code: "invalidSchema", message: message)
}

func decodeSchema(_ json: String) throws -> SchemaSpec {
  do {
    return try JSONDecoder().decode(SchemaSpec.self, from: Data(json.utf8))
  } catch {
    throw invalidSchema("The schema couldn't be read: \(error.localizedDescription)")
  }
}

#if canImport(FoundationModels)
@available(iOS 26.0, macOS 26.0, *)
func generationSchema(_ spec: SchemaSpec) throws -> GenerationSchema {
  do {
    return try GenerationSchema(root: dynamicSchema(spec, name: "Result"), dependencies: [])
  } catch let error as ModelError {
    throw error
  } catch {
    throw invalidSchema("Apple rejected the schema: \(error.localizedDescription)")
  }
}

/// `name` is the path to this node, e.g. Result_address. Apple needs a unique name for each object and enum.
@available(iOS 26.0, macOS 26.0, *)
private func dynamicSchema(_ spec: SchemaSpec, name: String) throws -> DynamicGenerationSchema {
  switch spec.kind {
  case "string":
    return DynamicGenerationSchema(type: String.self)
  case "number":
    return DynamicGenerationSchema(type: Double.self)
  case "integer":
    return DynamicGenerationSchema(type: Int.self)
  case "boolean":
    return DynamicGenerationSchema(type: Bool.self)
  case "enum":
    guard let choices = spec.choices, !choices.isEmpty else { throw invalidSchema("\(name): an enum needs at least one choice.") }
    return DynamicGenerationSchema(name: name, description: spec.description, anyOf: choices)
  case "array":
    guard let items = spec.items else { throw invalidSchema("\(name): an array needs an item schema.") }
    return DynamicGenerationSchema(
      arrayOf: try dynamicSchema(items, name: "\(name)_item"),
      minimumElements: spec.minItems,
      maximumElements: spec.maxItems
    )
  case "object":
    guard let properties = spec.properties, !properties.isEmpty else { throw invalidSchema("\(name): an object needs at least one property.") }
    return DynamicGenerationSchema(
      name: name,
      description: spec.description,
      properties: try properties.map { property in
        DynamicGenerationSchema.Property(
          name: property.name,
          description: property.schema.description,
          schema: try dynamicSchema(property.schema, name: "\(name)_\(property.name)"),
          isOptional: property.optional
        )
      }
    )
  default:
    throw invalidSchema("\(name): unknown kind \"\(spec.kind)\".")
  }
}
#endif
