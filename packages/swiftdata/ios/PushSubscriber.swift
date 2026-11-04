import ExpoModulesCore
import UIKit

/// Registers for silent pushes at launch, so iCloud can tell the app that another device changed something.
/// Core Data handles the pushes itself once the app is registered.
public class ExpoKitSwiftDataAppDelegateSubscriber: ExpoAppDelegateSubscriber {
  public func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> Bool {
    application.registerForRemoteNotifications()
    return false
  }
}
