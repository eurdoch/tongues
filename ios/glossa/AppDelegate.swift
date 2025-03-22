import UIKit
import React
import React_RCTAppDelegate
import ReactAppDependencyProvider

@main
class AppDelegate: RCTAppDelegate {
  override func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey : Any]? = nil) -> Bool {
    self.moduleName = "glossa"
    self.dependencyProvider = RCTAppDependencyProvider()

    // You can add your custom initial props in the dictionary below.
    // They will be passed down to the ViewController used by React Native.
    self.initialProps = [:]
    
    // Check if app was launched from a file
    if let url = launchOptions?[UIApplication.LaunchOptionsKey.url] as? URL {
      _ = handleOpenURL(url)
    }

    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }
  
  // Handle files opened when app is already running
  override func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
    return handleOpenURL(url)
  }
  
  // Handle universal links
  override func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
    if userActivity.activityType == NSUserActivityTypeBrowsingWeb, let url = userActivity.webpageURL {
      return handleOpenURL(url)
    }
    return false
  }
  
  // Helper method to process opened files
  func handleOpenURL(_ url: URL) -> Bool {
    // Wait for React Native to load
    DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) {
      // Get RCTBridge instance
      if let bridge = RCTBridge.current() {
        // Send the event to React Native directly using DeviceEventEmitter
        let js = "require('react-native').DeviceEventEmitter.emit('openEpubFile', {uri: '\(url.path)'})"
        bridge.enqueueJSCall("RCTDeviceEventEmitter", method: "emit", args: ["openEpubFile", ["uri": url.path]], completion: nil)
      }
    }
    return true
  }

  override func sourceURL(for bridge: RCTBridge) -> URL? {
    self.bundleURL()
  }

  override func bundleURL() -> URL? {
#if DEBUG
    RCTBundleURLProvider.sharedSettings().jsBundleURL(forBundleRoot: "index")
#else
    Bundle.main.url(forResource: "main", withExtension: "jsbundle")
#endif
  }
}