import ExpoModulesCore
#if canImport(FoundationModels)
import FoundationModels
#endif

// Typed shapes that cross between JS and Swift. Expo checks them when converting.

struct SessionOptionsRecord: Record {
  @Field var instructions: String?
}

struct GenerationOptionsRecord: Record {
  /// Only used by one-off calls. A session gets its instructions once, when it's created.
  @Field var instructions: String?
  @Field var temperature: Double?
  @Field var maxTokens: Int?
}

#if canImport(FoundationModels)
@available(iOS 26.0, *)
extension GenerationOptionsRecord {
  func toGenerationOptions() -> GenerationOptions {
    GenerationOptions(temperature: temperature, maximumResponseTokens: maxTokens)
  }
}
#endif
