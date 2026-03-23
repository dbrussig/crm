import SwiftUI

@main
struct MietparkCRMApp: App {
    var body: some Scene {
        WindowGroup {
            WebViewContainer()
                .frame(minWidth: 1200, minHeight: 780)
        }
    }
}
