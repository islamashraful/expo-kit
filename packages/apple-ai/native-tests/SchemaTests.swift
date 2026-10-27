import Foundation

// Schemas are written here as the JSON that JS sends (see src/schema.ts).

private func object(_ json: String) -> [String: Any] {
  (try? JSONSerialization.jsonObject(with: Data(json.utf8))) as? [String: Any] ?? [:]
}

private func ask(_ prompt: String, _ schema: String) async throws -> String {
  try await ModelConversation(instructions: nil).respondObject(to: prompt, schemaJSON: schema, settings: GenerationSettings())
}

func schemaTests() async throws {
  // Bad schemas fail before the model is asked, on any Mac
  await checkThrows("schema that isn't JSON", code: "invalidSchema") { _ = try decodeSchema("{") }
  await checkThrows("unknown kind", code: "invalidSchema") {
    _ = try await ask("Hi", #"{"kind":"date"}"#)
  }
  await checkThrows("enum without choices", code: "invalidSchema") {
    _ = try await ask("Hi", #"{"kind":"enum","choices":[]}"#)
  }

  guard modelAvailability() == "available" else {
    print("- skipped schema model tests: model is \(modelAvailability()) on this Mac")
    return
  }

  // Pull a contact out of text: strings, an optional field that isn't there, a choice
  let contact = object(try await ask(
    "Hi, I'm Jane Doe from Acme Corp. Reach me at jane@acme.test. We'd like to buy 40 licenses.",
    #"""
    {"kind":"object","properties":[
      {"name":"name","schema":{"kind":"string"},"optional":false},
      {"name":"company","schema":{"kind":"string"},"optional":false},
      {"name":"email","schema":{"kind":"string","description":"Email address"},"optional":false},
      {"name":"phone","schema":{"kind":"string","description":"Phone number, only if given"},"optional":true},
      {"name":"stage","schema":{"kind":"enum","choices":["lead","customer"],"description":"customer once they bought"},"optional":false}
    ]}
    """#
  ))
  check(contact["name"] as? String == "Jane Doe", "string field (got \(contact["name"] ?? "nil"))")
  check((contact["company"] as? String)?.contains("Acme") == true, "second string field (got \(contact["company"] ?? "nil"))")
  check(contact["email"] as? String == "jane@acme.test", "described field (got \(contact["email"] ?? "nil"))")
  check(["lead", "customer"].contains(contact["stage"] as? String ?? ""), "enum is one of the choices (got \(contact["stage"] ?? "nil"))")
  check(contact["phone"] == nil || contact["phone"] is NSNull, "optional field left out when not in the text (got \(contact["phone"] ?? "nil"))")

  // Numbers, booleans, a nested object and a list with limits
  let order = object(try await ask(
    "Order: 3 coffees at 2.5 euros each, to Main Street 5 in Berlin. Already paid. Tags: urgent, office, morning, extra.",
    #"""
    {"kind":"object","properties":[
      {"name":"quantity","schema":{"kind":"integer"},"optional":false},
      {"name":"unitPrice","schema":{"kind":"number"},"optional":false},
      {"name":"paid","schema":{"kind":"boolean"},"optional":false},
      {"name":"address","schema":{"kind":"object","properties":[
        {"name":"street","schema":{"kind":"string"},"optional":false},
        {"name":"city","schema":{"kind":"string"},"optional":false}
      ]},"optional":false},
      {"name":"tags","schema":{"kind":"array","items":{"kind":"string"},"minItems":1,"maxItems":2},"optional":false}
    ]}
    """#
  ))
  check(order["quantity"] as? Int == 3, "integer (got \(order["quantity"] ?? "nil"))")
  check((order["unitPrice"] as? Double).map { abs($0 - 2.5) < 0.001 } == true, "number (got \(order["unitPrice"] ?? "nil"))")
  check(order["paid"] as? Bool == true, "boolean (got \(order["paid"] ?? "nil"))")
  let address = order["address"] as? [String: Any]
  check((address?["city"] as? String) == "Berlin", "nested object (got \(address ?? [:]))")
  let tags = order["tags"] as? [String] ?? []
  check((1...2).contains(tags.count), "list keeps to its limits (got \(tags))")

  // A choice as the whole answer: classification
  let sentiment = try await ask(
    "Review: I love this app, it saves me an hour every day!",
    #"{"kind":"enum","choices":["positive","neutral","negative"]}"#
  )
  check(sentiment == #""positive""#, "enum as the whole answer (got \(sentiment))")

  // A list as the whole answer, with objects inside
  let list = try await ask(
    "Make a shopping list for pancakes.",
    #"{"kind":"array","items":{"kind":"object","properties":[{"name":"item","schema":{"kind":"string"},"optional":false},{"name":"amount","schema":{"kind":"string"},"optional":false}]},"minItems":2,"maxItems":5}"#
  )
  let items = (try? JSONSerialization.jsonObject(with: Data(list.utf8))) as? [[String: Any]] ?? []
  check((2...5).contains(items.count) && items.allSatisfy { $0["item"] is String }, "list of objects as the whole answer (got \(list))")

  // Stop while the answer is being written
  let long = try ModelConversation(instructions: nil)
  let writing = Task {
    try await long.respondObject(
      to: "List thirty animals.",
      schemaJSON: #"{"kind":"array","items":{"kind":"string"},"minItems":30,"maxItems":30}"#,
      settings: GenerationSettings()
    )
  }
  try await Task.sleep(nanoseconds: 200_000_000)
  long.cancel()
  await checkThrows("cancel structured output", code: "cancelled") { _ = try await writing.value }
}
