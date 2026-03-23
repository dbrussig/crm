import SwiftUI
import WebKit

struct WebViewContainer: NSViewRepresentable {
    func makeCoordinator() -> WebBridge {
        WebBridge()
    }

    func makeNSView(context: Context) -> WKWebView {
        let contentController = WKUserContentController()
        contentController.add(context.coordinator, name: "mietparkCRM")

        let configuration = WKWebViewConfiguration()
        configuration.userContentController = contentController

        let webView = WKWebView(frame: .zero, configuration: configuration)
        context.coordinator.attach(webView: webView)

        if let url = WebAssetLoader.appURL() {
            webView.loadFileURL(url, allowingReadAccessTo: url.deletingLastPathComponent())
        } else {
            webView.loadHTMLString("<html><body><h1>WebApp fehlt</h1></body></html>", baseURL: nil)
        }

        return webView
    }

    func updateNSView(_ nsView: WKWebView, context: Context) {
    }
}
