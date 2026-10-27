import Foundation

let suites: [(String, () async throws -> Void)] = [
  ("errorChain", errorChainTests),
  ("Model", modelTests),
  ("Stream", streamTests),
  ("Schema", schemaTests),
]
for (name, run) in suites {
  do { try await run() } catch { failures += 1; print("✗ \(name) threw \(error)") }
}
print("\(passes) passed, \(failures) failed")
exit(failures == 0 ? 0 : 1)
