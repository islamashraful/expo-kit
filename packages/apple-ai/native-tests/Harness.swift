import Foundation

var failures = 0
var passes = 0

func check(_ condition: @autoclosure () throws -> Bool, _ message: String, file: String = #fileID, line: Int = #line) {
  do {
    if try condition() { passes += 1 } else { failures += 1; print("✗ \(file):\(line) \(message)") }
  } catch {
    failures += 1
    print("✗ \(file):\(line) \(message) threw \(error)")
  }
}

/// Expects `body` to throw a ModelError with this code.
func checkThrows(_ message: String, code expected: String, file: String = #fileID, line: Int = #line, _ body: () async throws -> Void) async {
  do {
    try await body()
    failures += 1
    print("✗ \(file):\(line) \(message): expected an error")
  } catch let error as ModelError {
    if error.code == expected { passes += 1 } else { failures += 1; print("✗ \(file):\(line) \(message): got \(error.code): \(error.message)") }
  } catch {
    failures += 1
    print("✗ \(file):\(line) \(message): got a non-ModelError \(error)")
  }
}
