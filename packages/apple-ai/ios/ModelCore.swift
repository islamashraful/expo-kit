import Foundation
#if canImport(FoundationModels)
import FoundationModels
#endif

// Everything that talks to the model, in plain Swift (no Expo types), so native-tests can run it on macOS.

/// Whether the on-device model can be used right now, or why not.
func modelAvailability() -> String {
  #if canImport(FoundationModels)
  if #available(iOS 26.0, macOS 26.0, *) {
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

struct GenerationSettings {
  var temperature: Double?
  var maxTokens: Int?
}

/// An error from the model. `code` is what JS sees as AppleAIError.code.
struct ModelError: Error, Equatable {
  let code: String
  let message: String

  static let unavailable = ModelError(code: "unavailable", message: "The on-device model needs iOS 26.")
}

/// A conversation with the model. Remembers earlier prompts and answers.
final class ModelConversation {
  // A LanguageModelSession. Stored as Any so this class also exists below iOS 26.
  private let session: Any

  init(instructions: String?) throws {
    #if canImport(FoundationModels)
    if #available(iOS 26.0, macOS 26.0, *) {
      session = LanguageModelSession(instructions: instructions)
      return
    }
    #endif
    throw ModelError.unavailable
  }

  var isResponding: Bool {
    #if canImport(FoundationModels)
    if #available(iOS 26.0, macOS 26.0, *), let session = session as? LanguageModelSession {
      return session.isResponding
    }
    #endif
    return false
  }

  func respond(to prompt: String, settings: GenerationSettings) async throws -> String {
    #if canImport(FoundationModels)
    if #available(iOS 26.0, macOS 26.0, *), let session = session as? LanguageModelSession {
      return try await askModel(session, prompt: prompt, settings: settings)
    }
    #endif
    throw ModelError.unavailable
  }
}

/// A single prompt in a fresh session, for calls that don't need the conversation.
func generateText(prompt: String, instructions: String?, settings: GenerationSettings) async throws -> String {
  try await ModelConversation(instructions: instructions).respond(to: prompt, settings: settings)
}

/// "GenerationError -1 ← SensitiveContentAnalysisML 15": the chain of underlying errors,
/// for model errors that come without a useful message.
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
@available(iOS 26.0, macOS 26.0, *)
private func askModel(_ session: LanguageModelSession, prompt: String, settings: GenerationSettings) async throws -> String {
  let options = GenerationOptions(temperature: settings.temperature, maximumResponseTokens: settings.maxTokens)
  do {
    return try await session.respond(to: prompt, options: options).content
  } catch let error as LanguageModelSession.GenerationError {
    throw modelError(error)
  } catch {
    throw ModelError(code: "unknown", message: "The model failed: \(errorChain(error as NSError))")
  }
}

@available(iOS 26.0, macOS 26.0, *)
private func modelError(_ error: LanguageModelSession.GenerationError) -> ModelError {
  let code: String
  let context: LanguageModelSession.GenerationError.Context?
  switch error {
  case .exceededContextWindowSize(let c): (code, context) = ("exceededContextWindowSize", c)
  case .assetsUnavailable(let c): (code, context) = ("assetsUnavailable", c)
  case .guardrailViolation(let c): (code, context) = ("guardrailViolation", c)
  case .unsupportedGuide(let c): (code, context) = ("unsupportedGuide", c)
  case .unsupportedLanguageOrLocale(let c): (code, context) = ("unsupportedLanguageOrLocale", c)
  case .decodingFailure(let c): (code, context) = ("decodingFailure", c)
  case .rateLimited(let c): (code, context) = ("rateLimited", c)
  case .concurrentRequests(let c): (code, context) = ("concurrentRequests", c)
  case .refusal(_, let c): (code, context) = ("refusal", c)
  @unknown default: (code, context) = ("unknown", nil)
  }
  // Apple's debugDescription says more than localizedDescription, e.g. which limit was hit.
  let detail = context?.debugDescription ?? ""
  return ModelError(code: code, message: detail.isEmpty ? error.localizedDescription : detail)
}
#endif
