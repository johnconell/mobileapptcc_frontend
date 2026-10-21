import ExpoModulesCore
import UIKit

public final class GuidedAccessModule: Module {
  private var observer: NSObjectProtocol?

  public func definition() -> ModuleDefinition {
    Name("ExpoGuidedAccess")
    Events("onGuidedAccessStatusChanged")

    Function("isGuidedAccessEnabled") { () -> Bool in
      return UIAccessibility.isGuidedAccessEnabled
    }

    OnCreate {
      self.observer = NotificationCenter.default.addObserver(
        forName: UIAccessibility.guidedAccessStatusDidChangeNotification,
        object: nil,
        queue: .main
      ) { [weak self] _ in
        self?.sendEvent("onGuidedAccessStatusChanged", [
          "enabled": UIAccessibility.isGuidedAccessEnabled
        ])
      }
    }

    OnDestroy {
      if let observer = self.observer {
        NotificationCenter.default.removeObserver(observer)
        self.observer = nil
      }
    }
  }
}
