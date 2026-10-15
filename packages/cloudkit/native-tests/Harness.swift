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

func checkThrows(_ message: String, contains expected: String, file: String = #fileID, line: Int = #line, _ body: () throws -> Void) {
  do {
    try body()
    failures += 1
    print("✗ \(file):\(line) \(message): expected an error")
  } catch {
    let text = error.localizedDescription
    if text.contains(expected) { passes += 1 } else { failures += 1; print("✗ \(file):\(line) \(message): got \"\(text)\"") }
  }
}
