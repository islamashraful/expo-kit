import Foundation

/// Collects what onText sends, from whatever thread the model calls it on.
final class TextLog: @unchecked Sendable {
  private var texts: [String] = []
  private let lock = NSLock()

  func add(_ text: String) { lock.withLock { texts.append(text) } }
  var all: [String] { lock.withLock { texts } }
}

func streamTests() async throws {
  guard modelAvailability() == "available" else {
    print("- skipped stream tests: model is \(modelAvailability()) on this Mac")
    return
  }

  // The answer arrives in growing pieces, and the last one is the result
  let log = TextLog()
  let streamed = try await ModelConversation(instructions: nil).respond(
    to: "Name five fruits, one per line.",
    settings: GenerationSettings(),
    onText: { log.add($0) }
  )
  let texts = log.all
  check(texts.count > 1, "streams in more than one piece (got \(texts.count))")
  check(zip(texts, texts.dropFirst()).allSatisfy { $0.count <= $1.count }, "each piece is the whole answer so far")
  check(texts.last == streamed, "the result is the last piece")

  // Cancel while streaming
  let streaming = try ModelConversation(instructions: nil)
  await checkThrows("cancel during a stream", code: "cancelled") {
    _ = try await streaming.respond(
      to: "Write a long story about the sea.",
      settings: GenerationSettings(),
      onText: { _ in streaming.cancel() }
    )
  }

  // Cancel without streaming
  let waiting = try ModelConversation(instructions: nil)
  let waited = Task { try await waiting.respond(to: "Write a long story about the sea.", settings: GenerationSettings()) }
  try await Task.sleep(nanoseconds: 200_000_000)
  waiting.cancel()
  await checkThrows("cancel a whole-answer call", code: "cancelled") { _ = try await waited.value }

  // Still usable afterwards, and cancelling with nothing running does nothing
  waiting.cancel()
  let after = try await waiting.respond(to: "What is 2 + 2? Answer with the number.", settings: GenerationSettings())
  check(after.contains("4"), "the conversation works after a cancel (got \"\(after)\")")
}
