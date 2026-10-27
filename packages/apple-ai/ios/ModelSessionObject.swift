import ExpoModulesCore
#if canImport(FoundationModels)
import FoundationModels
#endif

/// A conversation with the on-device model, as JS sees it. Remembers earlier prompts and answers.
final class ModelSessionObject: SharedObject {
  // A LanguageModelSession. Stored as Any so this class also exists below iOS 26.
  private let session: Any

  init(instructions: String?) throws {
    #if canImport(FoundationModels)
    if #available(iOS 26.0, *) {
      session = LanguageModelSession(instructions: instructions)
      super.init()
      return
    }
    #endif
    throw ModelUnavailableException()
  }

  var isResponding: Bool {
    #if canImport(FoundationModels)
    if #available(iOS 26.0, *), let session = session as? LanguageModelSession {
      return session.isResponding
    }
    #endif
    return false
  }

  func respond(to prompt: String, options: GenerationOptionsRecord) async throws -> String {
    #if canImport(FoundationModels)
    if #available(iOS 26.0, *), let session = session as? LanguageModelSession {
      return try await askModel(session, prompt: prompt, options: options)
    }
    #endif
    throw ModelUnavailableException()
  }
}

/// A single prompt in a fresh session, for calls that don't need the conversation.
func generateText(prompt: String, options: GenerationOptionsRecord) async throws -> String {
  #if canImport(FoundationModels)
  if #available(iOS 26.0, *) {
    let session = LanguageModelSession(instructions: options.instructions)
    return try await askModel(session, prompt: prompt, options: options)
  }
  #endif
  throw ModelUnavailableException()
}

#if canImport(FoundationModels)
@available(iOS 26.0, *)
private func askModel(_ session: LanguageModelSession, prompt: String, options: GenerationOptionsRecord) async throws -> String {
  do {
    return try await session.respond(to: prompt, options: options.toGenerationOptions()).content
  } catch let error as LanguageModelSession.GenerationError {
    throw GenerationException(error)
  } catch {
    throw ModelException(error)
  }
}
#endif
