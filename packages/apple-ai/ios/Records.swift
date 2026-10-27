import ExpoModulesCore

// Typed shapes that cross between JS and Swift. Expo checks them when converting.

struct SessionOptionsRecord: Record {
  @Field var instructions: String?
}

struct GenerationOptionsRecord: Record {
  @Field var temperature: Double?
  @Field var maxTokens: Int?

  var settings: GenerationSettings {
    GenerationSettings(temperature: temperature, maxTokens: maxTokens)
  }
}
