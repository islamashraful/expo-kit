import ExpoModulesCore

public class ExpoKitAppleAIModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ExpoKitAppleAI")

    Function("availability") { () -> String in
      modelAvailability()
    }

    // One-off calls use a short-lived session from JS too, so they can stream and be cancelled the same way.
    Class("ModelSession", ModelSessionObject.self) {
      Constructor { (options: SessionOptionsRecord) throws -> ModelSessionObject in
        try ModelSessionObject(instructions: options.instructions)
      }

      Property("isResponding") { (session: ModelSessionObject) -> Bool in
        session.conversation.isResponding
      }

      AsyncFunction("respond") { (session: ModelSessionObject, prompt: String, options: GenerationOptionsRecord) async throws -> String in
        try await forJS {
          try await session.conversation.respond(to: prompt, settings: options.settings)
        }
      }

      // Same as respond, and sends the answer so far as a "text" event each time it grows.
      AsyncFunction("streamResponse") { (session: ModelSessionObject, prompt: String, options: GenerationOptionsRecord) async throws -> String in
        try await forJS {
          try await session.conversation.respond(to: prompt, settings: options.settings) { [weak session] text in
            session?.emit(event: "text", payload: text)
          }
        }
      }

      Function("cancel") { (session: ModelSessionObject) in
        session.conversation.cancel()
      }
    }
  }
}
