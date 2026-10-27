import ExpoModulesCore

/// A conversation with the on-device model, as JS sees it.
final class ModelSessionObject: SharedObject {
  let conversation: ModelConversation

  init(instructions: String?) throws {
    do {
      conversation = try ModelConversation(instructions: instructions)
    } catch let error as ModelError {
      throw ModelException(error)
    }
    super.init()
  }
}
