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
