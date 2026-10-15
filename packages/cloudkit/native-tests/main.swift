import Foundation

let suites: [(String, () throws -> Void)] = [
  ("RecordMapper", mapperTests),
  ("LocalStore", localStoreTests),
]
for (name, run) in suites {
  do { try run() } catch { failures += 1; print("✗ \(name) threw \(error)") }
}
print("\(passes) passed, \(failures) failed")
exit(failures == 0 ? 0 : 1)
