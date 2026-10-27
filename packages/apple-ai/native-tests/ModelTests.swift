import Foundation

// Runs real prompts against the on-device model. Answers vary, so checks look for what must be there.

func modelTests() async throws {
  let availability = modelAvailability()
  guard availability == "available" else {
    print("- skipped model tests: model is \(availability) on this Mac")
    return
  }

  // Single prompt
  let answer = try await generateText(
    prompt: "What is the capital of France?",
    instructions: "Answer in one short sentence.",
    settings: GenerationSettings()
  )
  check(answer.contains("Paris"), "single prompt answers (got \"\(answer)\")")

  // Instructions are followed
  let shouted = try await generateText(
    prompt: "Say hello.",
    instructions: "Reply with exactly one word, in all capital letters.",
    settings: GenerationSettings(temperature: 0)
  )
  check(shouted == shouted.uppercased() && !shouted.isEmpty, "instructions are followed (got \"\(shouted)\")")

  // maxTokens cuts the answer off
  let short = try await generateText(
    prompt: "Write a long story about the sea.",
    instructions: nil,
    settings: GenerationSettings(maxTokens: 10)
  )
  check(short.split(separator: " ").count <= 12, "maxTokens limits the answer (got \(short.split(separator: " ").count) words)")

  // A conversation remembers earlier questions
  let conversation = try ModelConversation(instructions: "Answer in one short sentence.")
  _ = try await conversation.respond(to: "My name is Sam. Please remember it.", settings: GenerationSettings())
  let recalled = try await conversation.respond(to: "What is my name?", settings: GenerationSettings())
  check(recalled.contains("Sam"), "conversation remembers (got \"\(recalled)\")")
  check(!conversation.isResponding, "not responding once the answer is back")

  // A fresh call doesn't
  let fresh = try await generateText(prompt: "What is my name?", instructions: "Answer in one short sentence.", settings: GenerationSettings())
  check(!fresh.contains("Sam"), "single prompts don't share memory (got \"\(fresh)\")")

  // Errors keep their code
  let tooLong = String(repeating: "This sentence is here to fill the context window. ", count: 2_000)
  await checkThrows("prompt too long", code: "exceededContextWindowSize") {
    _ = try await generateText(prompt: tooLong, instructions: nil, settings: GenerationSettings())
  }

  let busy = try ModelConversation(instructions: nil)
  async let first = busy.respond(to: "Count from one to twenty in words.", settings: GenerationSettings())
  try await Task.sleep(nanoseconds: 50_000_000)
  await checkThrows("second question while the first is answering", code: "concurrentRequests") {
    _ = try await busy.respond(to: "Hi", settings: GenerationSettings())
  }
  _ = try await first
}
