import ExpoModulesCore

public class ExpoKitAppleAIModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ExpoKitAppleAI")

    Function("availability") { () -> String in
      modelAvailability()
    }

    AsyncFunction("generateText") { (prompt: String, options: GenerationOptionsRecord) async throws -> String in
      try await forJS {
        try await generateText(prompt: prompt, instructions: options.instructions, settings: options.settings)
      }
    }

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
    }
  }
}
