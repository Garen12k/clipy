import ExpoModulesCore
import AVFoundation

public class ClipyVideoModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ClipyVideo")

    // Phase 0 smoke test: proves the Swift module is linked and callable.
    Function("hello") { () -> String in
      let version = ProcessInfo.processInfo.operatingSystemVersionString
      return "Hello from ClipyVideo (Swift, AVFoundation) on iOS \(version)"
    }
  }
}
