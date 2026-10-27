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
  static let cancelled = ModelError(code: "cancelled", message: "The answer was cancelled.")
}

/// A conversation with the model. Remembers earlier prompts and answers.
final class ModelConversation: @unchecked Sendable {
  // A LanguageModelSession. Stored as Any so this class also exists below iOS 26.
  private let session: Any
  // The answer being written, so cancel() can stop it. Guarded by `lock`.
  private var task: Task<String, Error>?
  private let lock = NSLock()

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

  /// The whole answer at once. With `onText`, the answer so far is passed in each time it grows.
  func respond(to prompt: String, settings: GenerationSettings, onText: (@Sendable (String) -> Void)? = nil) async throws -> String {
    #if canImport(FoundationModels)
    if #available(iOS 26.0, macOS 26.0, *), let session = session as? LanguageModelSession {
      return try await run {
        try await askModel(session, prompt: prompt, settings: settings, onText: onText)
      }
    }
    #endif
    throw ModelError.unavailable
  }

  /// An answer in the shape `schemaJSON` describes (see SchemaCore), returned as JSON.
  func respondObject(to prompt: String, schemaJSON: String, settings: GenerationSettings) async throws -> String {
    let spec = try decodeSchema(schemaJSON)
    #if canImport(FoundationModels)
    if #available(iOS 26.0, macOS 26.0, *), let session = session as? LanguageModelSession {
      let schema = try generationSchema(spec)
      return try await run {
        try await withModelErrors {
          try await session.respond(to: prompt, schema: schema, options: GenerationOptions(settings)).content.jsonString
        }
      }
    }
    #endif
    throw ModelError.unavailable
  }

  /// Stops the answer being written. Its call throws ModelError.cancelled.
  func cancel() {
    lock.withLock { task }?.cancel()
  }

  private func run(_ body: @escaping @Sendable () async throws -> String) async throws -> String {
    let task = Task { try await body() }
    lock.withLock { self.task = task }
    defer {
      lock.withLock {
        if self.task == task { self.task = nil }
      }
    }
    let text = try await withTaskCancellationHandler {
      try await task.value
    } onCancel: {
      task.cancel()
    }
    // A cancelled stream can end quietly instead of throwing.
    if task.isCancelled { throw ModelError.cancelled }
    return text
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
private func askModel(
  _ session: LanguageModelSession,
  prompt: String,
  settings: GenerationSettings,
  onText: (@Sendable (String) -> Void)?
) async throws -> String {
  let options = GenerationOptions(settings)
  return try await withModelErrors {
    guard let onText else {
      return try await session.respond(to: prompt, options: options).content
    }
    var text = ""
    // Each snapshot is the whole answer so far, not just the new part.
    for try await snapshot in session.streamResponse(to: prompt, options: options) {
      text = snapshot.content
      onText(text)
    }
    return text
  }
}

/// Turns whatever the model throws into a ModelError.
@available(iOS 26.0, macOS 26.0, *)
private func withModelErrors(_ body: () async throws -> String) async throws -> String {
  do {
    return try await body()
  } catch let error as ModelError {
    throw error
  } catch is CancellationError {
    throw ModelError.cancelled
  } catch let error as LanguageModelSession.GenerationError {
    throw modelError(error)
  } catch {
    if Task.isCancelled { throw ModelError.cancelled }
    throw ModelError(code: "unknown", message: "The model failed: \(errorChain(error as NSError))")
  }
}

@available(iOS 26.0, macOS 26.0, *)
extension GenerationOptions {
  init(_ settings: GenerationSettings) {
    self.init(temperature: settings.temperature, maximumResponseTokens: settings.maxTokens)
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
