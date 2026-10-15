import ExpoModulesCore
import UIKit

/// Registers for silent pushes at launch. CKSyncEngine creates the CloudKit subscription
/// and fetches changes when a push arrives, so a change on one device shows up on the others.
public class ExpoKitCloudKitAppDelegateSubscriber: ExpoAppDelegateSubscriber {
  public func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> Bool {
    application.registerForRemoteNotifications()
    return false
  }
}
