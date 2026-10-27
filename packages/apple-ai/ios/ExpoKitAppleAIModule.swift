import ExpoModulesCore
#if canImport(FoundationModels)
import FoundationModels
#endif

public class ExpoKitAppleAIModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ExpoKitAppleAI")

    Function("availability") { () -> String in
      modelAvailability()
    }

    AsyncFunction("generateText") { (prompt: String, options: GenerationOptionsRecord) async throws -> String in
      try await generateText(prompt: prompt, options: options)
    }

    Class("ModelSession", ModelSessionObject.self) {
      Constructor { (options: SessionOptionsRecord) throws -> ModelSessionObject in
        try ModelSessionObject(instructions: options.instructions)
      }

      Property("isResponding") { (session: ModelSessionObject) -> Bool in
        session.isResponding
      }

      AsyncFunction("respond") { (session: ModelSessionObject, prompt: String, options: GenerationOptionsRecord) async throws -> String in
        try await session.respond(to: prompt, options: options)
      }
    }
  }
}

/// Whether the on-device model can be used right now, or why not.
func modelAvailability() -> String {
  #if canImport(FoundationModels)
  if #available(iOS 26.0, *) {
    switch SystemLanguageModel.default.availability {
    case .available:
      return "available"
    case .unavailable(.deviceNotEligible):
      return "deviceNotEligible"
    case .unavailable(.appleIntelligenceNotEnabled):
      return "appleIntelligenceNotEnabled"
    case .unavailable(.modelNotReady):
      return "modelNotReady"
    case .unavailable:
      return "unknown"
    }
  }
  #endif
  return "unsupportedOS"
}
