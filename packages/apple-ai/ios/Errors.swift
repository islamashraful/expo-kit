import ExpoModulesCore
#if canImport(FoundationModels)
import FoundationModels
#endif

// JS reads `code` and turns it into an AppleAIError with the same code.

/// Thrown below iOS 26. JS checks availability first, so this is rare.
final class ModelUnavailableException: Exception, @unchecked Sendable {
  override var code: String { "unavailable" }
  override var reason: String { "The on-device model needs iOS 26." }
}

/// Any other error from the model. Apple often leaves these without a message, so the reason lists
/// the chain of underlying errors, e.g. "GenerationError -1 ← SensitiveContentAnalysisML 15".
final class ModelException: Exception, @unchecked Sendable {
  let error: Error

  init(_ error: Error) {
    self.error = error
    super.init()
  }

  override var code: String { "unknown" }
  override var reason: String { "The model failed: \(errorChain(error as NSError))" }
}

func errorChain(_ error: NSError) -> String {
  var parts: [String] = []
  var current: NSError? = error
  while let error = current, parts.count < 8 {
    let part = "\(error.domain.split(separator: ".").last ?? "") \(error.code)"
    if parts.last != part { parts.append(part) }
    current = (error.userInfo[NSMultipleUnderlyingErrorsKey] as? [NSError])?.first
      ?? error.userInfo[NSUnderlyingErrorKey] as? NSError
  }
  return parts.joined(separator: " ← ")
}

#if canImport(FoundationModels)
@available(iOS 26.0, *)
final class GenerationException: Exception, @unchecked Sendable {
  let error: LanguageModelSession.GenerationError

  init(_ error: LanguageModelSession.GenerationError) {
    self.error = error
    super.init()
  }

  override var code: String {
    switch error {
    case .exceededContextWindowSize: return "exceededContextWindowSize"
    case .assetsUnavailable: return "assetsUnavailable"
    case .guardrailViolation: return "guardrailViolation"
    case .unsupportedGuide: return "unsupportedGuide"
    case .unsupportedLanguageOrLocale: return "unsupportedLanguageOrLocale"
    case .decodingFailure: return "decodingFailure"
    case .rateLimited: return "rateLimited"
    case .concurrentRequests: return "concurrentRequests"
    case .refusal: return "refusal"
    @unknown default: return "unknown"
    }
  }

  override var reason: String { error.localizedDescription }
}
#endif
