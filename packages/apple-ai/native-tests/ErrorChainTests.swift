import Foundation

func errorChainTests() async throws {
  let inner = NSError(domain: "ModelManagerServices.ModelManagerError", code: 1001)
  let middle = NSError(domain: "com.apple.SensitiveContentAnalysisML", code: 15, userInfo: [NSMultipleUnderlyingErrorsKey: [inner]])
  let wrapper = NSError(domain: "FoundationModels.LanguageModelSession.GenerationError", code: -1, userInfo: [NSMultipleUnderlyingErrorsKey: [middle]])
  let outer = NSError(domain: "FoundationModels.LanguageModelSession.GenerationError", code: -1, userInfo: [NSMultipleUnderlyingErrorsKey: [wrapper]])

  check(
    errorChain(outer) == "GenerationError -1 ← SensitiveContentAnalysisML 15 ← ModelManagerError 1001",
    "lists underlying errors, last part of each domain, repeats removed"
  )
  check(
    errorChain(NSError(domain: "A", code: 1, userInfo: [NSUnderlyingErrorKey: NSError(domain: "B", code: 2)])) == "A 1 ← B 2",
    "follows NSUnderlyingErrorKey too"
  )
  check(errorChain(NSError(domain: "Plain", code: 7)) == "Plain 7", "a single error")
}
