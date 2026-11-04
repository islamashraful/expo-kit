import Foundation

do { try await itemStoreTests() } catch { failures += 1; print("✗ ItemStore threw \(error)") }
statusTrackerTests()
print("\(passes) passed, \(failures) failed")
exit(failures == 0 ? 0 : 1)
