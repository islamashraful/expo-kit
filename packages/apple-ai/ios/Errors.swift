import ExpoModulesCore

/// A ModelError as JS sees it. JS reads `code` and turns it into an AppleAIError with the same code.
final class ModelException: Exception, @unchecked Sendable {
  let error: ModelError

  init(_ error: ModelError) {
    self.error = error
    super.init()
  }

  override var code: String { error.code }
  override var reason: String { error.message }
}

/// Runs a model call and hands its errors to JS as ModelException.
func forJS<T>(_ body: () async throws -> T) async throws -> T {
  do {
    return try await body()
  } catch let error as ModelError {
    throw ModelException(error)
  }
}
